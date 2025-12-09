using Microsoft.AspNetCore.SignalR;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;

namespace PokerPoints.Api.Hubs;

public class PokerHub : Hub
{
    private readonly ILogger<PokerHub> _logger;
    private readonly ISessionService _sessionService;
    private readonly IParticipantService _participantService;
    private readonly IVotingService _votingService;

    public PokerHub(
        ILogger<PokerHub> logger,
        ISessionService sessionService,
        IParticipantService participantService,
        IVotingService votingService)
    {
        _logger = logger;
        _sessionService = sessionService;
        _participantService = participantService;
        _votingService = votingService;
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
            var existingParticipant = await _participantService.ReconnectAsync(existingParticipantId.Value, Context.ConnectionId);
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

        // Determine if this is the first participant (becomes organizer)
        var isOrganizer = session.Participants.Count == 0;

        var participant = await _participantService.JoinSessionAsync(
            session.Id,
            displayName,
            isObserver,
            isOrganizer,
            Context.ConnectionId
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

        var result = await _votingService.RevealVotesAsync(gameState.CurrentStory.Id);

        _logger.LogInformation("Votes revealed for story {StoryId}: Average={Average}, Consensus={IsConsensus}",
            gameState.CurrentStory.Id, result.Average, result.IsConsensus);

        await Clients.Group(session.AccessCode).SendAsync("VotesRevealed", result);
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

        await _votingService.ResetVotesAsync(gameState.CurrentStory.Id);

        _logger.LogInformation("Votes reset for story {StoryId}", gameState.CurrentStory.Id);

        await Clients.Group(session.AccessCode).SendAsync("VotesReset", new VotesResetEvent(gameState.CurrentStory.Id));
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

    public async Task<GameStateResponse?> GetSessionState()
    {
        var participant = await _participantService.GetByConnectionIdAsync(Context.ConnectionId);
        if (participant == null) return null;

        return await _sessionService.GetGameStateAsync(participant.Session.AccessCode);
    }
}
