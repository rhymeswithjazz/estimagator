using System.Collections.Concurrent;

namespace PokerPoints.Api.Services;

public interface IEmojiThrowRateLimiter
{
    bool TryAcquire(string connectionId, TimeSpan cooldown);
}

public class EmojiThrowRateLimiter : IEmojiThrowRateLimiter
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> _lastThrowByConnection = new();

    public bool TryAcquire(string connectionId, TimeSpan cooldown)
    {
        var now = DateTimeOffset.UtcNow;

        while (true)
        {
            if (!_lastThrowByConnection.TryGetValue(connectionId, out var lastThrow))
            {
                if (_lastThrowByConnection.TryAdd(connectionId, now))
                {
                    return true;
                }

                continue;
            }

            if (now - lastThrow < cooldown)
            {
                return false;
            }

            if (_lastThrowByConnection.TryUpdate(connectionId, now, lastThrow))
            {
                return true;
            }
        }
    }
}
