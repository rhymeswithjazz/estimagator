using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface IAdminService
{
    // User Management
    Task<PagedResult<AdminUserDto>> GetUsersAsync(int page, int pageSize, string? search);
    Task<AdminUserDetailDto?> GetUserDetailAsync(Guid userId);
    Task<AdminUserDto?> UpdateUserAsync(Guid userId, UpdateUserRequest request);
    Task<bool> DeleteUserAsync(Guid userId);
    Task<string?> ResendUserVerificationAsync(Guid userId);

    // Session Management
    Task<PagedResult<AdminSessionDto>> GetSessionsAsync(int page, int pageSize, string? search, bool? isActive);
    Task<AdminSessionDetailDto?> GetSessionDetailAsync(Guid sessionId);
    Task<bool> DeleteSessionAsync(Guid sessionId);
}

public class AdminService : IAdminService
{
    private readonly PokerPointsDbContext _db;

    public AdminService(PokerPointsDbContext db)
    {
        _db = db;
    }

    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(int page, int pageSize, string? search)
    {
        var query = _db.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLowerInvariant();
            query = query.Where(u =>
                (u.Email != null && u.Email.Contains(searchLower)) ||
                (u.DisplayName != null && u.DisplayName.ToLower().Contains(searchLower)));
        }

        var totalCount = await query.CountAsync();

        var users = await query
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new AdminUserDto(
                u.Id,
                u.Email ?? "",
                u.DisplayName ?? "",
                u.CreatedAt,
                u.EmailVerified,
                u.Role.ToString(),
                u.Sessions.Count
            ))
            .ToListAsync();

        return new PagedResult<AdminUserDto>(users, totalCount, page, pageSize);
    }

    public async Task<AdminUserDetailDto?> GetUserDetailAsync(Guid userId)
    {
        var user = await _db.Users
            .Include(u => u.Sessions)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null) return null;

        var participatedSessions = await _db.Participants
            .Where(p => p.UserId == userId)
            .Include(p => p.Session)
            .Select(p => p.Session)
            .ToListAsync();

        var allSessions = user.Sessions
            .Select(s => new AdminSessionSummaryDto(s.Id, s.AccessCode, s.Name, s.IsActive, s.CreatedAt, true))
            .Concat(participatedSessions
                .Where(s => s.OrganizerId != userId)
                .Select(s => new AdminSessionSummaryDto(s.Id, s.AccessCode, s.Name, s.IsActive, s.CreatedAt, false)))
            .OrderByDescending(s => s.CreatedAt)
            .ToList();

        return new AdminUserDetailDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName ?? "",
            user.CreatedAt,
            user.EmailVerified,
            user.Role.ToString(),
            user.ExternalProvider,
            allSessions
        );
    }

    public async Task<AdminUserDto?> UpdateUserAsync(Guid userId, UpdateUserRequest request)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return null;

        if (request.DisplayName != null)
            user.DisplayName = request.DisplayName;

        if (request.Role != null && Enum.TryParse<UserRole>(request.Role, out var role))
            user.Role = role;

        if (request.EmailVerified.HasValue)
            user.EmailVerified = request.EmailVerified.Value;

        await _db.SaveChangesAsync();

        var sessionCount = await _db.Sessions.CountAsync(s => s.OrganizerId == userId);

        return new AdminUserDto(
            user.Id,
            user.Email ?? "",
            user.DisplayName ?? "",
            user.CreatedAt,
            user.EmailVerified,
            user.Role.ToString(),
            sessionCount
        );
    }

    public async Task<bool> DeleteUserAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return false;

        // Prevent deleting admin users (safety)
        if (user.Role == UserRole.Admin) return false;

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<string?> ResendUserVerificationAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null || user.EmailVerified) return null;

        var token = GenerateSecureToken();
        user.EmailVerificationToken = token;
        user.EmailVerificationTokenExpiresAt = DateTime.UtcNow.AddHours(24);
        await _db.SaveChangesAsync();

        return token;
    }

    public async Task<PagedResult<AdminSessionDto>> GetSessionsAsync(int page, int pageSize, string? search, bool? isActive)
    {
        var query = _db.Sessions
            .Include(s => s.Organizer)
            .Include(s => s.Participants)
            .Include(s => s.Stories)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchUpper = search.ToUpperInvariant();
            query = query.Where(s =>
                s.AccessCode.Contains(searchUpper) ||
                (s.Name != null && s.Name.ToUpper().Contains(searchUpper)));
        }

        if (isActive.HasValue)
            query = query.Where(s => s.IsActive == isActive.Value);

        var totalCount = await query.CountAsync();

        var sessions = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new AdminSessionDto(
                s.Id,
                s.AccessCode,
                s.Name,
                s.DeckType,
                s.IsActive,
                s.CreatedAt,
                s.Organizer != null ? s.Organizer.Email : null,
                s.Participants.Count,
                s.Stories.Count
            ))
            .ToListAsync();

        return new PagedResult<AdminSessionDto>(sessions, totalCount, page, pageSize);
    }

    public async Task<AdminSessionDetailDto?> GetSessionDetailAsync(Guid sessionId)
    {
        var session = await _db.Sessions
            .Include(s => s.Organizer)
            .Include(s => s.Participants)
            .Include(s => s.Stories)
                .ThenInclude(st => st.Votes)
            .FirstOrDefaultAsync(s => s.Id == sessionId);

        if (session == null) return null;

        return new AdminSessionDetailDto(
            session.Id,
            session.AccessCode,
            session.Name,
            session.DeckType,
            session.IsActive,
            session.CreatedAt,
            session.Organizer != null
                ? new AdminUserSummaryDto(session.Organizer.Id, session.Organizer.Email ?? "", session.Organizer.DisplayName ?? "")
                : null,
            session.Participants.Select(p => new AdminParticipantDto(
                p.Id, p.DisplayName, p.IsObserver, p.IsOrganizer, p.UserId
            )).ToList(),
            session.Stories.Select(s => new AdminStoryDto(
                s.Id, s.Title, s.Status, s.FinalScore, s.Votes.Count
            )).ToList()
        );
    }

    public async Task<bool> DeleteSessionAsync(Guid sessionId)
    {
        var session = await _db.Sessions.FindAsync(sessionId);
        if (session == null) return false;

        _db.Sessions.Remove(session);
        await _db.SaveChangesAsync();
        return true;
    }

    private static string GenerateSecureToken()
    {
        var bytes = new byte[32];
        using var rng = System.Security.Cryptography.RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes).Replace("+", "-").Replace("/", "_").TrimEnd('=');
    }
}
