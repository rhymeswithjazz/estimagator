using System.Security.Cryptography;
using System.Text;

namespace PokerPoints.Api.Services;

public static class GuestHostToken
{
    public static string Generate()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    public static string Hash(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token.Trim()));
        return Convert.ToHexString(bytes);
    }

    public static bool Verify(string token, string tokenHash)
    {
        var candidateHash = Hash(token);
        var candidateBytes = Encoding.UTF8.GetBytes(candidateHash);
        var storedBytes = Encoding.UTF8.GetBytes(tokenHash);

        return candidateBytes.Length == storedBytes.Length &&
               CryptographicOperations.FixedTimeEquals(candidateBytes, storedBytes);
    }
}
