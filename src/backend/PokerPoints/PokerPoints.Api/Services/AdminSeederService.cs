using Microsoft.EntityFrameworkCore;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface IAdminSeederService
{
    Task SeedAdminUserAsync();
}

public class AdminSeederService : IAdminSeederService
{
    private readonly PokerPointsDbContext _db;
    private readonly ILogger<AdminSeederService> _logger;
    private readonly IConfiguration _configuration;

    public AdminSeederService(
        PokerPointsDbContext db,
        ILogger<AdminSeederService> logger,
        IConfiguration configuration)
    {
        _db = db;
        _logger = logger;
        _configuration = configuration;
    }

    public async Task SeedAdminUserAsync()
    {
        _logger.LogInformation("Starting admin user seeding...");

        var adminEmail = _configuration["ADMIN_EMAIL"]
            ?? Environment.GetEnvironmentVariable("ADMIN_EMAIL");
        var adminPassword = _configuration["ADMIN_PASSWORD"]
            ?? Environment.GetEnvironmentVariable("ADMIN_PASSWORD");

        _logger.LogInformation(
            "Admin config - Email configured: {EmailSet}, Password configured: {PasswordSet}",
            !string.IsNullOrEmpty(adminEmail),
            !string.IsNullOrEmpty(adminPassword));

        if (string.IsNullOrEmpty(adminEmail) || string.IsNullOrEmpty(adminPassword))
        {
            _logger.LogWarning("Admin credentials not configured (ADMIN_EMAIL and/or ADMIN_PASSWORD missing). Skipping admin seeding.");
            return;
        }

        var normalizedEmail = adminEmail.ToLowerInvariant();
        var existingAdmin = await _db.Users
            .FirstOrDefaultAsync(u => u.Email == normalizedEmail);

        if (existingAdmin != null)
        {
            _logger.LogInformation("Found existing user {Email} with role {Role}", existingAdmin.Email, existingAdmin.Role);
            if (existingAdmin.Role != UserRole.Admin)
            {
                existingAdmin.Role = UserRole.Admin;
                await _db.SaveChangesAsync();
                _logger.LogInformation("Upgraded existing user {Email} to Admin role", adminEmail);
            }
            else
            {
                _logger.LogInformation("Admin user {Email} already exists with Admin role. No action needed.", adminEmail);
            }
            return;
        }

        _logger.LogInformation("No existing user found for {Email}. Creating new admin user...", adminEmail);

        var adminUser = new User
        {
            Email = normalizedEmail,
            DisplayName = "Administrator",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(adminPassword),
            CreatedAt = DateTime.UtcNow,
            EmailVerified = true,
            Role = UserRole.Admin
        };

        _db.Users.Add(adminUser);
        await _db.SaveChangesAsync();
        _logger.LogInformation("Successfully created admin user with email {Email}", adminEmail);
    }
}
