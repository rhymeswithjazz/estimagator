using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Hubs;
using PokerPoints.Api.Services;
using PokerPoints.Data;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<PokerPointsDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Services
builder.Services.AddScoped<ISessionService, SessionService>();
builder.Services.AddScoped<IParticipantService, ParticipantService>();
builder.Services.AddScoped<IVotingService, VotingService>();

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

// CORS must be before routing
app.UseCors("AllowAngularDev");

app.UseRouting();

app.MapControllers();
app.MapHub<PokerHub>("/hubs/poker");

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.Run();
