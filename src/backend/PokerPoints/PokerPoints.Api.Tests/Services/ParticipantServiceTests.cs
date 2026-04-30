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

        participant.UserId.Should().Be(userId);
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
        host!.IsOrganizer.Should().BeTrue();
        host.DisplayName.Should().Be("Creator");
        host.ConnectionId.Should().Be("creator-connection");

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
