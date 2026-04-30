using Microsoft.EntityFrameworkCore;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface IParticipantService
{
    Task<Participant> JoinSessionAsync(Guid sessionId, string displayName, bool isObserver, bool isOrganizer, string connectionId, Guid? userId = null);
    Task<Participant?> ReconnectAsync(Guid sessionId, Guid participantId, string connectionId, Guid? userId = null);
    Task<Participant?> ClaimGuestHostAsync(Guid sessionId, string displayName, bool isObserver, string connectionId, string guestHostToken, Guid? existingParticipantId = null, Guid? userId = null);
    Task DisconnectAsync(string connectionId);
    Task<Participant?> GetByConnectionIdAsync(string connectionId);
    Task<Participant?> GetByIdAsync(Guid participantId);
    Task<Participant?> UpdateRoleAsync(string connectionId, bool isObserver);
    Task<bool> IsOrganizerAsync(string connectionId, Guid sessionId);
    Task<HostTransferResult> TransferHostAsync(Guid currentHostParticipantId, Guid targetParticipantId);
}

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

    public async Task<Participant> JoinSessionAsync(
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

        _db.Participants.Add(participant);
        await _db.SaveChangesAsync();

        return participant;
    }

    public async Task<Participant?> ReconnectAsync(Guid sessionId, Guid participantId, string connectionId, Guid? userId = null)
    {
        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.Id == participantId && p.SessionId == sessionId);
        if (participant == null) return null;

        participant.ConnectionId = connectionId;
        participant.UserId ??= userId;
        await _db.SaveChangesAsync();

        return participant;
    }

    public async Task<Participant?> ClaimGuestHostAsync(
        Guid sessionId,
        string displayName,
        bool isObserver,
        string connectionId,
        string guestHostToken,
        Guid? existingParticipantId = null,
        Guid? userId = null)
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

        foreach (var participant in session.Participants.Where(p => p.IsOrganizer))
        {
            participant.IsOrganizer = false;
        }

        var host = existingParticipantId.HasValue
            ? session.Participants.FirstOrDefault(p => p.Id == existingParticipantId.Value)
            : null;

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
            _db.Participants.Add(host);
        }
        else
        {
            host.DisplayName = displayName;
            host.IsObserver = isObserver;
            host.ConnectionId = connectionId;
            host.UserId ??= userId;
        }

        host.IsOrganizer = true;
        session.GuestHostClaimedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        if (transaction != null)
        {
            await transaction.CommitAsync();
        }

        return host;
    }

    public async Task DisconnectAsync(string connectionId)
    {
        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.ConnectionId == connectionId);

        if (participant != null)
        {
            participant.ConnectionId = null;
            await _db.SaveChangesAsync();
        }
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
