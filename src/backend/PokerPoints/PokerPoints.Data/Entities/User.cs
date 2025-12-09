namespace PokerPoints.Data.Entities;

public class User
{
    public Guid Id { get; set; }
    public string? Email { get; set; }
    public string? PasswordHash { get; set; }
    public string? DisplayName { get; set; }
    public DateTime CreatedAt { get; set; }

    // For Microsoft SSO users, store their external ID
    public string? ExternalId { get; set; }
    public string? ExternalProvider { get; set; }

    // Refresh token for JWT auth
    public string? RefreshToken { get; set; }
    public DateTime? RefreshTokenExpiresAt { get; set; }

    // Email verification
    public bool EmailVerified { get; set; }
    public string? EmailVerificationToken { get; set; }
    public DateTime? EmailVerificationTokenExpiresAt { get; set; }

    // Password reset
    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiresAt { get; set; }

    public ICollection<Session> Sessions { get; set; } = new List<Session>();
}
