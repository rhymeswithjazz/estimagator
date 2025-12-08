namespace PokerPoints.Data.Entities;

public class User
{
    public Guid Id { get; set; }
    public string? Email { get; set; }
    public string? PasswordHash { get; set; }
    public string? DisplayName { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Session> Sessions { get; set; } = new List<Session>();
}
