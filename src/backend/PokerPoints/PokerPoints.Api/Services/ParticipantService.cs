using Microsoft.EntityFrameworkCore;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface IParticipantService
{
    Task<ParticipantJoinResult> JoinSessionAsync(Guid sessionId, string displayName, bool isObserver, bool isOrganizer, string connectionId, Guid? userId = null);
    Task<ParticipantJoinResult?> ReconnectAsync(Guid sessionId, Guid participantId, string connectionId, Guid? userId = null, string? reconnectToken = null);
    Task<ParticipantJoinResult?> ClaimGuestHostAsync(Guid sessionId, string displayName, bool isObserver, string connectionId, string guestHostToken, Guid? existingParticipantId = null, Guid? userId = null, string? reconnectToken = null);
    Task<Participant?> DisconnectAsync(string connectionId);
    Task<Participant?> GetByConnectionIdAsync(string connectionId);
    Task<Participant?> GetByIdAsync(Guid participantId);
    Task<Participant?> UpdateRoleAsync(string connectionId, bool isObserver);
    Task<bool> IsOrganizerAsync(string connectionId, Guid sessionId);
    Task<HostTransferResult> TransferHostAsync(Guid currentHostParticipantId, Guid targetParticipantId);
}

// This result is caller-only: never broadcast its credential.
public record ParticipantJoinResult(Participant Participant, string? ReconnectToken, string? PreviousConnectionId = null);

public enum HostTransferStatus
{
    Success,
    CurrentParticipantNotFound,
    CurrentParticipantNotHost,
    TargetNotFound,
    TargetDifferentSession,
    TargetDisconnected,
    TargetAlreadyHost,
    SessionInactive
}

public record HostTransferResult(
    HostTransferStatus Status,
    Guid? PreviousHostParticipantId = null,
    Participant? NewHost = null
);

public class ParticipantService : IParticipantService
{
    private readonly PokerPointsDbContext _db;

    public ParticipantService(PokerPointsDbContext db)
    {
        _db = db;
    }

    public async Task<ParticipantJoinResult> JoinSessionAsync(
        Guid sessionId,
        string displayName,
        bool isObserver,
        bool isOrganizer,
        string connectionId,
        Guid? userId = null)
    {
        var participant = new Participant
        {
            SessionId = sessionId,
            DisplayName = displayName,
            IsObserver = isObserver,
            IsOrganizer = isOrganizer,
            ConnectionId = connectionId,
            UserId = userId
        };

        var result = IssueReconnectToken(participant);
        _db.Participants.Add(participant);
        await _db.SaveChangesAsync();

        return result;
    }

    public async Task<ParticipantJoinResult?> ReconnectAsync(Guid sessionId, Guid participantId, string connectionId, Guid? userId = null, string? reconnectToken = null)
    {
        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.Id == participantId && p.SessionId == sessionId);
        if (participant == null || !CanReconnect(participant, userId, reconnectToken)) return null;

        var previousConnectionId = participant.ConnectionId;
        participant.ConnectionId = connectionId;
        // Preserve guest-to-account linking, but only after the guest proved ownership.
        participant.UserId ??= userId;
        if (participant.UserId.HasValue) participant.ReconnectTokenHash = null;
        await _db.SaveChangesAsync();

        return new ParticipantJoinResult(participant, participant.UserId.HasValue ? null : reconnectToken, previousConnectionId);
    }

    public async Task<ParticipantJoinResult?> ClaimGuestHostAsync(
        Guid sessionId,
        string displayName,
        bool isObserver,
        string connectionId,
        string guestHostToken,
        Guid? existingParticipantId = null,
        Guid? userId = null,
        string? reconnectToken = null)
    {
        if (string.IsNullOrWhiteSpace(guestHostToken))
        {
            return null;
        }

        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync()
            : null;

        var session = await _db.Sessions
            .Include(s => s.Participants)
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.IsActive);

        if (session == null ||
            string.IsNullOrEmpty(session.GuestHostTokenHash) ||
            session.GuestHostClaimedAt.HasValue ||
            !GuestHostToken.Verify(guestHostToken, session.GuestHostTokenHash))
        {
            return null;
        }

        var host = existingParticipantId.HasValue
            ? session.Participants.FirstOrDefault(p => p.Id == existingParticipantId.Value)
            : null;

        // A creator reservation authorizes claiming host controls, not another participant's identity.
        if (existingParticipantId.HasValue && (host == null || !CanReconnect(host, userId, reconnectToken)))
        {
            return null;
        }

        foreach (var participant in session.Participants.Where(p => p.IsOrganizer))
        {
            participant.IsOrganizer = false;
        }

        var previousConnectionId = host?.ConnectionId;
        ParticipantJoinResult result;
        if (host == null)
        {
            host = new Participant
            {
                SessionId = sessionId,
                DisplayName = displayName,
                IsObserver = isObserver,
                ConnectionId = connectionId,
                UserId = userId
            };
            result = IssueReconnectToken(host);
            _db.Participants.Add(host);
        }
        else
        {
            host.DisplayName = displayName;
            host.IsObserver = isObserver;
            host.ConnectionId = connectionId;
            host.UserId ??= userId;
            if (host.UserId.HasValue) host.ReconnectTokenHash = null;
            result = new ParticipantJoinResult(host, host.UserId.HasValue ? null : reconnectToken, previousConnectionId);
        }

        host.IsOrganizer = true;
        session.GuestHostClaimedAt = DateTime.UtcNow;
        session.OrganizerId = host.UserId;

        await _db.SaveChangesAsync();

        if (transaction != null)
        {
            await transaction.CommitAsync();
        }

        return result;
    }

    private static bool CanReconnect(Participant participant, Guid? userId, string? reconnectToken)
    {
        // Account-bound participants cannot fall back to a guest proof or silently change owner.
        if (participant.UserId.HasValue) return participant.UserId == userId;

        return !string.IsNullOrWhiteSpace(reconnectToken) &&
            !string.IsNullOrEmpty(participant.ReconnectTokenHash) &&
            GuestHostToken.Verify(reconnectToken, participant.ReconnectTokenHash);
    }

    private static ParticipantJoinResult IssueReconnectToken(Participant participant)
    {
        // Use the same cryptographic primitives as reservations, but a distinct random credential.
        var token = participant.UserId.HasValue ? null : GuestHostToken.Generate();
        participant.ReconnectTokenHash = token == null ? null : GuestHostToken.Hash(token);
        return new ParticipantJoinResult(participant, token);
    }

    public async Task<Participant?> DisconnectAsync(string connectionId)
    {
        var participant = await GetByConnectionIdAsync(connectionId);

        if (participant != null)
        {
            participant.ConnectionId = null;
            await _db.SaveChangesAsync();
        }

        return participant;
    }

    public async Task<Participant?> GetByConnectionIdAsync(string connectionId)
    {
        return await _db.Participants
            .Include(p => p.Session)
            .FirstOrDefaultAsync(p => p.ConnectionId == connectionId);
    }

    public async Task<Participant?> GetByIdAsync(Guid participantId)
    {
        return await _db.Participants
            .Include(p => p.Session)
            .FirstOrDefaultAsync(p => p.Id == participantId);
    }

    public async Task<Participant?> UpdateRoleAsync(string connectionId, bool isObserver)
    {
        var participant = await _db.Participants
            .Include(p => p.Session)
            .FirstOrDefaultAsync(p => p.ConnectionId == connectionId);

        if (participant == null) return null;

        participant.IsObserver = isObserver;
        await _db.SaveChangesAsync();

        return participant;
    }

    public async Task<bool> IsOrganizerAsync(string connectionId, Guid sessionId)
    {
        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.ConnectionId == connectionId && p.SessionId == sessionId);

        return participant?.IsOrganizer ?? false;
    }

    public async Task<HostTransferResult> TransferHostAsync(Guid currentHostParticipantId, Guid targetParticipantId)
    {
        var currentHost = await _db.Participants
            .Include(p => p.Session)
            .FirstOrDefaultAsync(p => p.Id == currentHostParticipantId);

        if (currentHost == null)
        {
            return new HostTransferResult(HostTransferStatus.CurrentParticipantNotFound);
        }

        if (!currentHost.IsOrganizer)
        {
            return new HostTransferResult(HostTransferStatus.CurrentParticipantNotHost);
        }

        if (!currentHost.Session.IsActive)
        {
            return new HostTransferResult(HostTransferStatus.SessionInactive);
        }

        var target = await _db.Participants
            .Include(p => p.Session)
            .FirstOrDefaultAsync(p => p.Id == targetParticipantId);

        if (target == null)
        {
            return new HostTransferResult(HostTransferStatus.TargetNotFound);
        }

        if (target.SessionId != currentHost.SessionId)
        {
            return new HostTransferResult(HostTransferStatus.TargetDifferentSession);
        }

        if (string.IsNullOrEmpty(target.ConnectionId))
        {
            return new HostTransferResult(HostTransferStatus.TargetDisconnected);
        }

        if (target.IsOrganizer)
        {
            return new HostTransferResult(HostTransferStatus.TargetAlreadyHost);
        }

        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync()
            : null;

        var sessionParticipants = await _db.Participants
            .Where(p => p.SessionId == currentHost.SessionId && p.IsOrganizer)
            .ToListAsync();

        foreach (var participant in sessionParticipants)
        {
            participant.IsOrganizer = false;
        }

        target.IsOrganizer = true;
        currentHost.Session.OrganizerId = target.UserId;

        await _db.SaveChangesAsync();

        if (transaction != null)
        {
            await transaction.CommitAsync();
        }

        return new HostTransferResult(
            HostTransferStatus.Success,
            currentHostParticipantId,
            target
        );
    }
}
