namespace PokerPoints.Data.Entities;

public class Story
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Session Session { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string Status { get; set; } = "pending";
    public decimal? FinalScore { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Vote> Votes { get; set; } = new List<Vote>();
}
