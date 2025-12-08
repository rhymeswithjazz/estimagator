namespace PokerPoints.Data.Entities;

public class Vote
{
    public Guid Id { get; set; }
    public Guid StoryId { get; set; }
    public Story Story { get; set; } = null!;
    public Guid ParticipantId { get; set; }
    public Participant Participant { get; set; } = null!;
    public string? CardValue { get; set; }
    public DateTime CreatedAt { get; set; }
}
