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

    private static HubFixture CreateFixture()
    {
        var sessionService = new Mock<ISessionService>();
        var participantService = new Mock<IParticipantService>();
        var votingService = new Mock<IVotingService>();
        var rateLimiter = new Mock<IEmojiThrowRateLimiter>();
        var callerClient = new Mock<ISingleClientProxy>();
        var groupClient = new Mock<IClientProxy>();
        var clients = new Mock<IHubCallerClients>();
        var context = new Mock<HubCallerContext>();

        clients.SetupGet(c => c.Caller).Returns(callerClient.Object);
        clients.Setup(c => c.Group("ABC123")).Returns(groupClient.Object);
        context.SetupGet(c => c.ConnectionId).Returns(SenderConnectionId);

        var hub = new PokerHub(
            NullLogger<PokerHub>.Instance,
            sessionService.Object,
            participantService.Object,
            votingService.Object,
            Mock.Of<IAuthService>(),
            Mock.Of<ITimerService>(),
            rateLimiter.Object)
        {
            Clients = clients.Object,
            Context = context.Object
        };

        return new HubFixture(
            hub,
            sessionService,
            participantService,
            votingService,
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
        bool isObserver = false)
    {
        var actualSessionId = sessionId ?? SessionId;
        return new Participant
        {
            Id = id,
            SessionId = actualSessionId,
            DisplayName = displayName,
            IsObserver = isObserver,
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

    private sealed record HubFixture(
        PokerHub Hub,
        Mock<ISessionService> SessionService,
        Mock<IParticipantService> ParticipantService,
        Mock<IVotingService> VotingService,
        Mock<IEmojiThrowRateLimiter> RateLimiter,
        Mock<ISingleClientProxy> CallerClient,
        Mock<IClientProxy> GroupClient);
}
