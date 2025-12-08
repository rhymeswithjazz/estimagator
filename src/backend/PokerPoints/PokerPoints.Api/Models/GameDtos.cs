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
    List<VoteDto>? RevealedVotes
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

public record TimerEvent(int SecondsRemaining);
