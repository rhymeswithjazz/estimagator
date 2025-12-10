using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface ISessionService
{
    Task<CreateSessionResponse> CreateSessionAsync(string deckType, string? name = null, Guid? organizerId = null);
    Task<Session?> GetSessionByCodeAsync(string accessCode);
    Task<SessionInfoResponse?> GetSessionInfoAsync(string accessCode);
    Task<GameStateResponse?> GetGameStateAsync(string accessCode);
    Task<Story?> GetOrCreateActiveStoryAsync(Guid sessionId);
    Task<Story?> UpdateStoryTitleAsync(Guid storyId, string title);
    Task<Story?> CompleteStoryAsync(Guid storyId, decimal? finalScore);
    Task<List<UserSessionResponse>> GetUserSessionsAsync(Guid userId);
    Task<List<Story>> AddStoriesAsync(Guid sessionId, List<CreateStoryRequest> stories);
    Task<List<StoryDto>> GetPendingStoriesAsync(Guid sessionId);
    Task<Story?> ActivateNextStoryAsync(Guid sessionId);
    Task<Story?> ActivateStoryAsync(Guid storyId);
    Task<Story?> RestartStoryAsync(Guid storyId);
    Task<Story?> UpdateStoryAsync(Guid storyId, string title, string? url);
    Task DeleteStoryAsync(Guid storyId);
    Task<bool> DeactivateSessionAsync(string accessCode, Guid organizerId);
    Task<SessionHistoryResponse?> GetSessionHistoryAsync(string accessCode, Guid userId);
}

public class SessionService : ISessionService
{
    private readonly PokerPointsDbContext _db;
    private static readonly char[] AccessCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public SessionService(PokerPointsDbContext db)
    {
        _db = db;
    }

    public async Task<CreateSessionResponse> CreateSessionAsync(string deckType, string? name = null, Guid? organizerId = null)
    {
        var accessCode = await GenerateUniqueAccessCodeAsync();

        var session = new Session
        {
            AccessCode = accessCode,
            Name = name,
            DeckType = deckType,
            IsActive = true,
            OrganizerId = organizerId
        };

        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        return new CreateSessionResponse(session.Id, session.AccessCode, session.Name);
    }

    public async Task<List<UserSessionResponse>> GetUserSessionsAsync(Guid userId)
    {
        var sessions = await _db.Sessions
            .Include(s => s.Participants)
            .Include(s => s.Stories)
            .Where(s => s.OrganizerId == userId || s.Participants.Any(p => p.UserId == userId))
            .OrderByDescending(s => s.CreatedAt)
            .Take(20)
            .ToListAsync();

        return sessions.Select(session =>
        {
            var activeStory = session.Stories.FirstOrDefault(s => s.Status == "active");
            return new UserSessionResponse(
                session.Id,
                session.AccessCode,
                session.Name,
                session.DeckType,
                session.IsActive,
                session.CreatedAt,
                session.Participants.Select(ToParticipantDto).ToList(),
                activeStory != null ? ToStoryDto(activeStory) : null,
                session.OrganizerId == userId
            );
        }).ToList();
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
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant());

        if (session == null) return null;

        var activeStory = session.Stories.FirstOrDefault(s => s.Status == "active");

        return new SessionInfoResponse(
            session.Id,
            session.AccessCode,
            session.Name,
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
            session.Name,
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

    public async Task<List<Story>> AddStoriesAsync(Guid sessionId, List<CreateStoryRequest> stories)
    {
        var maxSortOrder = await _db.Stories
            .Where(s => s.SessionId == sessionId)
            .MaxAsync(s => (int?)s.SortOrder) ?? 0;

        var newStories = stories.Select((req, index) => new Story
        {
            SessionId = sessionId,
            Title = req.Title,
            Url = req.Url,
            Status = "pending",
            SortOrder = maxSortOrder + index + 1
        }).ToList();

        _db.Stories.AddRange(newStories);
        await _db.SaveChangesAsync();

        return newStories;
    }

    public async Task<List<StoryDto>> GetPendingStoriesAsync(Guid sessionId)
    {
        // Return all non-active stories (pending and completed) for the queue display
        var stories = await _db.Stories
            .Where(s => s.SessionId == sessionId && s.Status != "active")
            .OrderBy(s => s.SortOrder)
            .ToListAsync();

        return stories.Select(ToStoryDto).ToList();
    }

    public async Task<Story?> ActivateNextStoryAsync(Guid sessionId)
    {
        var nextStory = await _db.Stories
            .Where(s => s.SessionId == sessionId && s.Status == "pending")
            .OrderBy(s => s.SortOrder)
            .FirstOrDefaultAsync();

        if (nextStory == null) return null;

        nextStory.Status = "active";
        await _db.SaveChangesAsync();

        return nextStory;
    }

    public async Task<Story?> ActivateStoryAsync(Guid storyId)
    {
        var story = await _db.Stories.FindAsync(storyId);
        if (story == null) return null;

        story.Status = "active";
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> RestartStoryAsync(Guid storyId)
    {
        var story = await _db.Stories
            .Include(s => s.Votes)
            .FirstOrDefaultAsync(s => s.Id == storyId);

        if (story == null) return null;

        // Clear all votes for this story
        _db.Votes.RemoveRange(story.Votes);

        // Reset story status
        story.Status = "active";
        story.FinalScore = null;

        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> UpdateStoryAsync(Guid storyId, string title, string? url)
    {
        var story = await _db.Stories.FindAsync(storyId);
        if (story == null) return null;

        story.Title = title;
        story.Url = url;
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task DeleteStoryAsync(Guid storyId)
    {
        var story = await _db.Stories.FindAsync(storyId);
        if (story != null)
        {
            _db.Stories.Remove(story);
            await _db.SaveChangesAsync();
        }
    }

    public async Task<bool> DeactivateSessionAsync(string accessCode, Guid organizerId)
    {
        var session = await _db.Sessions
            .Include(s => s.Stories.Where(st => st.Status == "active"))
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant() && s.OrganizerId == organizerId);

        if (session == null) return false;

        // Complete any active story before ending the session
        var activeStory = session.Stories.FirstOrDefault(s => s.Status == "active");
        if (activeStory != null)
        {
            // Calculate final score from votes
            var numericVotes = activeStory.Votes
                .Select(v => decimal.TryParse(v.CardValue, out var n) ? (decimal?)n : null)
                .Where(n => n.HasValue)
                .Select(n => n!.Value)
                .ToList();

            activeStory.FinalScore = numericVotes.Count > 0
                ? Math.Round(numericVotes.Average(), 1)
                : null;
            activeStory.Status = "completed";
        }

        session.IsActive = false;
        await _db.SaveChangesAsync();

        return true;
    }

    public async Task<SessionHistoryResponse?> GetSessionHistoryAsync(string accessCode, Guid userId)
    {
        var session = await _db.Sessions
            .Include(s => s.Participants)
            .Include(s => s.Stories)
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant());

        if (session == null) return null;

        // Only allow organizer or participants to view history
        var isAuthorized = session.OrganizerId == userId || 
                          session.Participants.Any(p => p.UserId == userId);
        if (!isAuthorized) return null;

        var stories = session.Stories
            .OrderBy(s => s.SortOrder)
            .Select(story => new StoryHistoryDto(
                story.Id,
                story.Title,
                story.Url,
                story.Status,
                story.FinalScore,
                story.Votes.Select(v =>
                {
                    var participant = session.Participants.FirstOrDefault(p => p.Id == v.ParticipantId);
                    return new VoteDto(v.ParticipantId, participant?.DisplayName ?? "Unknown", v.CardValue);
                }).ToList()
            )).ToList();

        return new SessionHistoryResponse(
            session.Id,
            session.AccessCode,
            session.Name,
            session.DeckType,
            session.IsActive,
            session.CreatedAt,
            session.Participants.Select(ToParticipantDto).ToList(),
            stories
        );
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
        s.Url,
        s.Status,
        s.FinalScore
    );
}
