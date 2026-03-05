using System.Text.Json.Serialization;

namespace PokerPoints.Api.Models;

public record CreateSessionRequest(
    string DeckType = "fibonacci",
    string? Name = null,
    int TimerDurationSeconds = 300
);

public record CreateSessionResponse(Guid SessionId, string AccessCode, string? Name, int TimerDurationSeconds);

public record SessionInfoResponse(
    Guid Id,
    string AccessCode,
    string? Name,
    string DeckType,
    int TimerDurationSeconds,
    bool IsActive,
    DateTime CreatedAt,
    List<ParticipantDto> Participants,
    StoryDto? CurrentStory
);

public record JoinSessionRequest(string SessionCode, string DisplayName, bool IsObserver = false);

public record ParticipantDto(
    Guid Id,
    string DisplayName,
    bool IsObserver,
    bool IsOrganizer,
    bool IsConnected
);

public record StoryDto(
    Guid Id,
    string Title,
    string? Url,
    string Status,
    decimal? FinalScore
);

public record CreateStoryRequest(string Title, string? Url = null);

public record SessionHistoryResponse(
    Guid Id,
    string AccessCode,
    string? Name,
    string DeckType,
    bool IsActive,
    DateTime CreatedAt,
    List<ParticipantDto> Participants,
    List<StoryHistoryDto> Stories
);

public record StoryHistoryDto(
    Guid Id,
    string Title,
    string? Url,
    string Status,
    decimal? FinalScore,
    List<VoteDto> Votes
);

public record UserSessionResponse(
    Guid Id,
    string AccessCode,
    string? Name,
    string DeckType,
    bool IsActive,
    DateTime CreatedAt,
    List<ParticipantDto> Participants,
    StoryDto? CurrentStory,
    bool IsOrganizer
);

