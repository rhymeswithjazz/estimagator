using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface ISessionService
{
    Task<CreateSessionResponse> CreateSessionAsync(string deckType, string? name = null, Guid? organizerId = null, int timerDurationSeconds = 120, string cardBack = CardBacks.Default);
    Task<Session?> GetSessionByCodeAsync(string accessCode);
    Task<SessionInfoResponse?> GetSessionInfoAsync(string accessCode);
    Task<GameStateResponse?> GetGameStateAsync(string accessCode);
    Task<CurrentStoryRef?> GetCurrentStoryAsync(string accessCode);
    Task<Story?> GetOrCreateCurrentStoryAsync(Guid sessionId);
    Task<Story?> GetOrCreateActiveStoryAsync(Guid sessionId);
    Task<bool> StoryBelongsToSessionAsync(Guid sessionId, Guid storyId);
    Task<Story?> UpdateStoryTitleAsync(Guid sessionId, Guid storyId, string title);
    Task<Story?> CompleteStoryAsync(Guid sessionId, Guid storyId, decimal? finalScore);
    Task<List<UserSessionResponse>> GetUserSessionsAsync(Guid userId);
    Task<List<Story>> AddStoriesAsync(Guid sessionId, List<CreateStoryRequest> stories);
    Task<List<StoryDto>> GetPendingStoriesAsync(Guid sessionId);
    Task<Story?> ActivateNextStoryAsync(Guid sessionId);
    Task<Story?> ActivateStoryAsync(Guid sessionId, Guid storyId);
    Task<Story?> RestartStoryAsync(Guid sessionId, Guid storyId);
    Task<Story?> UpdateStoryAsync(Guid sessionId, Guid storyId, string title, string? url);
    Task DeleteStoryAsync(Guid sessionId, Guid storyId);
    Task<bool> DeactivateSessionAsync(string accessCode, Guid organizerId);
    Task<bool> DeactivateSessionByHostAsync(Guid sessionId);
    Task<SessionHistoryResponse?> GetSessionHistoryAsync(string accessCode, Guid userId);
}

public record CurrentStoryRef(Guid SessionId, Guid Id, string Status);

public class SessionService : ISessionService
{
    private readonly PokerPointsDbContext _db;
    private readonly ITimerService _timerService;
    private static readonly char[] AccessCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public SessionService(PokerPointsDbContext db, ITimerService timerService)
    {
        _db = db;
        _timerService = timerService;
    }

    public async Task<CreateSessionResponse> CreateSessionAsync(string deckType, string? name = null, Guid? organizerId = null, int timerDurationSeconds = 120, string cardBack = CardBacks.Default)
    {
        var accessCode = await GenerateUniqueAccessCodeAsync();
        var guestHostToken = organizerId.HasValue ? null : GuestHostToken.Generate();

        var session = new Session
        {
            AccessCode = accessCode,
            Name = name,
            DeckType = deckType,
            CardBack = cardBack,
            TimerDurationSeconds = timerDurationSeconds,
            IsActive = true,
            OrganizerId = organizerId,
            GuestHostTokenHash = guestHostToken != null ? GuestHostToken.Hash(guestHostToken) : null
        };

        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        return new CreateSessionResponse(
            session.Id,
            session.AccessCode,
            session.Name,
            session.TimerDurationSeconds,
            guestHostToken);
    }

    public async Task<List<UserSessionResponse>> GetUserSessionsAsync(Guid userId)
    {
        var sessions = await _db.Sessions
            .AsNoTracking()
            .Include(s => s.Participants)
            .Where(s => s.OrganizerId == userId || s.Participants.Any(p => p.UserId == userId))
            .OrderByDescending(s => s.CreatedAt)
            .Take(20)
            .ToListAsync();

        var currentStoryIds = sessions.Select(s => s.CurrentStoryId).OfType<Guid>().ToList();
        var currentStories = await _db.Stories
            .AsNoTracking()
            .Where(st => currentStoryIds.Contains(st.Id))
            .ToDictionaryAsync(st => st.Id);

        return sessions.Select(session =>
        {
            var currentStory = session.CurrentStoryId is { } id ? currentStories.GetValueOrDefault(id) : null;
            return new UserSessionResponse(
                session.Id,
                session.AccessCode,
                session.Name,
                session.DeckType,
                session.IsActive,
                session.CreatedAt,
                session.Participants.Select(ToParticipantDto).ToList(),
                currentStory != null ? ToStoryDto(currentStory) : null,
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
        var code = accessCode.ToUpperInvariant();
        var session = await _db.Sessions
            .AsNoTracking()
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.AccessCode == code);

        if (session == null) return null;

        var currentStory = session.CurrentStoryId is { } currentStoryId
            ? await _db.Stories
                .AsNoTracking()
                .FirstOrDefaultAsync(st => st.Id == currentStoryId && st.SessionId == session.Id)
            : null;

        return new SessionInfoResponse(
            session.Id,
            session.AccessCode,
            session.Name,
            session.DeckType,
            session.TimerDurationSeconds,
            session.CardBack,
            session.IsActive,
            session.CreatedAt,
            session.Participants.Select(ToParticipantDto).ToList(),
            currentStory != null ? ToStoryDto(currentStory) : null
        );
    }

    public async Task<GameStateResponse?> GetGameStateAsync(string accessCode)
    {
        var code = accessCode.ToUpperInvariant();
        var session = await _db.Sessions
            .AsNoTracking()
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.AccessCode == code && s.IsActive);

        if (session == null) return null;

        var currentStory = session.CurrentStoryId is { } currentStoryId
            ? await _db.Stories
                .AsNoTracking()
                .Include(st => st.Votes)
                .FirstOrDefaultAsync(st => st.Id == currentStoryId && st.SessionId == session.Id)
            : null;
        var sessionInfo = new SessionInfoResponse(
            session.Id,
            session.AccessCode,
            session.Name,
            session.DeckType,
            session.TimerDurationSeconds,
            session.CardBack,
            session.IsActive,
            session.CreatedAt,
            session.Participants.Select(ToParticipantDto).ToList(),
            currentStory != null ? ToStoryDto(currentStory) : null
        );

        var voteStatuses = new List<VoteStatusDto>();
        List<VoteDto>? revealedVotes = null;

        if (currentStory != null)
        {
            var votes = currentStory.Votes;
            var voterIds = votes.Select(v => v.ParticipantId).ToHashSet();

            voteStatuses = session.Participants
                .Where(p => !p.IsObserver)
                .Select(p => new VoteStatusDto(p.Id, voterIds.Contains(p.Id)))
                .ToList();

            if (currentStory.Status == "completed")
            {
                revealedVotes = votes.Select(v =>
                {
                    var participant = session.Participants.FirstOrDefault(p => p.Id == v.ParticipantId);
                    return new VoteDto(v.ParticipantId, participant?.DisplayName ?? "Unknown", v.CardValue);
                }).ToList();
            }
        }

        var activeTimer = _timerService.GetTimerState(accessCode);

        return new GameStateResponse(
            sessionInfo,
            currentStory != null ? ToStoryDto(currentStory) : null,
            session.Participants.Select(ToParticipantDto).ToList(),
            voteStatuses,
            revealedVotes,
            activeTimer,
            revealedVotes != null ? VotingService.CalculateResults(revealedVotes.Select(v => v.CardValue)) : null
        );
    }

    public Task<CurrentStoryRef?> GetCurrentStoryAsync(string accessCode)
    {
        var code = accessCode.ToUpperInvariant();
        return _db.Stories
            .Where(st => st.Session.AccessCode == code && st.Session.IsActive && st.Session.CurrentStoryId == st.Id)
            .Select(st => new CurrentStoryRef(st.SessionId, st.Id, st.Status))
            .FirstOrDefaultAsync();
    }

    public async Task<Story?> GetOrCreateCurrentStoryAsync(Guid sessionId)
    {
        var session = await _db.Sessions.FindAsync(sessionId);
        if (session == null || !session.IsActive) return null;

        var currentStory = await _db.Stories.FirstOrDefaultAsync(s =>
            s.SessionId == sessionId && s.Id == session.CurrentStoryId);
        return currentStory ?? await GetOrCreateActiveStoryAsync(sessionId);
    }

    public async Task<Story?> GetOrCreateActiveStoryAsync(Guid sessionId)
    {
        var session = await _db.Sessions.FindAsync(sessionId);
        if (session == null || !session.IsActive) return null;

        var activeStory = await _db.Stories
            .FirstOrDefaultAsync(s => s.SessionId == sessionId && s.Status == "active");

        if (activeStory != null)
        {
            session.CurrentStoryId = activeStory.Id;
            await _db.SaveChangesAsync();
            return activeStory;
        }

        var story = new Story
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            Title = "New Story",
            Status = "active"
        };

        _db.Stories.Add(story);
        session.CurrentStoryId = story.Id;
        await _db.SaveChangesAsync();

        return story;
    }

    public Task<bool> StoryBelongsToSessionAsync(Guid sessionId, Guid storyId) =>
        _db.Stories.AnyAsync(s => s.Id == storyId && s.SessionId == sessionId);

    public async Task<Story?> UpdateStoryTitleAsync(Guid sessionId, Guid storyId, string title)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == storyId && s.SessionId == sessionId);
        if (story == null) return null;

        story.Title = title;
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> CompleteStoryAsync(Guid sessionId, Guid storyId, decimal? finalScore)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == storyId && s.SessionId == sessionId);
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
        var session = await _db.Sessions.FindAsync(sessionId);
        if (session == null || !session.IsActive) return null;

        var nextStory = await _db.Stories
            .Where(s => s.SessionId == sessionId && s.Status == "pending")
            .OrderBy(s => s.SortOrder)
            .FirstOrDefaultAsync();

        if (nextStory == null) return null;

        nextStory.Status = "active";
        session.CurrentStoryId = nextStory.Id;
        await _db.SaveChangesAsync();

        return nextStory;
    }

    public async Task<Story?> ActivateStoryAsync(Guid sessionId, Guid storyId)
    {
        var session = await _db.Sessions.FindAsync(sessionId);
        if (session == null || !session.IsActive) return null;

        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == storyId && s.SessionId == sessionId);
        if (story == null) return null;

        story.Status = "active";
        session.CurrentStoryId = story.Id;
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> RestartStoryAsync(Guid sessionId, Guid storyId)
    {
        var session = await _db.Sessions.FindAsync(sessionId);
        if (session == null || !session.IsActive) return null;

        var story = await _db.Stories
            .Include(s => s.Votes)
            .FirstOrDefaultAsync(s => s.Id == storyId && s.SessionId == sessionId);

        if (story == null) return null;

        // Clear all votes for this story
        _db.Votes.RemoveRange(story.Votes);

        // Reset story status
        story.Status = "active";
        session.CurrentStoryId = story.Id;
        story.FinalScore = null;
        story.AgreedEstimate = null;
        story.EstimateConfirmedBy = null;
        story.EstimateConfirmedAt = null;
        story.EstimateRevision++;

        await _db.SaveChangesAsync();

        return story;
    }

    public async Task<Story?> UpdateStoryAsync(Guid sessionId, Guid storyId, string title, string? url)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == storyId && s.SessionId == sessionId);
        if (story == null) return null;

        story.Title = title;
        story.Url = url;
        await _db.SaveChangesAsync();

        return story;
    }

    public async Task DeleteStoryAsync(Guid sessionId, Guid storyId)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == storyId && s.SessionId == sessionId);
        if (story != null)
        {
            var session = await _db.Sessions.FindAsync(sessionId);
            if (session?.CurrentStoryId == storyId) session.CurrentStoryId = null;
            _db.Stories.Remove(story);
            await _db.SaveChangesAsync();
        }
    }

    public async Task<bool> DeactivateSessionAsync(string accessCode, Guid organizerId)
    {
        var session = await _db.Sessions
            .Include(s => s.Stories.Where(st => st.Status == "active"))
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.AccessCode == accessCode.ToUpperInvariant() && s.OrganizerId == organizerId && s.IsActive);

        if (session == null) return false;

        await DeactivateLoadedSessionAsync(session);
        return true;
    }

    public async Task<bool> DeactivateSessionByHostAsync(Guid sessionId)
    {
        var session = await _db.Sessions
            .Include(s => s.Stories.Where(st => st.Status == "active"))
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.IsActive);

        if (session == null) return false;

        await DeactivateLoadedSessionAsync(session);
        return true;
    }

    public async Task<SessionHistoryResponse?> GetSessionHistoryAsync(string accessCode, Guid userId)
    {
        var code = accessCode.ToUpperInvariant();
        var session = await _db.Sessions
            .AsNoTracking()
            .AsSplitQuery()
            .Include(s => s.Participants)
            .Include(s => s.Stories)
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.AccessCode == code);

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
                // Reveal completes the story; every other state keeps vote values private.
                story.Status == "completed" ? story.Votes.Select(v =>
                {
                    var participant = session.Participants.FirstOrDefault(p => p.Id == v.ParticipantId);
                    return new VoteDto(v.ParticipantId, participant?.DisplayName ?? "Unknown", v.CardValue);
                }).ToList() : new List<VoteDto>(),
                story.AgreedEstimate, story.EstimateRevision, PokerPoints.Api.Jira.JiraLinkDto.From(story)
            )).ToList();

        return new SessionHistoryResponse(
            session.Id,
            session.AccessCode,
            session.Name,
            session.DeckType,
            session.IsActive,
            session.CreatedAt,
            session.Participants.Select(ToParticipantDto).ToList(),
            stories,
            SessionAuthorization.CanManage(session, userId)
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

    private async Task DeactivateLoadedSessionAsync(Session session)
    {
        // Complete any active story before ending the session
        var activeStory = session.Stories.FirstOrDefault(s => s.Status == "active");
        if (activeStory != null)
        {
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

        session.EndingHostUserId = session.OrganizerId;
        session.IsActive = false;
        await _db.SaveChangesAsync();
    }

    private static StoryDto ToStoryDto(Story s) => StoryDto.From(s);
}
