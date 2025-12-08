using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Services;

public interface IVotingService
{
    Task<Vote> CastVoteAsync(Guid storyId, Guid participantId, string cardValue);
    Task<List<VoteStatusDto>> GetVoteStatusesAsync(Guid storyId, List<Guid> participantIds);
    Task<VotesRevealedEvent> RevealVotesAsync(Guid storyId);
    Task ResetVotesAsync(Guid storyId);
}

public class VotingService : IVotingService
{
    private readonly PokerPointsDbContext _db;

    public VotingService(PokerPointsDbContext db)
    {
        _db = db;
    }

    public async Task<Vote> CastVoteAsync(Guid storyId, Guid participantId, string cardValue)
    {
        var existingVote = await _db.Votes
            .FirstOrDefaultAsync(v => v.StoryId == storyId && v.ParticipantId == participantId);

        if (existingVote != null)
        {
            existingVote.CardValue = cardValue;
            existingVote.CreatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            return existingVote;
        }

        var vote = new Vote
        {
            StoryId = storyId,
            ParticipantId = participantId,
            CardValue = cardValue
        };

        _db.Votes.Add(vote);
        await _db.SaveChangesAsync();

        return vote;
    }

    public async Task<List<VoteStatusDto>> GetVoteStatusesAsync(Guid storyId, List<Guid> participantIds)
    {
        var votedParticipantIds = await _db.Votes
            .Where(v => v.StoryId == storyId)
            .Select(v => v.ParticipantId)
            .ToListAsync();

        return participantIds.Select(pid => new VoteStatusDto(
            pid,
            votedParticipantIds.Contains(pid)
        )).ToList();
    }

    public async Task<VotesRevealedEvent> RevealVotesAsync(Guid storyId)
    {
        var votes = await _db.Votes
            .Include(v => v.Participant)
            .Where(v => v.StoryId == storyId)
            .ToListAsync();

        var voteDtos = votes.Select(v => new VoteDto(
            v.ParticipantId,
            v.Participant.DisplayName,
            v.CardValue
        )).ToList();

        var (average, isConsensus) = CalculateResults(votes);

        return new VotesRevealedEvent(voteDtos, average, isConsensus);
    }

    public async Task ResetVotesAsync(Guid storyId)
    {
        var votes = await _db.Votes
            .Where(v => v.StoryId == storyId)
            .ToListAsync();

        _db.Votes.RemoveRange(votes);
        await _db.SaveChangesAsync();
    }

    private static (decimal? Average, bool IsConsensus) CalculateResults(List<Vote> votes)
    {
        var numericVotes = votes
            .Where(v => decimal.TryParse(v.CardValue, out _))
            .Select(v => decimal.Parse(v.CardValue!))
            .ToList();

        if (numericVotes.Count == 0)
            return (null, false);

        var average = Math.Round(numericVotes.Average(), 1);
        var isConsensus = numericVotes.Distinct().Count() == 1;

        return (average, isConsensus);
    }
}
