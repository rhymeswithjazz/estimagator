namespace PokerPoints.Data.Entities;

public class Participant
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Session Session { get; set; } = null!;
    public string DisplayName { get; set; } = string.Empty;
    public bool IsObserver { get; set; }
    public bool IsOrganizer { get; set; }
    public string? ConnectionId { get; set; }
    public DateTime JoinedAt { get; set; }

    public ICollection<Vote> Votes { get; set; } = new List<Vote>();
}
