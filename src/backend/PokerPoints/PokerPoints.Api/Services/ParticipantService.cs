using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface IParticipantService
{
    Task<Participant> JoinSessionAsync(Guid sessionId, string displayName, bool isObserver, bool isOrganizer, string connectionId);
    Task<Participant?> ReconnectAsync(Guid participantId, string connectionId);
    Task DisconnectAsync(string connectionId);
    Task<Participant?> GetByConnectionIdAsync(string connectionId);
    Task<Participant?> GetByIdAsync(Guid participantId);
    Task<bool> IsOrganizerAsync(string connectionId, Guid sessionId);
}

public class ParticipantService : IParticipantService
{
    private readonly PokerPointsDbContext _db;

    public ParticipantService(PokerPointsDbContext db)
    {
        _db = db;
    }

    public async Task<Participant> JoinSessionAsync(Guid sessionId, string displayName, bool isObserver, bool isOrganizer, string connectionId)
    {
        var participant = new Participant
        {
            SessionId = sessionId,
            DisplayName = displayName,
            IsObserver = isObserver,
            IsOrganizer = isOrganizer,
            ConnectionId = connectionId
        };

        _db.Participants.Add(participant);
        await _db.SaveChangesAsync();

        return participant;
    }

    public async Task<Participant?> ReconnectAsync(Guid participantId, string connectionId)
    {
        var participant = await _db.Participants.FindAsync(participantId);
        if (participant == null) return null;

        participant.ConnectionId = connectionId;
        await _db.SaveChangesAsync();

        return participant;
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

    public async Task<bool> IsOrganizerAsync(string connectionId, Guid sessionId)
    {
        var participant = await _db.Participants
            .FirstOrDefaultAsync(p => p.ConnectionId == connectionId && p.SessionId == sessionId);

        return participant?.IsOrganizer ?? false;
    }
}
