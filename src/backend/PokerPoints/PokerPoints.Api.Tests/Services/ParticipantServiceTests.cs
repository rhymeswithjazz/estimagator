using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Services;
using PokerPoints.Data;
using PokerPoints.Data.Entities;
using Xunit;

namespace PokerPoints.Api.Tests.Services;

public class ParticipantServiceTests : IDisposable
{
    private readonly PokerPointsDbContext _db;
    private readonly ParticipantService _service;

    public ParticipantServiceTests()
    {
        var options = new DbContextOptionsBuilder<PokerPointsDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _db = new PokerPointsDbContext(options);
        _service = new ParticipantService(_db);
    }

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    [Fact]
    public async Task JoinSessionAsync_ShouldLinkAuthenticatedUser()
    {
        var session = CreateSession();
        var userId = Guid.NewGuid();
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var participant = await _service.JoinSessionAsync(
            session.Id,
            "Riley",
            isObserver: false,
            isOrganizer: true,
            connectionId: "conn-1",
            userId);

        participant.Participant.UserId.Should().Be(userId);
    }

    [Fact]
    public async Task ClaimGuestHostAsync_ShouldPromoteTokenHolderAndMarkTokenClaimed()
    {
        var token = GuestHostToken.Generate();
        var session = CreateSession();
        session.GuestHostTokenHash = GuestHostToken.Hash(token);
        var accidentalHost = CreateParticipant(session, "Other", "other-connection", isOrganizer: true);
        _db.Sessions.Add(session);
        _db.Participants.Add(accidentalHost);
        await _db.SaveChangesAsync();

        var host = await _service.ClaimGuestHostAsync(
            session.Id,
            "Creator",
            isObserver: false,
            connectionId: "creator-connection",
            guestHostToken: token);

        host.Should().NotBeNull();
        host!.Participant.IsOrganizer.Should().BeTrue();
        host.Participant.DisplayName.Should().Be("Creator");
        host.Participant.ConnectionId.Should().Be("creator-connection");

        var updatedOther = await _db.Participants.FindAsync(accidentalHost.Id);
        updatedOther!.IsOrganizer.Should().BeFalse();

        var updatedSession = await _db.Sessions.FindAsync(session.Id);
        updatedSession!.GuestHostClaimedAt.Should().NotBeNull();
    }

    [Fact]
    public async Task ClaimGuestHostAsync_ShouldRejectInvalidToken()
    {
        var session = CreateSession();
        session.GuestHostTokenHash = GuestHostToken.Hash("correct-token");
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var host = await _service.ClaimGuestHostAsync(
            session.Id,
            "Creator",
            isObserver: false,
            connectionId: "creator-connection",
            guestHostToken: "wrong-token");

        host.Should().BeNull();
        (await _db.Participants.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task ReconnectAsync_ShouldRejectParticipantFromAnotherSession()
    {
        var session = CreateSession();
        var otherSession = CreateSession("ZZZ999");
        var otherParticipant = CreateParticipant(otherSession, "Other", "old-connection");
        _db.Sessions.AddRange(session, otherSession);
        _db.Participants.Add(otherParticipant);
        await _db.SaveChangesAsync();

        var reconnected = await _service.ReconnectAsync(
            session.Id,
            otherParticipant.Id,
            "new-connection");

        reconnected.Should().BeNull();
        var unchangedParticipant = await _db.Participants.FindAsync(otherParticipant.Id);
        unchangedParticipant!.ConnectionId.Should().Be("old-connection");
    }

    [Fact]
    public async Task TransferHostAsync_ShouldTransferToConnectedParticipantAndSetOrganizerId()
    {
        var userId = Guid.NewGuid();
        var (session, host, target) = await CreateSessionWithHostAndTargetAsync(targetUserId: userId);

        var result = await _service.TransferHostAsync(host.Id, target.Id);

        result.Status.Should().Be(HostTransferStatus.Success);
        result.NewHost!.Id.Should().Be(target.Id);

        var participants = await _db.Participants.Where(p => p.SessionId == session.Id).ToListAsync();
        participants.Single(p => p.Id == host.Id).IsOrganizer.Should().BeFalse();
        participants.Single(p => p.Id == target.Id).IsOrganizer.Should().BeTrue();

        var updatedSession = await _db.Sessions.FindAsync(session.Id);
        updatedSession!.OrganizerId.Should().Be(userId);
    }

    [Fact]
    public async Task TransferHostAsync_ShouldTransferToConnectedObserver()
    {
        var (_, host, target) = await CreateSessionWithHostAndTargetAsync(targetIsObserver: true);

        var result = await _service.TransferHostAsync(host.Id, target.Id);

        result.Status.Should().Be(HostTransferStatus.Success);
        var updatedTarget = await _db.Participants.FindAsync(target.Id);
        updatedTarget!.IsOrganizer.Should().BeTrue();
        updatedTarget.IsObserver.Should().BeTrue();
    }

    [Fact]
    public async Task TransferHostAsync_ShouldClearOrganizerId_WhenTargetIsGuest()
    {
        var organizerId = Guid.NewGuid();
        var (session, host, target) = await CreateSessionWithHostAndTargetAsync(
            organizerId: organizerId,
            targetUserId: null);

        var result = await _service.TransferHostAsync(host.Id, target.Id);

        result.Status.Should().Be(HostTransferStatus.Success);
        var updatedSession = await _db.Sessions.FindAsync(session.Id);
        updatedSession!.OrganizerId.Should().BeNull();
    }

    [Fact]
    public async Task TransferHostAsync_ShouldRejectDisconnectedTarget()
    {
        var (_, host, target) = await CreateSessionWithHostAndTargetAsync(targetConnectionId: null);

        var result = await _service.TransferHostAsync(host.Id, target.Id);

        result.Status.Should().Be(HostTransferStatus.TargetDisconnected);
    }

    [Fact]
    public async Task TransferHostAsync_ShouldRejectNonHostCaller()
    {
        var (_, host, target) = await CreateSessionWithHostAndTargetAsync();
        host.IsOrganizer = false;
        await _db.SaveChangesAsync();

        var result = await _service.TransferHostAsync(host.Id, target.Id);

        result.Status.Should().Be(HostTransferStatus.CurrentParticipantNotHost);
    }

    [Fact]
    public async Task TransferHostAsync_ShouldRejectCrossSessionTarget()
    {
        var (_, host, _) = await CreateSessionWithHostAndTargetAsync();
        var otherSession = CreateSession("ZZZ999");
        var otherTarget = CreateParticipant(otherSession, "Other", "other-connection");
        _db.Sessions.Add(otherSession);
        _db.Participants.Add(otherTarget);
        await _db.SaveChangesAsync();

        var result = await _service.TransferHostAsync(host.Id, otherTarget.Id);

        result.Status.Should().Be(HostTransferStatus.TargetDifferentSession);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ReconnectAsync_ShouldRejectUnprovenAccountOwnership(bool wrongAccount)
    {
        var session = CreateSession();
        var owner = Guid.NewGuid();
        var participant = CreateParticipant(session, "Host", "original", isOrganizer: true, userId: owner);
        participant.ReconnectTokenHash = GuestHostToken.Hash("guest-proof");
        _db.AddRange(session, participant);
        await _db.SaveChangesAsync();

        var result = await _service.ReconnectAsync(session.Id, participant.Id, "attacker",
            wrongAccount ? Guid.NewGuid() : null, "guest-proof");

        result.Should().BeNull();
        participant.ConnectionId.Should().Be("original");
        participant.UserId.Should().Be(owner);
        participant.IsOrganizer.Should().BeTrue();
    }

    [Fact]
    public async Task ReconnectAsync_ShouldRestoreAccountOwnerWithoutGuestProof()
    {
        var session = CreateSession();
        var owner = Guid.NewGuid();
        _db.Add(session);
        var joined = await _service.JoinSessionAsync(session.Id, "Host", false, true, "old", owner);
        joined.ReconnectToken.Should().BeNull();
        joined.Participant.ReconnectTokenHash.Should().BeNull();

        var result = await _service.ReconnectAsync(session.Id, joined.Participant.Id, "new", owner);

        result!.Participant.Id.Should().Be(joined.Participant.Id);
        result.Participant.IsOrganizer.Should().BeTrue();
        result.PreviousConnectionId.Should().Be("old");
        (await _service.GetByConnectionIdAsync("old")).Should().BeNull();
        await _service.DisconnectAsync("old");
        result.Participant.ConnectionId.Should().Be("new");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("incorrect")]
    public async Task ReconnectAsync_ShouldRejectMissingOrIncorrectGuestProof(string? proof)
    {
        var session = CreateSession();
        _db.Add(session);
        var joined = await _service.JoinSessionAsync(session.Id, "Host", false, true, "old");

        var result = await _service.ReconnectAsync(session.Id, joined.Participant.Id, "attacker", Guid.NewGuid(), proof);

        result.Should().BeNull();
        joined.Participant.ConnectionId.Should().Be("old");
        joined.Participant.UserId.Should().BeNull();
    }

    [Fact]
    public async Task GuestReconnect_ShouldUseHashAndPreserveIdentityRoleAndVotes()
    {
        var session = CreateSession();
        _db.Add(session);
        var joined = await _service.JoinSessionAsync(session.Id, "Guest", false, true, "old");
        joined.ReconnectToken.Should().NotBeNullOrEmpty();
        joined.Participant.ReconnectTokenHash.Should().NotBe(joined.ReconnectToken);
        GuestHostToken.Verify(joined.ReconnectToken!, joined.Participant.ReconnectTokenHash!).Should().BeTrue();
        var vote = new Vote { ParticipantId = joined.Participant.Id, Story = new Story { Session = session, Title = "Story" }, CardValue = "5" };
        _db.Add(vote);
        await _db.SaveChangesAsync();
        await _service.UpdateRoleAsync("old", true);
        await _service.DisconnectAsync("old");

        var result = await _service.ReconnectAsync(session.Id, joined.Participant.Id, "new", reconnectToken: joined.ReconnectToken);

        result!.Participant.Id.Should().Be(joined.Participant.Id);
        result.Participant.IsOrganizer.Should().BeTrue();
        result.Participant.IsObserver.Should().BeTrue();
        result.Participant.UserId.Should().BeNull();
        result.ReconnectToken.Should().Be(joined.ReconnectToken);
        (await _db.Votes.SingleAsync()).ParticipantId.Should().Be(joined.Participant.Id);
    }

    [Fact]
    public async Task ProvenGuestReconnect_ShouldLinkAccountAndRequireThatOwnerAfterwards()
    {
        var session = CreateSession();
        _db.Add(session);
        var joined = await _service.JoinSessionAsync(session.Id, "Guest", false, true, "old");
        var owner = Guid.NewGuid();

        var linked = await _service.ReconnectAsync(session.Id, joined.Participant.Id, "linked", owner, joined.ReconnectToken);

        linked!.Participant.UserId.Should().Be(owner);
        linked.Participant.ReconnectTokenHash.Should().BeNull();
        linked.ReconnectToken.Should().BeNull();
        (await _service.ReconnectAsync(session.Id, joined.Participant.Id, "anonymous", reconnectToken: joined.ReconnectToken)).Should().BeNull();
        (await _service.ReconnectAsync(session.Id, joined.Participant.Id, "wrong-account", Guid.NewGuid(), joined.ReconnectToken)).Should().BeNull();
        (await _service.ReconnectAsync(session.Id, joined.Participant.Id, "owner", owner)).Should().NotBeNull();
    }

    [Fact]
    public async Task ReconnectAsync_ShouldRejectLegacyGuestWithoutStoredHash()
    {
        var session = CreateSession();
        var participant = CreateParticipant(session, "Legacy host", "old", isOrganizer: true);
        _db.AddRange(session, participant);
        await _db.SaveChangesAsync();

        (await _service.ReconnectAsync(session.Id, participant.Id, "new", reconnectToken: "anything")).Should().BeNull();
        participant.ConnectionId.Should().Be("old");
    }

    [Fact]
    public async Task GuestProof_ShouldBeScopedToItsParticipantAndSession()
    {
        var session = CreateSession();
        var other = CreateSession("OTHER");
        _db.AddRange(session, other);
        var first = await _service.JoinSessionAsync(session.Id, "First", false, true, "first");
        var second = await _service.JoinSessionAsync(session.Id, "Second", false, false, "second");

        (await _service.ReconnectAsync(session.Id, first.Participant.Id, "new", reconnectToken: second.ReconnectToken)).Should().BeNull();
        (await _service.ReconnectAsync(other.Id, first.Participant.Id, "new", reconnectToken: first.ReconnectToken)).Should().BeNull();
        first.Participant.ConnectionId.Should().Be("first");
    }

    [Fact]
    public async Task ClaimGuestHostAsync_ShouldNotClaimAnotherIdentityWithOnlyCreatorReservation()
    {
        var session = CreateSession();
        session.GuestHostTokenHash = GuestHostToken.Hash("creator-reservation");
        _db.Add(session);
        var victim = await _service.JoinSessionAsync(session.Id, "Victim", false, false, "victim");

        var result = await _service.ClaimGuestHostAsync(session.Id, "Creator", false, "new",
            "creator-reservation", victim.Participant.Id);

        result.Should().BeNull();
        victim.Participant.ConnectionId.Should().Be("victim");
        victim.Participant.IsOrganizer.Should().BeFalse();
        session.GuestHostClaimedAt.Should().BeNull();
    }

    [Fact]
    public async Task ClaimGuestHostAsync_ShouldReuseAnExistingParticipantOnlyWithItsProof()
    {
        var session = CreateSession();
        session.GuestHostTokenHash = GuestHostToken.Hash("creator-reservation");
        _db.Add(session);
        var joined = await _service.JoinSessionAsync(session.Id, "Creator", false, false, "old");

        var claimed = await _service.ClaimGuestHostAsync(session.Id, "Creator", true, "new",
            "creator-reservation", joined.Participant.Id, reconnectToken: joined.ReconnectToken);

        claimed!.Participant.Id.Should().Be(joined.Participant.Id);
        claimed.Participant.IsOrganizer.Should().BeTrue();
        claimed.Participant.IsObserver.Should().BeTrue();
        claimed.ReconnectToken.Should().Be(joined.ReconnectToken);
        claimed.PreviousConnectionId.Should().Be("old");
        (await _db.Participants.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task GuestHostProof_ShouldSurviveTransferAndNeverRestoreOldHostPrivileges()
    {
        var session = CreateSession();
        session.GuestHostTokenHash = GuestHostToken.Hash("creator-reservation");
        _db.Add(session);
        await _db.SaveChangesAsync();
        var first = (await _service.ClaimGuestHostAsync(session.Id, "Creator", false, "first", "creator-reservation"))!;
        first.ReconnectToken.Should().NotBe("creator-reservation");
        var target = await _service.JoinSessionAsync(session.Id, "Target", true, false, "target");
        (await _service.TransferHostAsync(first.Participant.Id, target.Participant.Id)).Status.Should().Be(HostTransferStatus.Success);

        var oldHost = await _service.ReconnectAsync(session.Id, first.Participant.Id, "old-host-rejoin", reconnectToken: first.ReconnectToken);
        var newHost = await _service.ReconnectAsync(session.Id, target.Participant.Id, "new-host-rejoin", reconnectToken: target.ReconnectToken);

        oldHost!.Participant.IsOrganizer.Should().BeFalse();
        newHost!.Participant.IsOrganizer.Should().BeTrue();
        newHost.Participant.IsObserver.Should().BeTrue();
        (await _service.ClaimGuestHostAsync(session.Id, "Creator", false, "reclaim", "creator-reservation")).Should().BeNull();
    }

    private async Task<(Session Session, Participant Host, Participant Target)> CreateSessionWithHostAndTargetAsync(
        Guid? organizerId = null,
        Guid? targetUserId = null,
        bool targetIsObserver = false,
        string? targetConnectionId = "target-connection")
    {
        var hostUserId = organizerId ?? Guid.NewGuid();
        var session = CreateSession(organizerId: hostUserId);
        var host = CreateParticipant(session, "Host", "host-connection", isOrganizer: true, userId: hostUserId);
        var target = CreateParticipant(
            session,
            "Target",
            targetConnectionId,
            isObserver: targetIsObserver,
            userId: targetUserId);

        _db.Sessions.Add(session);
        _db.Participants.AddRange(host, target);
        await _db.SaveChangesAsync();

        return (session, host, target);
    }

    private static Session CreateSession(string accessCode = "ABC123", Guid? organizerId = null) => new()
    {
        AccessCode = accessCode,
        DeckType = "fibonacci",
        IsActive = true,
        OrganizerId = organizerId
    };

    private static Participant CreateParticipant(
        Session session,
        string displayName,
        string? connectionId,
        bool isOrganizer = false,
        bool isObserver = false,
        Guid? userId = null) => new()
        {
            Session = session,
            SessionId = session.Id,
            DisplayName = displayName,
            ConnectionId = connectionId,
            IsOrganizer = isOrganizer,
            IsObserver = isObserver,
            UserId = userId
        };
}
