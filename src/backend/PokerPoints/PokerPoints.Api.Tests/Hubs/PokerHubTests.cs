using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Hubs;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data.Entities;
using Xunit;

namespace PokerPoints.Api.Tests.Hubs;

public class PokerHubTests
{
    private const string SenderConnectionId = "sender-connection";
    private static readonly Guid SessionId = Guid.NewGuid();
    private static readonly Guid SenderId = Guid.NewGuid();
    private static readonly Guid TargetId = Guid.NewGuid();
    private static readonly Guid StoryId = Guid.NewGuid();

    [Fact]
    public async Task JoinSession_ShouldTreatUnverifiedAuthenticatedUserAsGuest()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var fixture = CreateFixture(CreatePrincipal(userId));
        var session = new Session
        {
            Id = SessionId,
            AccessCode = "ABC123",
            IsActive = true,
            Participants = new List<Participant>()
        };
        var participant = CreateParticipant(
            SenderId,
            "Sender",
            "ABC123",
            SenderConnectionId,
            isOrganizer: true);

        fixture.AuthService
            .Setup(s => s.GetUserByIdAsync(userId))
            .ReturnsAsync(new User { Id = userId, EmailVerified = false });
        fixture.SessionService
            .Setup(s => s.GetSessionByCodeAsync("ABC123"))
            .ReturnsAsync(session);
        fixture.ParticipantService
            .Setup(s => s.JoinSessionAsync(SessionId, "Sender", false, true, SenderConnectionId, null))
            .ReturnsAsync(participant);
        fixture.SessionService
            .Setup(s => s.GetOrCreateActiveStoryAsync(SessionId))
            .ReturnsAsync((Story?)null);

        // Act
        var result = await fixture.Hub.JoinSession("ABC123", "Sender", false);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.IsOrganizer);
        fixture.ParticipantService.Verify(
            s => s.JoinSessionAsync(SessionId, "Sender", false, true, SenderConnectionId, null),
            Times.Once);
        fixture.CallerClient.Verify(
            c => c.SendCoreAsync("Error", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task JoinSession_ShouldNotMakeFirstParticipantHost_WhenGuestSessionHasReservationToken()
    {
        // Arrange
        var fixture = CreateFixture();
        var session = new Session
        {
            Id = SessionId,
            AccessCode = "ABC123",
            IsActive = true,
            GuestHostTokenHash = GuestHostToken.Hash("creator-token"),
            Participants = new List<Participant>()
        };
        var participant = CreateParticipant(
            SenderId,
            "Sender",
            "ABC123",
            SenderConnectionId,
            isOrganizer: false);

        fixture.SessionService
            .Setup(s => s.GetSessionByCodeAsync("ABC123"))
            .ReturnsAsync(session);
        fixture.ParticipantService
            .Setup(s => s.JoinSessionAsync(SessionId, "Sender", false, false, SenderConnectionId, null))
            .ReturnsAsync(participant);

        // Act
        var result = await fixture.Hub.JoinSession("ABC123", "Sender", false);

        // Assert
        Assert.NotNull(result);
        Assert.False(result.IsOrganizer);
        fixture.SessionService.Verify(s => s.GetOrCreateActiveStoryAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task JoinSession_ShouldClaimGuestHostWithValidToken_WhenOthersJoinedFirst()
    {
        // Arrange
        const string token = "creator-token";
        var fixture = CreateFixture();
        var otherParticipant = CreateParticipant(TargetId, "Other", "ABC123", "other-connection");
        var session = new Session
        {
            Id = SessionId,
            AccessCode = "ABC123",
            IsActive = true,
            GuestHostTokenHash = GuestHostToken.Hash(token),
            Participants = new List<Participant> { otherParticipant }
        };
        var guestHost = CreateParticipant(
            SenderId,
            "Creator",
            "ABC123",
            SenderConnectionId,
            isOrganizer: true);

        fixture.SessionService
            .Setup(s => s.GetSessionByCodeAsync("ABC123"))
            .ReturnsAsync(session);
        fixture.ParticipantService
            .Setup(s => s.ClaimGuestHostAsync(
                SessionId,
                "Creator",
                false,
                SenderConnectionId,
                token,
                null,
                null))
            .ReturnsAsync(guestHost);
        fixture.SessionService
            .Setup(s => s.GetOrCreateActiveStoryAsync(SessionId))
            .ReturnsAsync((Story?)null);

        // Act
        var result = await fixture.Hub.JoinSession("ABC123", "Creator", false, guestHostToken: token);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.IsOrganizer);
        fixture.ParticipantService.Verify(
            s => s.JoinSessionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<bool>(), It.IsAny<bool>(), It.IsAny<string>(), It.IsAny<Guid?>()),
            Times.Never);
    }

    [Fact]
    public async Task SwitchRole_ShouldUpdateParticipantRoleAndBroadcastSessionState()
    {
        // Arrange
        var fixture = CreateFixture();
        var currentParticipant = CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection");
        var updatedParticipant = CreateParticipant(
            SenderId,
            "Sender",
            "ABC123",
            "sender-connection",
            isObserver: true);
        var gameState = CreateGameState(updatedParticipant, currentStory: null);

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(currentParticipant);
        fixture.ParticipantService
            .Setup(s => s.UpdateRoleAsync(SenderConnectionId, true))
            .ReturnsAsync(updatedParticipant);
        fixture.SessionService
            .Setup(s => s.GetGameStateAsync("ABC123"))
            .ReturnsAsync(gameState);

        // Act
        var result = await fixture.Hub.SwitchRole(true);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.IsObserver);
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "SessionState",
                It.Is<object?[]>(args => ReferenceEquals(args.SingleOrDefault(), gameState)),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task SwitchRole_ShouldRemoveVote_WhenSwitchingToObserverDuringActiveStory()
    {
        // Arrange
        var fixture = CreateFixture();
        var currentParticipant = CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection");
        var updatedParticipant = CreateParticipant(
            SenderId,
            "Sender",
            "ABC123",
            "sender-connection",
            isObserver: true);
        var gameState = CreateGameState(updatedParticipant, new StoryDto(StoryId, "Story", null, "active", null));
        var refreshedGameState = CreateGameState(updatedParticipant, new StoryDto(StoryId, "Story", null, "active", null));

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(currentParticipant);
        fixture.ParticipantService
            .Setup(s => s.UpdateRoleAsync(SenderConnectionId, true))
            .ReturnsAsync(updatedParticipant);
        fixture.SessionService
            .SetupSequence(s => s.GetGameStateAsync("ABC123"))
            .ReturnsAsync(gameState)
            .ReturnsAsync(refreshedGameState);

        // Act
        await fixture.Hub.SwitchRole(true);

        // Assert
        fixture.VotingService.Verify(s => s.RemoveVoteAsync(StoryId, SenderId), Times.Once);
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "SessionState",
                It.Is<object?[]>(args => ReferenceEquals(args.SingleOrDefault(), refreshedGameState)),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task SwitchRole_ShouldSendError_WhenParticipantIsMissing()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync((Participant?)null);

        // Act
        var result = await fixture.Hub.SwitchRole(true);

        // Assert
        Assert.Null(result);
        VerifyError(fixture.CallerClient, "Not in a session");
    }

    [Fact]
    public async Task TransferHost_ShouldBroadcastHostTransferredAndSessionState_WhenRequestIsValid()
    {
        // Arrange
        var fixture = CreateFixture();
        var currentHost = CreateParticipant(
            SenderId,
            "Sender",
            "ABC123",
            "sender-connection",
            isOrganizer: true);
        var newHost = CreateParticipant(TargetId, "Target", "ABC123", "target-connection");
        newHost.IsOrganizer = true;
        var gameState = CreateGameState(newHost, currentStory: null);

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(currentHost);
        fixture.ParticipantService
            .Setup(s => s.TransferHostAsync(SenderId, TargetId))
            .ReturnsAsync(new HostTransferResult(HostTransferStatus.Success, SenderId, newHost));
        fixture.SessionService
            .Setup(s => s.GetGameStateAsync("ABC123"))
            .ReturnsAsync(gameState);

        // Act
        var result = await fixture.Hub.TransferHost(TargetId);

        // Assert
        Assert.NotNull(result);
        Assert.True(result.IsOrganizer);
        Assert.Equal(TargetId, result.Id);
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "HostTransferred",
                It.Is<object?[]>(args => IsExpectedHostTransferredEvent(args)),
                It.IsAny<CancellationToken>()),
            Times.Once);
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "SessionState",
                It.Is<object?[]>(args => ReferenceEquals(args.SingleOrDefault(), gameState)),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task TransferHost_ShouldSendError_WhenCallerIsNotHost()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));

        // Act
        var act = () => fixture.Hub.TransferHost(TargetId);

        // Assert
        var exception = await Assert.ThrowsAsync<HubException>(act);
        Assert.Equal("Only the current host can transfer host controls.", exception.Message);
        fixture.ParticipantService.Verify(
            s => s.TransferHostAsync(It.IsAny<Guid>(), It.IsAny<Guid>()),
            Times.Never);
    }

    [Fact]
    public async Task EndSession_ShouldDeactivateSession_WhenCallerIsHost()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(
                SenderId,
                "Sender",
                "ABC123",
                "sender-connection",
                isOrganizer: true));
        fixture.SessionService
            .Setup(s => s.DeactivateSessionByHostAsync(SessionId))
            .ReturnsAsync(true);

        // Act
        await fixture.Hub.EndSession();

        // Assert
        fixture.TimerService.Verify(t => t.StopTimer("ABC123"), Times.Once);
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "SessionEnded",
                It.Is<object?[]>(args => args.Length == 0),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task EndSession_ShouldSendError_WhenCallerIsNotHost()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));

        // Act
        await fixture.Hub.EndSession();

        // Assert
        VerifyError(fixture.CallerClient, "Only the host can end the session");
        fixture.SessionService.Verify(
            s => s.DeactivateSessionByHostAsync(It.IsAny<Guid>()),
            Times.Never);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldBroadcastEmojiThrown_WhenRequestIsValid()
    {
        // Arrange
        var fixture = CreateFixture();

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.ParticipantService
            .Setup(s => s.GetByIdAsync(TargetId))
            .ReturnsAsync(CreateParticipant(TargetId, "Target", "ABC123", "target-connection"));
        fixture.RateLimiter
            .Setup(r => r.TryAcquire(SenderConnectionId, TimeSpan.FromMilliseconds(200)))
            .Returns(true);

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, "🎯");

        // Assert
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "EmojiThrown",
                It.Is<object?[]>(args => IsExpectedEmojiThrownEvent(args)),
                It.IsAny<CancellationToken>()),
            Times.Once);
        fixture.CallerClient.Verify(
            c => c.SendCoreAsync("Error", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Theory]
    [InlineData("paper-ball")]
    [InlineData("💩")]
    [InlineData("🍅")]
    [InlineData("🪨")]
    [InlineData("🥚")]
    public async Task ThrowEmoji_ShouldAllowCuratedThrowOptions(string emoji)
    {
        // Arrange
        var fixture = CreateFixture();

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.ParticipantService
            .Setup(s => s.GetByIdAsync(TargetId))
            .ReturnsAsync(CreateParticipant(TargetId, "Target", "ABC123", "target-connection"));
        fixture.RateLimiter
            .Setup(r => r.TryAcquire(SenderConnectionId, TimeSpan.FromMilliseconds(200)))
            .Returns(true);

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, emoji);

        // Assert
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "EmojiThrown",
                It.Is<object?[]>(args => IsEmojiThrownEvent(args, emoji)),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldSendError_WhenSenderIsMissing()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync((Participant?)null);

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, "🎯");

        // Assert
        VerifyError(fixture.CallerClient, "Not in a session");
        VerifyNoBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldSendError_WhenEmojiIsNotAllowed()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, "🧨");

        // Assert
        VerifyError(fixture.CallerClient, "That emoji is not available");
        VerifyNoBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldSendError_WhenTargetIsSender()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));

        // Act
        await fixture.Hub.ThrowEmoji(SenderId, "🎯");

        // Assert
        VerifyError(fixture.CallerClient, "You cannot throw an emoji at yourself");
        VerifyNoBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldSendError_WhenTargetIsInDifferentSession()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.ParticipantService
            .Setup(s => s.GetByIdAsync(TargetId))
            .ReturnsAsync(CreateParticipant(TargetId, "Target", "OTHER1", "target-connection", Guid.NewGuid()));

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, "🎯");

        // Assert
        VerifyError(fixture.CallerClient, "That user is not available");
        VerifyNoBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldSendError_WhenTargetIsDisconnected()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.ParticipantService
            .Setup(s => s.GetByIdAsync(TargetId))
            .ReturnsAsync(CreateParticipant(TargetId, "Target", "ABC123", null));

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, "🎯");

        // Assert
        VerifyError(fixture.CallerClient, "That user is not available");
        VerifyNoBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task ThrowEmoji_ShouldSendError_WhenSenderIsRateLimited()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.ParticipantService
            .Setup(s => s.GetByIdAsync(TargetId))
            .ReturnsAsync(CreateParticipant(TargetId, "Target", "ABC123", "target-connection"));
        fixture.RateLimiter
            .Setup(r => r.TryAcquire(SenderConnectionId, TimeSpan.FromMilliseconds(200)))
            .Returns(false);

        // Act
        await fixture.Hub.ThrowEmoji(TargetId, "🎯");

        // Assert
        VerifyError(fixture.CallerClient, "Give it a second before throwing another emoji");
        VerifyNoBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task SendEmojiReaction_ShouldBroadcastEmojiReactionSent_WhenRequestIsValid()
    {
        // Arrange
        var fixture = CreateFixture();

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.RateLimiter
            .Setup(r => r.TryAcquire(SenderConnectionId, TimeSpan.FromMilliseconds(200)))
            .Returns(true);

        // Act
        await fixture.Hub.SendEmojiReaction("👍");

        // Assert
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "EmojiReactionSent",
                It.Is<object?[]>(args => IsEmojiReactionSentEvent(args, "👍")),
                It.IsAny<CancellationToken>()),
            Times.Once);
        fixture.CallerClient.Verify(
            c => c.SendCoreAsync("Error", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Theory]
    [InlineData("❤️")]
    [InlineData("💯")]
    [InlineData("🎉")]
    [InlineData("👏")]
    [InlineData("🔥")]
    [InlineData("👀")]
    [InlineData("☕")]
    public async Task SendEmojiReaction_ShouldAllowPositiveReactions(string emoji)
    {
        // Arrange
        var fixture = CreateFixture();

        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.RateLimiter
            .Setup(r => r.TryAcquire(SenderConnectionId, TimeSpan.FromMilliseconds(200)))
            .Returns(true);

        // Act
        await fixture.Hub.SendEmojiReaction(emoji);

        // Assert
        fixture.GroupClient.Verify(
            c => c.SendCoreAsync(
                "EmojiReactionSent",
                It.Is<object?[]>(args => IsEmojiReactionSentEvent(args, emoji)),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task SendEmojiReaction_ShouldSendError_WhenSenderIsMissing()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync((Participant?)null);

        // Act
        await fixture.Hub.SendEmojiReaction("👍");

        // Assert
        VerifyError(fixture.CallerClient, "Not in a session");
        VerifyNoReactionBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task SendEmojiReaction_ShouldSendError_WhenEmojiIsNotAllowed()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));

        // Act
        await fixture.Hub.SendEmojiReaction("🎯");

        // Assert
        VerifyError(fixture.CallerClient, "That reaction is not available");
        VerifyNoReactionBroadcast(fixture.GroupClient);
    }

    [Fact]
    public async Task SendEmojiReaction_ShouldSendError_WhenSenderIsRateLimited()
    {
        // Arrange
        var fixture = CreateFixture();
        fixture.ParticipantService
            .Setup(s => s.GetByConnectionIdAsync(SenderConnectionId))
            .ReturnsAsync(CreateParticipant(SenderId, "Sender", "ABC123", "sender-connection"));
        fixture.RateLimiter
            .Setup(r => r.TryAcquire(SenderConnectionId, TimeSpan.FromMilliseconds(200)))
            .Returns(false);

        // Act
        await fixture.Hub.SendEmojiReaction("👍");

        // Assert
        VerifyError(fixture.CallerClient, "Give it a second before sending another reaction");
        VerifyNoReactionBroadcast(fixture.GroupClient);
    }

    private static HubFixture CreateFixture(ClaimsPrincipal? user = null)
    {
        var sessionService = new Mock<ISessionService>();
        var participantService = new Mock<IParticipantService>();
        var votingService = new Mock<IVotingService>();
        var authService = new Mock<IAuthService>();
        var timerService = new Mock<ITimerService>();
        var rateLimiter = new Mock<IEmojiThrowRateLimiter>();
        var callerClient = new Mock<ISingleClientProxy>();
        var groupClient = new Mock<IClientProxy>();
        var clients = new Mock<IHubCallerClients>();
        var context = new Mock<HubCallerContext>();
        var groups = new Mock<IGroupManager>();

        clients.SetupGet(c => c.Caller).Returns(callerClient.Object);
        clients.Setup(c => c.Group("ABC123")).Returns(groupClient.Object);
        context.SetupGet(c => c.ConnectionId).Returns(SenderConnectionId);
        context.SetupGet(c => c.User).Returns(user);
        groups.Setup(g => g.AddToGroupAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var hub = new PokerHub(
            NullLogger<PokerHub>.Instance,
            sessionService.Object,
            participantService.Object,
            votingService.Object,
            authService.Object,
            timerService.Object,
            rateLimiter.Object)
        {
            Clients = clients.Object,
            Context = context.Object,
            Groups = groups.Object
        };

        return new HubFixture(
            hub,
            sessionService,
            participantService,
            votingService,
            authService,
            timerService,
            rateLimiter,
            callerClient,
            groupClient);
    }

    private static Participant CreateParticipant(
        Guid id,
        string displayName,
        string accessCode,
        string? connectionId,
        Guid? sessionId = null,
        bool isObserver = false,
        bool isOrganizer = false)
    {
        var actualSessionId = sessionId ?? SessionId;
        return new Participant
        {
            Id = id,
            SessionId = actualSessionId,
            DisplayName = displayName,
            IsObserver = isObserver,
            IsOrganizer = isOrganizer,
            ConnectionId = connectionId,
            Session = new Session
            {
                Id = actualSessionId,
                AccessCode = accessCode
            }
        };
    }

    private static GameStateResponse CreateGameState(Participant participant, StoryDto? currentStory)
    {
        var participantDto = new ParticipantDto(
            participant.Id,
            participant.DisplayName,
            participant.IsObserver,
            participant.IsOrganizer,
            !string.IsNullOrEmpty(participant.ConnectionId));

        return new GameStateResponse(
            new SessionInfoResponse(
                participant.Session.Id,
                participant.Session.AccessCode,
                null,
                "fibonacci",
                120,
                true,
                DateTime.UtcNow,
                new List<ParticipantDto> { participantDto },
                currentStory),
            currentStory,
            new List<ParticipantDto> { participantDto },
            new List<VoteStatusDto>(),
            null,
            null);
    }

    private static bool IsExpectedEmojiThrownEvent(object?[] args)
    {
        return IsEmojiThrownEvent(args, "🎯");
    }

    private static bool IsEmojiThrownEvent(object?[] args, string emoji)
    {
        var evt = args.SingleOrDefault() as EmojiThrownEvent;
        return evt != null &&
               evt.SenderParticipantId == SenderId &&
               evt.SenderDisplayName == "Sender" &&
               evt.TargetParticipantId == TargetId &&
               evt.Emoji == emoji;
    }

    private static bool IsEmojiReactionSentEvent(object?[] args, string emoji)
    {
        var evt = args.SingleOrDefault() as EmojiReactionSentEvent;
        return evt != null &&
               evt.SenderParticipantId == SenderId &&
               evt.SenderDisplayName == "Sender" &&
               evt.Emoji == emoji;
    }

    private static bool IsExpectedHostTransferredEvent(object?[] args)
    {
        var evt = args.SingleOrDefault() as HostTransferredEvent;
        return evt != null &&
               evt.PreviousHostParticipantId == SenderId &&
               evt.NewHost.Id == TargetId &&
               evt.NewHost.IsOrganizer;
    }

    private static ClaimsPrincipal CreatePrincipal(Guid userId)
    {
        var identity = new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.NameIdentifier, userId.ToString()) },
            "TestAuth");
        return new ClaimsPrincipal(identity);
    }

    private static void VerifyError(Mock<ISingleClientProxy> callerClient, string message)
    {
        callerClient.Verify(
            c => c.SendCoreAsync(
                "Error",
                It.Is<object?[]>(args => args.Length == 1 && args[0] as string == message),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    private static void VerifyNoBroadcast(Mock<IClientProxy> groupClient)
    {
        groupClient.Verify(
            c => c.SendCoreAsync("EmojiThrown", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private static void VerifyNoReactionBroadcast(Mock<IClientProxy> groupClient)
    {
        groupClient.Verify(
            c => c.SendCoreAsync("EmojiReactionSent", It.IsAny<object?[]>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private sealed record HubFixture(
        PokerHub Hub,
        Mock<ISessionService> SessionService,
        Mock<IParticipantService> ParticipantService,
        Mock<IVotingService> VotingService,
        Mock<IAuthService> AuthService,
        Mock<ITimerService> TimerService,
        Mock<IEmojiThrowRateLimiter> RateLimiter,
        Mock<ISingleClientProxy> CallerClient,
        Mock<IClientProxy> GroupClient);
}
