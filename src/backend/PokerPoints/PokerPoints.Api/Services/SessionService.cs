using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface ISessionService
{
    Task<CreateSessionResponse> CreateSessionAsync(string deckType);
    Task<Session?> GetSessionByCodeAsync(string accessCode);
    Task<SessionInfoResponse?> GetSessionInfoAsync(string accessCode);
    Task<GameStateResponse?> GetGameStateAsync(string accessCode);
    Task<Story?> GetOrCreateActiveStoryAsync(Guid sessionId);
    Task<Story?> UpdateStoryTitleAsync(Guid storyId, string title);
    Task<Story?> CompleteStoryAsync(Guid storyId, decimal? finalScore);
}

public class SessionService : ISessionService
{
    private readonly PokerPointsDbContext _db;
    private static readonly char[] AccessCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public SessionService(PokerPointsDbContext db)
    {
        _db = db;
    }

    public async Task<CreateSessionResponse> CreateSessionAsync(string deckType)
    {
        var accessCode = await GenerateUniqueAccessCodeAsync();

        var session = new Session
        {
            AccessCode = accessCode,
            DeckType = deckType,
            IsActive = true
        };

        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        return new CreateSessionResponse(session.Id, session.AccessCode);
    }

    public async Task<Session?> GetSessionByCodeAsync(string accessCode)
    {
        return await _db.Sessions
            .Include(s => s.Participants)
            .Include(s => s.Stories.Where(st => st.Status == "active"))
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant() && s.IsActive);
    }

    public async Task<SessionInfoResponse?> GetSessionInfoAsync(string accessCode)
    {
        var session = await _db.Sessions
            .Include(s => s.Participants)
            .Include(s => s.Stories)
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant() && s.IsActive);

        if (session == null) return null;

        var activeStory = session.Stories.FirstOrDefault(s => s.Status == "active");

        return new SessionInfoResponse(
            session.Id,
            session.AccessCode,
            session.DeckType,
            session.IsActive,
            session.CreatedAt,
            session.Participants.Select(ToParticipantDto).ToList(),
            activeStory != null ? ToStoryDto(activeStory) : null
        );
    }

    public async Task<GameStateResponse?> GetGameStateAsync(string accessCode)
    {
        var session = await _db.Sessions
            .Include(s => s.Participants)
            .Include(s => s.Stories)
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant() && s.IsActive);

        if (session == null) return null;

        var activeStory = session.Stories.FirstOrDefault(s => s.Status == "active");
        var sessionInfo = new SessionInfoResponse(
            session.Id,
            session.AccessCode,
            session.DeckType,
            session.IsActive,
            session.CreatedAt,
            session.Participants.Select(ToParticipantDto).ToList(),
            activeStory != null ? ToStoryDto(activeStory) : null
        );

        var voteStatuses = new List<VoteStatusDto>();
        List<VoteDto>? revealedVotes = null;

        if (activeStory != null)
        {
            var votes = activeStory.Votes.ToList();
            var votingParticipants = session.Participants.Where(p => !p.IsObserver).ToList();

            voteStatuses = votingParticipants.Select(p => new VoteStatusDto(
                p.Id,
                votes.Any(v => v.ParticipantId == p.Id)
            )).ToList();

            if (activeStory.Status == "completed")
            {
                revealedVotes = votes.Select(v =>
                {
                    var participant = session.Participants.First(p => p.Id == v.ParticipantId);
                    return new VoteDto(v.ParticipantId, participant.DisplayName, v.CardValue);
                }).ToList();
            }
        }

        return new GameStateResponse(
            sessionInfo,
            activeStory != null ? ToStoryDto(activeStory) : null,
            session.Participants.Select(ToParticipantDto).ToList(),
            voteStatuses,
            revealedVotes
        );
    }

    public async Task<Story?> GetOrCreateActiveStoryAsync(Guid sessionId)
    {
        var activeStory = await _db.Stories
            .FirstOrDefaultAsync(s => s.SessionId == sessionId && s.Status == "active");

        if (activeStory != null) return activeStory;

        var story = new Story
        {
            SessionId = sessionId,
            Title = "New Story",
            Status = "active"
        };

        _db.Stories.Add(story);
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> UpdateStoryTitleAsync(Guid storyId, string title)
    {
        var story = await _db.Stories.FindAsync(storyId);
        if (story == null) return null;

        story.Title = title;
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> CompleteStoryAsync(Guid storyId, decimal? finalScore)
    {
        var story = await _db.Stories.FindAsync(storyId);
        if (story == null) return null;

        story.Status = "completed";
        story.FinalScore = finalScore;
        await _db.SaveChangesAsync();

        return story;
    }

    private async Task<string> GenerateUniqueAccessCodeAsync()
    {
        var random = new Random();
        string code;

        do
        {
            code = new string(Enumerable.Range(0, 6)
                .Select(_ => AccessCodeChars[random.Next(AccessCodeChars.Length)])
                .ToArray());
        } while (await _db.Sessions.AnyAsync(s => s.AccessCode == code));

        return code;
    }

    private static ParticipantDto ToParticipantDto(Participant p) => new(
        p.Id,
        p.DisplayName,
        p.IsObserver,
        p.IsOrganizer,
        !string.IsNullOrEmpty(p.ConnectionId)
    );

    private static StoryDto ToStoryDto(Story s) => new(
        s.Id,
        s.Title,
        s.Status,
        s.FinalScore
    );
}
