namespace PokerPoints.Api.Models;

// User Management DTOs
public record AdminUserDto(
    Guid Id,
    string Email,
    string DisplayName,
    DateTime CreatedAt,
    bool EmailVerified,
    string Role,
    int SessionCount
);

public record AdminUserDetailDto(
    Guid Id,
    string Email,
    string DisplayName,
    DateTime CreatedAt,
    bool EmailVerified,
    string Role,
    string? ExternalProvider,
    List<AdminSessionSummaryDto> Sessions
);

public record UpdateUserRequest(
    string? DisplayName,
    string? Role,
    bool? EmailVerified
);

// Session Management DTOs
public record AdminSessionDto(
    Guid Id,
    string AccessCode,
    string? Name,
    string DeckType,
    bool IsActive,
    DateTime CreatedAt,
    string? OrganizerEmail,
    int ParticipantCount,
    int StoryCount
);

public record AdminSessionDetailDto(
    Guid Id,
    string AccessCode,
    string? Name,
    string DeckType,
    bool IsActive,
    DateTime CreatedAt,
    AdminUserSummaryDto? Organizer,
    List<AdminParticipantDto> Participants,
    List<AdminStoryDto> Stories
);

public record AdminSessionSummaryDto(
    Guid Id,
    string AccessCode,
    string? Name,
    bool IsActive,
    DateTime CreatedAt,
    bool IsOrganizer
);

public record AdminUserSummaryDto(
    Guid Id,
    string Email,
    string DisplayName
);

public record AdminParticipantDto(
    Guid Id,
    string DisplayName,
    bool IsObserver,
    bool IsOrganizer,
    Guid? UserId
);

public record AdminStoryDto(
    Guid Id,
    string Title,
    string Status,
    decimal? FinalScore,
    int VoteCount
);

// Pagination
public record PagedResult<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize
);
