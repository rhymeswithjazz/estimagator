namespace PokerPoints.Data.Entities;

public class Session
{
    public Guid Id { get; set; }
    public Guid? OrganizerId { get; set; }
    public User? Organizer { get; set; }
    public string AccessCode { get; set; } = string.Empty;
    public string DeckType { get; set; } = "fibonacci";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }

    public ICollection<Participant> Participants { get; set; } = new List<Participant>();
    public ICollection<Story> Stories { get; set; } = new List<Story>();
}
