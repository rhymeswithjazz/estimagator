using System.ComponentModel.DataAnnotations;

namespace PokerPoints.Api.Authentication;

public record RegisterRequest(
    [Required][EmailAddress] string Email,
    [Required][MinLength(6)] string Password,
    [Required][MaxLength(100)] string DisplayName
);

public record LoginRequest(
    [Required][EmailAddress] string Email,
    [Required] string Password
);

public record RefreshTokenRequest(
    [Required] string RefreshToken
);

public record AuthResponse(
    string AccessToken,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User
);

public record UserDto(
    Guid Id,
    string Email,
    string DisplayName,
    DateTime CreatedAt,
    bool EmailVerified
);

public record ExternalLoginRequest(
    [Required] string IdToken
);

public record VerifyEmailRequest(
    [Required] string Token
);

public record ForgotPasswordRequest(
    [Required][EmailAddress] string Email
);

public record ResetPasswordRequest(
    [Required] string Token,
    [Required][MinLength(6)] string NewPassword
);

public record ResendVerificationRequest(
    [Required][EmailAddress] string Email
);
