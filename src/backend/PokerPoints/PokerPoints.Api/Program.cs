using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Hubs;
using PokerPoints.Api.Services;
using PokerPoints.Data;

// Load .env file if present (for local development)
DotNetEnv.Env.TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<PokerPointsDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Authentication configuration
var authConfig = builder.Configuration.GetSection("Authentication").Get<AuthConfiguration>()
    ?? new AuthConfiguration();
builder.Services.Configure<AuthConfiguration>(builder.Configuration.GetSection("Authentication"));

// Email configuration
builder.Services.Configure<EmailConfiguration>(builder.Configuration.GetSection("Email"));

// JWT Authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = authConfig.Jwt.Issuer,
        ValidAudience = authConfig.Jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(authConfig.Jwt.Secret))
    };

    // Allow JWT from query string for SignalR
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;

            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }

            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// Auth services
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IEmailService, EmailService>();

// Services
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IParticipantService, ParticipantService>();
builder.Services.AddScoped<IVotingService, VotingService>();
builder.Services.AddScoped<IAdminSeederService, AdminSeederService>();
builder.Services.AddScoped<IAdminService, AdminService>();

// SignalR
builder.Services.AddSignalR();

// CORS for Angular dev server
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAngularDev", policy =>
    {
        policy.WithOrigins("http://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// Controllers
builder.Services.AddControllers();

var app = builder.Build();

// Apply pending migrations and seed admin user on startup
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();

    logger.LogInformation("Applying database migrations...");
    db.Database.Migrate();
    logger.LogInformation("Database migrations complete.");

    try
    {
        var adminSeeder = scope.ServiceProvider.GetRequiredService<IAdminSeederService>();
        await adminSeeder.SeedAdminUserAsync();
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to seed admin user");
    }
}

// CORS must be before routing
app.UseCors("AllowAngularDev");

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<PokerHub>("/hubs/poker");

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

await app.RunAsync();
