using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using PokerPoints.Api.Hubs;
using PokerPoints.Api.Models;

namespace PokerPoints.Api.Services;

public interface ITimerService
{
    void StartTimer(string accessCode, int durationSeconds);
    void ExtendTimer(string accessCode, int additionalSeconds);
    void StopTimer(string accessCode);
    TimerStateDto? GetTimerState(string accessCode);
}

public class TimerService : ITimerService, IDisposable
{
    private readonly ConcurrentDictionary<string, TimerEntry> _timers = new();
    private readonly IHubContext<PokerHub> _hubContext;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TimerService> _logger;

    public TimerService(
        IHubContext<PokerHub> hubContext,
        IServiceScopeFactory scopeFactory,
        ILogger<TimerService> logger)
    {
        _hubContext = hubContext;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void StartTimer(string accessCode, int durationSeconds)
    {
        var code = accessCode.ToUpperInvariant();
        StopTimer(code);

        var endTime = DateTimeOffset.UtcNow.AddSeconds(durationSeconds);
        var cts = new CancellationTokenSource();

        var entry = new TimerEntry(endTime, durationSeconds, cts);
        _timers[code] = entry;

        _ = RunTimerAsync(code, endTime, cts.Token);
    }

    public void ExtendTimer(string accessCode, int additionalSeconds)
    {
        var code = accessCode.ToUpperInvariant();
        if (!_timers.TryGetValue(code, out var entry)) return;

        var newEndTime = entry.EndTimeUtc.AddSeconds(additionalSeconds);
        var newCts = new CancellationTokenSource();

        // Cancel old timer task
        entry.Cts.Cancel();
        entry.Cts.Dispose();

        var newEntry = new TimerEntry(newEndTime, entry.DurationSeconds, newCts);
        _timers[code] = newEntry;

        _ = RunTimerAsync(code, newEndTime, newCts.Token);
    }

    public void StopTimer(string accessCode)
    {
        var code = accessCode.ToUpperInvariant();
        if (_timers.TryRemove(code, out var entry))
        {
            entry.Cts.Cancel();
            entry.Cts.Dispose();
        }
    }

    public TimerStateDto? GetTimerState(string accessCode)
    {
        var code = accessCode.ToUpperInvariant();
        if (!_timers.TryGetValue(code, out var entry)) return null;

        if (entry.EndTimeUtc <= DateTimeOffset.UtcNow)
        {
            _timers.TryRemove(code, out _);
            return null;
        }

        return new TimerStateDto(entry.EndTimeUtc, entry.DurationSeconds);
    }

    private async Task RunTimerAsync(string accessCode, DateTimeOffset endTime, CancellationToken ct)
    {
        try
        {
            var delay = endTime - DateTimeOffset.UtcNow;
            if (delay > TimeSpan.Zero)
            {
                await Task.Delay(delay, ct);
            }

            if (ct.IsCancellationRequested) return;

            // Timer expired — remove entry
            _timers.TryRemove(accessCode, out _);

            _logger.LogInformation("Timer expired for session {AccessCode}", accessCode);

            // Auto-reveal votes
            await AutoRevealVotesAsync(accessCode);

            // Notify clients
            await _hubContext.Clients.Group(accessCode).SendAsync("TimerExpired", ct);
        }
        catch (OperationCanceledException)
        {
            // Timer was stopped or extended — expected
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in timer callback for session {AccessCode}", accessCode);
        }
    }

    private async Task AutoRevealVotesAsync(string accessCode)
    {
        using var scope = _scopeFactory.CreateScope();
        var votingService = scope.ServiceProvider.GetRequiredService<IVotingService>();
        var sessionService = scope.ServiceProvider.GetRequiredService<ISessionService>();

        var gameState = await sessionService.GetGameStateAsync(accessCode);
        if (gameState?.CurrentStory == null) return;

        // Only auto-reveal if votes haven't been revealed yet
        if (gameState.RevealedVotes != null) return;

        var result = await votingService.RevealVotesAsync(gameState.CurrentStory.Id);
        var completedStory = await sessionService.CompleteStoryAsync(gameState.CurrentStory.Id, result.Average);

        await _hubContext.Clients.Group(accessCode).SendAsync("VotesRevealed", result);

        if (completedStory != null)
        {
            await _hubContext.Clients.Group(accessCode).SendAsync("StoryUpdated", new StoryUpdatedEvent(
                new StoryDto(completedStory.Id, completedStory.Title, completedStory.Url, completedStory.Status, completedStory.FinalScore)
            ));
        }
    }

    public void Dispose()
    {
        foreach (var entry in _timers.Values)
        {
            entry.Cts.Cancel();
            entry.Cts.Dispose();
        }
        _timers.Clear();
    }

    private sealed record TimerEntry(DateTimeOffset EndTimeUtc, int DurationSeconds, CancellationTokenSource Cts);
}
