namespace PokerPoints.Data.Entities;

public class Story
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Session Session { get; set; } = null!;
    public string Title { get; set; } = string.Empty;
    public string? Url { get; set; }
    public int SortOrder { get; set; }
    public string Status { get; set; } = "pending";
    public decimal? FinalScore { get; set; }
    public decimal? AgreedEstimate { get; set; }
    public Guid? EstimateConfirmedBy { get; set; }
    public DateTime? EstimateConfirmedAt { get; set; }
    public int EstimateRevision { get; set; }
    public JiraStoryLink? JiraLink { get; set; }
    public DateTime CreatedAt { get; set; }

    public ICollection<Vote> Votes { get; set; } = new List<Vote>();
}
