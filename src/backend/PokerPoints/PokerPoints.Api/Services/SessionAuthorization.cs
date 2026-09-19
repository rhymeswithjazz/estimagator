using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Jira;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public class SessionAuthorization(PokerPointsDbContext db)
{
    public static bool CanManage(Session session, Guid userId) => session.IsActive
        ? session.OrganizerId == userId && session.Participants.Any(p => p.UserId == userId && p.IsOrganizer)
        : session.EndingHostUserId == userId;

    public async Task<Session> RequireHostAsync(string code, Guid userId, bool activeOnly = false)
    {
        var session = await db.Sessions.AsNoTracking().Include(s => s.Participants)
            .SingleOrDefaultAsync(s => s.AccessCode == code.ToUpperInvariant());
        if (session == null) throw new JiraException(404, "not_found", "Session not found.");
        if (!CanManage(session, userId) || (activeOnly && !session.IsActive))
            throw new JiraException(403, "host_required", "Only the current host, or registered ending host, can do this.");
        return session;
    }
}
