using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Hubs;

public class PokerHub : Hub
{
    private readonly ILogger<PokerHub> _logger;
    private readonly ISessionService _sessionService;
    private readonly IParticipantService _participantService;
    private readonly IVotingService _votingService;
    private readonly IAuthService _authService;
    private readonly ITimerService _timerService;
    private readonly IEmojiThrowRateLimiter _emojiThrowRateLimiter;

    public PokerHub(
        ILogger<PokerHub> logger,
        ISessionService sessionService,
        IParticipantService participantService,
        IVotingService votingService,
        IAuthService authService,
        ITimerService timerService,
        IEmojiThrowRateLimiter emojiThrowRateLimiter)
    {
        _logger = logger;
        _sessionService = sessionService;
        _participantService = participantService;
        _votingService = votingService;
        _authService = authService;
        _timerService = timerService;
        _emojiThrowRateLimiter = emojiThrowRateLimiter;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connected: {ConnectionId}", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnected: {ConnectionId}", Context.ConnectionId);

        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant != null)
        {
            await _participantService.DisconnectAsync(Context.ConnectionId);
            await Clients.Group(participant.Session.AccessCode).SendAsync("UserLeft", new UserLeftEvent(participant.Id));
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<ParticipantDto?> JoinSession(string sessionCode, string displayName, bool isObserver, Guid? existingParticipantId = null)
    {
        _logger.LogInformation(
            "JoinSession: {SessionCode}, {DisplayName}, Observer={IsObserver}, ExistingId={ExistingId}",
            sessionCode, displayName, isObserver, existingParticipantId);

        // Check if authenticated user has verified email
        var userIdClaim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var authenticatedUserId = Guid.TryParse(userIdClaim, out var userId)
            ? userId
            : (Guid?)null;

        if (authenticatedUserId.HasValue)
        {
            var user = await _authService.GetUserByIdAsync(authenticatedUserId.Value);
            if (user != null && !user.EmailVerified)
            {
                _logger.LogWarning("Unverified user {UserId} attempted to join session", authenticatedUserId.Value);
                await Clients.Caller.SendAsync("Error", "Please verify your email address before joining sessions");
                return null;
            }
        }

        var session = await _sessionService.GetSessionByCodeAsync(sessionCode);
        if (session == null)
        {
            _logger.LogWarning("Session not found: {SessionCode}", sessionCode);
            await Clients.Caller.SendAsync("Error", "Session not found");
            return null;
        }

        // Check if this is a reconnection
        if (existingParticipantId.HasValue)
        {
            var existingParticipant = await _participantService.ReconnectAsync(
                existingParticipantId.Value,
                Context.ConnectionId,
                authenticatedUserId);
            if (existingParticipant != null)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, sessionCode.ToUpperInvariant());

                var reconnectDto = new ParticipantDto(
                    existingParticipant.Id,
                    existingParticipant.DisplayName,
                    existingParticipant.IsObserver,
                    existingParticipant.IsOrganizer,
                    true
                );

                await Clients.Group(sessionCode.ToUpperInvariant()).SendAsync("UserJoined", new UserJoinedEvent(reconnectDto));

                // Send current game state to reconnected user
                var gameState = await _sessionService.GetGameStateAsync(sessionCode);
                if (gameState != null)
                {
                    await Clients.Caller.SendAsync("SessionState", gameState);
                }

                return reconnectDto;
            }
        }

        // Determine if this participant is the session organizer
        var isOrganizer = session.OrganizerId.HasValue
            ? session.OrganizerId == authenticatedUserId  // Match session creator
            : session.Participants.Count == 0;  // Fallback for legacy sessions without a creator

        var participant = await _participantService.JoinSessionAsync(
            session.Id,
            displayName,
            isObserver,
            isOrganizer,
            Context.ConnectionId,
            authenticatedUserId
        );

        await Groups.AddToGroupAsync(Context.ConnectionId, sessionCode.ToUpperInvariant());

        var participantDto = new ParticipantDto(
            participant.Id,
            participant.DisplayName,
            participant.IsObserver,
            participant.IsOrganizer,
            true
        );

        await Clients.Group(sessionCode.ToUpperInvariant()).SendAsync("UserJoined", new UserJoinedEvent(participantDto));

        // If this user is the organizer, create the first story
        if (isOrganizer)
        {
            var story = await _sessionService.GetOrCreateActiveStoryAsync(session.Id);
            if (story != null)
            {
                await Clients.Group(sessionCode.ToUpperInvariant()).SendAsync("StoryUpdated", new StoryUpdatedEvent(
                    new StoryDto(story.Id, story.Title, story.Url, story.Status, story.FinalScore)
                ));
            }
        }

        return participantDto;
    }

    public async Task LeaveSession()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        var sessionCode = participant.Session.AccessCode;
        await _participantService.DisconnectAsync(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, sessionCode);
        await Clients.Group(sessionCode).SendAsync("UserLeft", new UserLeftEvent(participant.Id));

        _logger.LogInformation("User left session: {SessionCode}, {ParticipantId}", sessionCode, participant.Id);
    }

    public async Task CastVote(string cardValue)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null)
        {
            await Clients.Caller.SendAsync("Error", "Not in a session");
            return;
        }

        if (participant.IsObserver)
        {
            await Clients.Caller.SendAsync("Error", "Observers cannot vote");
            return;
        }

        var session = participant.Session;
        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);
        if (gameState?.CurrentStory == null)
        {
            await Clients.Caller.SendAsync("Error", "No active story to vote on");
            return;
        }

        await _votingService.CastVoteAsync(gameState.CurrentStory.Id, participant.Id, cardValue);

        _logger.LogInformation("Vote cast: {ParticipantId} voted {CardValue}", participant.Id, cardValue);

        // Broadcast that someone voted (not the value)
        await Clients.Group(session.AccessCode).SendAsync("VoteCast", new VoteCastEvent(participant.Id));
    }

    public async Task<ParticipantDto?> SwitchRole(bool isObserver)
    {
        var currentParticipant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (currentParticipant == null)
        {
            await Clients.Caller.SendAsync("Error", "Not in a session");
            return null;
        }

        var session = currentParticipant.Session;
        var participant = await _participantService.UpdateRoleAsync(Context.ConnectionId, isObserver);
        if (participant == null) return null;

        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);
        if (isObserver && gameState?.CurrentStory != null)
        {
            await _votingService.RemoveVoteAsync(gameState.CurrentStory.Id, participant.Id);
            gameState = await _sessionService.GetGameStateAsync(session.AccessCode);
        }

        var participantDto = new ParticipantDto(
            participant.Id,
            participant.DisplayName,
            participant.IsObserver,
            participant.IsOrganizer,
            true
        );

        _logger.LogInformation(
            "Participant role changed: {ParticipantId}, Observer={IsObserver}",
            participant.Id,
            participant.IsObserver);

        if (gameState != null)
        {
            await Clients.Group(session.AccessCode).SendAsync("SessionState", gameState);
        }

        return participantDto;
    }

    public async Task<ParticipantDto?> TransferHost(Guid targetParticipantId)
    {
        var currentHost = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (currentHost == null)
        {
            throw new HubException("You are not in a session.");
        }

        if (!currentHost.IsOrganizer)
        {
            throw new HubException("Only the current host can transfer host controls.");
        }

        var result = await _participantService.TransferHostAsync(currentHost.Id, targetParticipantId);
        if (result.Status != HostTransferStatus.Success || result.NewHost == null)
        {
            throw new HubException(GetHostTransferErrorMessage(result.Status));
        }

        var newHostDto = ToParticipantDto(result.NewHost);

        _logger.LogInformation(
            "Host transferred in session {SessionCode}: {PreviousHostParticipantId} -> {NewHostParticipantId}",
            currentHost.Session.AccessCode,
            currentHost.Id,
            result.NewHost.Id);

        await Clients.Group(currentHost.Session.AccessCode).SendAsync(
            "HostTransferred",
            new HostTransferredEvent(currentHost.Id, newHostDto));

        var gameState = await _sessionService.GetGameStateAsync(currentHost.Session.AccessCode);
        if (gameState != null)
        {
            await Clients.Group(currentHost.Session.AccessCode).SendAsync("SessionState", gameState);
        }

        return newHostDto;
    }

    public async Task EndSession()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null)
        {
            await Clients.Caller.SendAsync("Error", "Not in a session");
            return;
        }

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the host can end the session");
            return;
        }

        var session = participant.Session;
        var success = await _sessionService.DeactivateSessionByHostAsync(session.Id);
        if (!success)
        {
            await Clients.Caller.SendAsync("Error", "Session not found or already ended");
            return;
        }

        _timerService.StopTimer(session.AccessCode);

        _logger.LogInformation(
            "Session ended by live host: {SessionCode}, {ParticipantId}",
            session.AccessCode,
            participant.Id);

        await Clients.Group(session.AccessCode).SendAsync("TimerStopped");
        await Clients.Group(session.AccessCode).SendAsync("SessionEnded");
    }

    public async Task RevealVotes()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can reveal votes");
            return;
        }

        var session = participant.Session;
        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);
        if (gameState?.CurrentStory == null)
        {
            await Clients.Caller.SendAsync("Error", "No active story");
            return;
        }

        _timerService.StopTimer(session.AccessCode);

        var result = await _votingService.RevealVotesAsync(gameState.CurrentStory.Id);

        // Auto-complete the story on reveal
        var completedStory = await _sessionService.CompleteStoryAsync(gameState.CurrentStory.Id, result.Average);

        _logger.LogInformation("Votes revealed and story completed {StoryId}: Average={Average}, Consensus={IsConsensus}",
            gameState.CurrentStory.Id, result.Average, result.IsConsensus);

        await Clients.Group(session.AccessCode).SendAsync("TimerStopped");
        await Clients.Group(session.AccessCode).SendAsync("VotesRevealed", result);

        // Notify clients that story is now completed
        if (completedStory != null)
        {
            await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
                new StoryDto(completedStory.Id, completedStory.Title, completedStory.Url, completedStory.Status, completedStory.FinalScore)
            ));
        }
    }

    public async Task ResetVotes()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can reset votes");
            return;
        }

        var session = participant.Session;
        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);
        if (gameState?.CurrentStory == null)
        {
            await Clients.Caller.SendAsync("Error", "No active story");
            return;
        }

        _timerService.StopTimer(session.AccessCode);

        // Restart story: clears votes AND sets status back to "active"
        var story = await _sessionService.RestartStoryAsync(gameState.CurrentStory.Id);

        _logger.LogInformation("Story restarted (votes reset, status active) for story {StoryId}", gameState.CurrentStory.Id);

        await Clients.Group(session.AccessCode).SendAsync("VotesReset", new VotesResetEvent(gameState.CurrentStory.Id));

        // Notify clients that story status changed back to active
        if (story != null)
        {
            await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
                new StoryDto(story.Id, story.Title, story.Url, story.Status, story.FinalScore)
            ));
        }
    }

    public async Task UpdateStory(string title)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can update the story");
            return;
        }

        var session = participant.Session;
        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);
        if (gameState?.CurrentStory == null)
        {
            await Clients.Caller.SendAsync("Error", "No active story");
            return;
        }

        var story = await _sessionService.UpdateStoryTitleAsync(gameState.CurrentStory.Id, title);
        if (story == null) return;

        _logger.LogInformation("Story updated: {StoryId} -> {Title}", story.Id, title);

        await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
            new StoryDto(story.Id, story.Title, story.Url, story.Status, story.FinalScore)
        ));
    }

    public async Task NextStory(string? title = null)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can start the next story");
            return;
        }

        var session = participant.Session;
        _timerService.StopTimer(session.AccessCode);

        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);

        // Complete current story if exists
        if (gameState?.CurrentStory != null)
        {
            var result = await _votingService.RevealVotesAsync(gameState.CurrentStory.Id);
            await _sessionService.CompleteStoryAsync(gameState.CurrentStory.Id, result.Average);
        }

        // Try to activate next story from queue first, otherwise create new
        var newStory = await _sessionService.ActivateNextStoryAsync(session.Id);

        // If no pending stories in queue, create a new empty one
        if (newStory == null)
        {
            newStory = await _sessionService.GetOrCreateActiveStoryAsync(session.Id);
        }

        // Override title if provided
        if (newStory != null && !string.IsNullOrEmpty(title))
        {
            newStory = await _sessionService.UpdateStoryTitleAsync(newStory.Id, title);
        }

        if (newStory != null)
        {
            _logger.LogInformation("New story started: {StoryId}", newStory.Id);

            await Clients.Group(session.AccessCode).SendAsync("VotesReset", new VotesResetEvent(newStory.Id));
            await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
                new StoryDto(newStory.Id, newStory.Title, newStory.Url, newStory.Status, newStory.FinalScore)
            ));

            // Notify clients that the queue has changed
            var updatedQueue = await _sessionService.GetPendingStoriesAsync(session.Id);
            await Clients.Group(session.AccessCode).SendAsync("StoryQueueUpdated", updatedQueue);
        }
    }

    public async Task<List<StoryDto>> AddStories(List<CreateStoryRequest> stories)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null)
        {
            await Clients.Caller.SendAsync("Error", "Not in a session");
            return new List<StoryDto>();
        }

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can add stories");
            return new List<StoryDto>();
        }

        var session = participant.Session;
        var newStories = await _sessionService.AddStoriesAsync(session.Id, stories);

        _logger.LogInformation("Added {Count} stories to session {SessionId}", newStories.Count, session.Id);

        var storyDtos = newStories.Select(s => new StoryDto(s.Id, s.Title, s.Url, s.Status, s.FinalScore)).ToList();

        // Broadcast updated story queue to all participants
        await Clients.Group(session.AccessCode).SendAsync("StoriesAdded", storyDtos);

        return storyDtos;
    }

    public async Task<List<StoryDto>> GetStoryQueue()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return new List<StoryDto>();

        return await _sessionService.GetPendingStoriesAsync(participant.Session.Id);
    }

    public async Task UpdateStoryDetails(Guid storyId, string title, string? url)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can update stories");
            return;
        }

        var story = await _sessionService.UpdateStoryAsync(storyId, title, url);
        if (story == null) return;

        var session = participant.Session;
        _logger.LogInformation("Story {StoryId} updated: Title={Title}, Url={Url}", storyId, title, url);

        await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
            new StoryDto(story.Id, story.Title, story.Url, story.Status, story.FinalScore)
        ));
    }

    public async Task DeleteStory(Guid storyId)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can delete stories");
            return;
        }

        await _sessionService.DeleteStoryAsync(storyId);

        var session = participant.Session;
        _logger.LogInformation("Story {StoryId} deleted from session {SessionCode}", storyId, session.AccessCode);

        await Clients.Group(session.AccessCode).SendAsync("StoryDeleted", storyId);
    }

    public async Task StartStory(Guid storyId)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can start stories");
            return;
        }

        var session = participant.Session;
        _timerService.StopTimer(session.AccessCode);

        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);

        // Complete current story if exists
        if (gameState?.CurrentStory != null)
        {
            var result = await _votingService.RevealVotesAsync(gameState.CurrentStory.Id);
            await _sessionService.CompleteStoryAsync(gameState.CurrentStory.Id, result.Average);
        }

        // Activate the selected story
        var story = await _sessionService.ActivateStoryAsync(storyId);
        if (story == null) return;

        _logger.LogInformation("Story {StoryId} started from queue", storyId);

        await Clients.Group(session.AccessCode).SendAsync("VotesReset", new VotesResetEvent(story.Id));
        await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
            new StoryDto(story.Id, story.Title, story.Url, story.Status, story.FinalScore)
        ));

        // Notify clients that the queue has changed
        var updatedQueue = await _sessionService.GetPendingStoriesAsync(session.Id);
        await Clients.Group(session.AccessCode).SendAsync("StoryQueueUpdated", updatedQueue);
    }

    public async Task RestartStory(Guid storyId)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can restart stories");
            return;
        }

        var session = participant.Session;
        _timerService.StopTimer(session.AccessCode);

        var gameState = await _sessionService.GetGameStateAsync(session.AccessCode);

        // Complete current story if exists and it's different from the one we're restarting
        if (gameState?.CurrentStory != null && gameState.CurrentStory.Id != storyId)
        {
            var result = await _votingService.RevealVotesAsync(gameState.CurrentStory.Id);
            await _sessionService.CompleteStoryAsync(gameState.CurrentStory.Id, result.Average);
        }

        // Restart the story (clears votes and sets to active)
        var story = await _sessionService.RestartStoryAsync(storyId);
        if (story == null) return;

        _logger.LogInformation("Story {StoryId} restarted", storyId);

        await Clients.Group(session.AccessCode).SendAsync("VotesReset", new VotesResetEvent(story.Id));
        await Clients.Group(session.AccessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
            new StoryDto(story.Id, story.Title, story.Url, story.Status, story.FinalScore)
        ));

        // Notify clients that the queue has changed
        var updatedQueue = await _sessionService.GetPendingStoriesAsync(session.Id);
        await Clients.Group(session.AccessCode).SendAsync("StoryQueueUpdated", updatedQueue);
    }

    public async Task StartTimer()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can start the timer");
            return;
        }

        var session = participant.Session;
        _timerService.StartTimer(session.AccessCode, session.TimerDurationSeconds);

        var timerState = _timerService.GetTimerState(session.AccessCode);
        if (timerState != null)
        {
            _logger.LogInformation("Timer started for session {AccessCode}: {Duration}s", session.AccessCode, session.TimerDurationSeconds);
            await Clients.Group(session.AccessCode).SendAsync("TimerStarted",
                new TimerStartedEvent(timerState.EndTimeUtc, timerState.DurationSeconds));
        }
    }

    public async Task ExtendTimer(int additionalSeconds = 60)
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can extend the timer");
            return;
        }

        // Cap extension at 60 seconds
        additionalSeconds = Math.Min(additionalSeconds, 60);

        var session = participant.Session;
        _timerService.ExtendTimer(session.AccessCode, additionalSeconds);

        var timerState = _timerService.GetTimerState(session.AccessCode);
        if (timerState != null)
        {
            _logger.LogInformation("Timer extended for session {AccessCode} by {Seconds}s", session.AccessCode, additionalSeconds);
            await Clients.Group(session.AccessCode).SendAsync("TimerExtended",
                new TimerExtendedEvent(timerState.EndTimeUtc));
        }
    }

    public async Task StopTimer()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return;

        if (!participant.IsOrganizer)
        {
            await Clients.Caller.SendAsync("Error", "Only the organizer can stop the timer");
            return;
        }

        var session = participant.Session;
        _timerService.StopTimer(session.AccessCode);

        _logger.LogInformation("Timer stopped for session {AccessCode}", session.AccessCode);
        await Clients.Group(session.AccessCode).SendAsync("TimerStopped");
    }

    public async Task ThrowEmoji(Guid targetParticipantId, string emoji)
    {
        var sender = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (sender == null)
        {
            await Clients.Caller.SendAsync("Error", "Not in a session");
            return;
        }

        if (!EmojiThrowOptions.AllowedEmojis.Contains(emoji))
        {
            await Clients.Caller.SendAsync("Error", "That emoji is not available");
            return;
        }

        if (sender.Id == targetParticipantId)
        {
            await Clients.Caller.SendAsync("Error", "You cannot throw an emoji at yourself");
            return;
        }

        var target = await _participantService.GetByIdAsync(targetParticipantId);
        if (target == null || target.SessionId != sender.SessionId || target.ConnectionId == null)
        {
            await Clients.Caller.SendAsync("Error", "That user is not available");
            return;
        }

        if (!_emojiThrowRateLimiter.TryAcquire(Context.ConnectionId, EmojiThrowOptions.Cooldown))
        {
            await Clients.Caller.SendAsync("Error", "Give it a second before throwing another emoji");
            return;
        }

        var throwEvent = new EmojiThrownEvent(
            Guid.NewGuid(),
            sender.Id,
            sender.DisplayName,
            targetParticipantId,
            emoji,
            DateTimeOffset.UtcNow
        );

        _logger.LogInformation(
            "Emoji thrown in session {AccessCode}: {SenderParticipantId} -> {TargetParticipantId} {Emoji}",
            sender.Session.AccessCode,
            sender.Id,
            targetParticipantId,
            emoji);

        await Clients.Group(sender.Session.AccessCode).SendAsync("EmojiThrown", throwEvent);
    }

    public async Task<GameStateResponse?> GetSessionState()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return null;

        return await _sessionService.GetGameStateAsync(participant.Session.AccessCode);
    }

    private static ParticipantDto ToParticipantDto(Participant participant) => new(
        participant.Id,
        participant.DisplayName,
        participant.IsObserver,
        participant.IsOrganizer,
        !string.IsNullOrEmpty(participant.ConnectionId)
    );

    private static string GetHostTransferErrorMessage(HostTransferStatus status) => status switch
    {
        HostTransferStatus.CurrentParticipantNotFound => "You are not in a session.",
        HostTransferStatus.CurrentParticipantNotHost => "Only the current host can transfer host controls.",
        HostTransferStatus.TargetNotFound => "That participant is no longer available.",
        HostTransferStatus.TargetDifferentSession => "That participant is not in this session.",
        HostTransferStatus.TargetDisconnected => "That participant is not connected.",
        HostTransferStatus.TargetAlreadyHost => "That participant is already the host.",
        HostTransferStatus.SessionInactive => "This session has already ended.",
        _ => "Unable to transfer host controls."
    };
}
