namespace PokerPoints.Api.Models;

public record VoteDto(
    Guid ParticipantId,
    string DisplayName,
    string? CardValue
);

public record GameStateResponse(
    SessionInfoResponse Session,
    StoryDto? CurrentStory,
    List<ParticipantDto> Participants,
    List<VoteStatusDto> VoteStatuses,
    List<VoteDto>? RevealedVotes,
    TimerStateDto? ActiveTimer
);

public record VoteStatusDto(
    Guid ParticipantId,
    bool HasVoted
);

// Hub event payloads
public record UserJoinedEvent(ParticipantDto Participant);

public record UserLeftEvent(Guid ParticipantId);

public record VoteCastEvent(Guid ParticipantId);

public record VotesRevealedEvent(List<VoteDto> Votes, decimal? Average, bool IsConsensus);

public record VotesResetEvent(Guid? StoryId);

public record StoryUpdatedEvent(StoryDto Story);

public record TimerStartedEvent(DateTimeOffset EndTimeUtc, int DurationSeconds);

public record TimerExtendedEvent(DateTimeOffset EndTimeUtc);

public record TimerStateDto(DateTimeOffset EndTimeUtc, int DurationSeconds);

public record EmojiThrownEvent(
    Guid ThrowId,
    Guid SenderParticipantId,
    string SenderDisplayName,
    Guid TargetParticipantId,
    string Emoji,
    DateTimeOffset SentAtUtc
);

public static class EmojiThrowOptions
{
    public static readonly TimeSpan Cooldown = TimeSpan.FromMilliseconds(200);

    public static readonly IReadOnlySet<string> AllowedEmojis = new HashSet<string>
    {
        "🎯",
        "✈️",
        "paper-ball",
        "❤️",
        "💩"
    };
}
