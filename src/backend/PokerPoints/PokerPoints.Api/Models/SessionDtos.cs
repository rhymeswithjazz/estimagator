namespace PokerPoints.Api.Models;

public record CreateSessionRequest(string DeckType = "fibonacci");

public record CreateSessionResponse(Guid SessionId, string AccessCode);

public record SessionInfoResponse(
    Guid Id,
    string AccessCode,
    string DeckType,
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
