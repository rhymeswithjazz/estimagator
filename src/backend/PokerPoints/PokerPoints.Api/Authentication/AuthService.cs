using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Authentication;

public interface IAuthService
{
    Task<(AuthResponse? Response, string? VerificationToken)> RegisterAsync(RegisterRequest request);
    Task<AuthResponse?> LoginAsync(LoginRequest request);
    Task<AuthResponse?> RefreshTokenAsync(string refreshToken);
    Task<User?> GetUserByIdAsync(Guid userId);
    Task<User?> GetUserByEmailAsync(string email);
    Task RevokeRefreshTokenAsync(Guid userId);
    Task<bool> VerifyEmailAsync(string token);
    Task<string?> GeneratePasswordResetTokenAsync(string email);
    Task<bool> ResetPasswordAsync(string token, string newPassword);
    Task<string?> ResendVerificationEmailAsync(string email);
}

public class AuthService : IAuthService
{
    private readonly PokerPointsDbContext _context;
    private readonly IJwtTokenService _tokenService;
    private readonly AuthConfiguration _config;

    public AuthService(
        PokerPointsDbContext context,
        IJwtTokenService tokenService,
        IOptions<AuthConfiguration> config)
    {
        _context = context;
        _tokenService = tokenService;
        _config = config.Value;
    }

    public async Task<(AuthResponse? Response, string? VerificationToken)> RegisterAsync(RegisterRequest request)
    {
        var existingUser = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email.ToLowerInvariant());

        if (existingUser != null)
        {
            return (null, null);
        }

        var verificationToken = GenerateSecureToken();

        var user = new User
        {
            Email = request.Email.ToLowerInvariant(),
            DisplayName = request.DisplayName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow,
            EmailVerified = false,
            EmailVerificationToken = verificationToken,
            EmailVerificationTokenExpiresAt = DateTime.UtcNow.AddHours(24)
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var response = await GenerateAuthResponseAsync(user);
        return (response, verificationToken);
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == request.Email.ToLowerInvariant());

        if (user == null || string.IsNullOrEmpty(user.PasswordHash))
        {
            return null;
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return null;
        }

        return await GenerateAuthResponseAsync(user);
    }

    public async Task<AuthResponse?> RefreshTokenAsync(string refreshToken)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u =>
                u.RefreshToken == refreshToken &&
                u.RefreshTokenExpiresAt > DateTime.UtcNow);

        if (user == null)
        {
            return null;
        }

        return await GenerateAuthResponseAsync(user);
    }

    public async Task<User?> GetUserByIdAsync(Guid userId)
    {
        return await _context.Users.FindAsync(userId);
    }

    public async Task<User?> GetUserByEmailAsync(string email)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant());
    }

    public async Task RevokeRefreshTokenAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user != null)
        {
            user.RefreshToken = null;
            user.RefreshTokenExpiresAt = null;
            await _context.SaveChangesAsync();
        }
    }

    public async Task<bool> VerifyEmailAsync(string token)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u =>
                u.EmailVerificationToken == token &&
                u.EmailVerificationTokenExpiresAt > DateTime.UtcNow);

        if (user == null)
        {
            return false;
        }

        user.EmailVerified = true;
        user.EmailVerificationToken = null;
        user.EmailVerificationTokenExpiresAt = null;
        await _context.SaveChangesAsync();

        return true;
    }

    public async Task<string?> GeneratePasswordResetTokenAsync(string email)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant());

        if (user == null)
        {
            return null;
        }

        var resetToken = GenerateSecureToken();
        user.PasswordResetToken = resetToken;
        user.PasswordResetTokenExpiresAt = DateTime.UtcNow.AddMinutes(60);
        await _context.SaveChangesAsync();

        return resetToken;
    }

    public async Task<bool> ResetPasswordAsync(string token, string newPassword)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u =>
                u.PasswordResetToken == token &&
                u.PasswordResetTokenExpiresAt > DateTime.UtcNow);

        if (user == null)
        {
            return false;
        }

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiresAt = null;
        user.RefreshToken = null;
        user.RefreshTokenExpiresAt = null;
        await _context.SaveChangesAsync();

        return true;
    }

    public async Task<string?> ResendVerificationEmailAsync(string email)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant());

        if (user == null || user.EmailVerified)
        {
            return null;
        }

        var verificationToken = GenerateSecureToken();
        user.EmailVerificationToken = verificationToken;
        user.EmailVerificationTokenExpiresAt = DateTime.UtcNow.AddHours(24);
        await _context.SaveChangesAsync();

        return verificationToken;
    }

    private static string GenerateSecureToken()
    {
        var bytes = new byte[32];
        using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }

    private async Task<AuthResponse> GenerateAuthResponseAsync(User user)
    {
        var accessToken = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken = refreshToken;
        user.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(_config.Jwt.RefreshTokenExpirationDays);

        await _context.SaveChangesAsync();

        return new AuthResponse(
            AccessToken: accessToken,
            RefreshToken: refreshToken,
            ExpiresAt: DateTime.UtcNow.AddMinutes(_config.Jwt.AccessTokenExpirationMinutes),
            User: new UserDto(
                Id: user.Id,
                Email: user.Email ?? "",
                DisplayName: user.DisplayName ?? "",
                CreatedAt: user.CreatedAt,
                EmailVerified: user.EmailVerified,
                Role: user.Role.ToString()
            )
        );
    }
}
