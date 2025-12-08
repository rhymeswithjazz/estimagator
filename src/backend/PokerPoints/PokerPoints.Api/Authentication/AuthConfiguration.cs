namespace PokerPoints.Api.Authentication;

public class AuthConfiguration
{
    public string Provider { get; set; } = "Mock";
    public JwtConfiguration Jwt { get; set; } = new();
    public MicrosoftConfiguration Microsoft { get; set; } = new();
}

public class JwtConfiguration
{
    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = "Estimagator";
    public string Audience { get; set; } = "Estimagator";
    public int AccessTokenExpirationMinutes { get; set; } = 60;
    public int RefreshTokenExpirationDays { get; set; } = 7;
}

public class MicrosoftConfiguration
{
    public string ClientId { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
}
