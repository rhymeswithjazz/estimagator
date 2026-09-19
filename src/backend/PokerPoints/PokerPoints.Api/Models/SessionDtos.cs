using System.Text.Json.Serialization;
using PokerPoints.Api.Jira;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Models;

public record CreateSessionRequest(
    string DeckType = "fibonacci",
    string? Name = null,
    int TimerDurationSeconds = 300
);

public record CreateSessionResponse(
    Guid SessionId,
    string AccessCode,
    string? Name,
    int TimerDurationSeconds,
    string? GuestHostToken = null
);

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
    decimal? FinalScore,
    decimal? AgreedEstimate = null,
    int EstimateRevision = 0,
    JiraLinkDto? Jira = null
)
{
    public static StoryDto From(Story s) => new(s.Id, s.Title, s.Url, s.Status, s.FinalScore,
        s.AgreedEstimate, s.EstimateRevision, JiraLinkDto.From(s));
}

public record CreateStoryRequest(string Title, string? Url = null);

public record SessionHistoryResponse(
    Guid Id,
    string AccessCode,
    string? Name,
    string DeckType,
    bool IsActive,
    DateTime CreatedAt,
    List<ParticipantDto> Participants,
    List<StoryHistoryDto> Stories,
    bool CanManageEstimates = false
);

public record StoryHistoryDto(
    Guid Id,
    string Title,
    string? Url,
    string Status,
    decimal? FinalScore,
    List<VoteDto> Votes,
    decimal? AgreedEstimate = null,
    int EstimateRevision = 0,
    JiraLinkDto? Jira = null
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
