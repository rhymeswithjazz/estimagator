using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using PokerPoints.Data;

namespace PokerPoints.Api.Jira;

// PostgreSQL session locks coordinate API instances. The local branch is only for in-memory tests.
public class JiraLocks(PokerPointsDbContext db)
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Local = new();
    public async Task<IAsyncDisposable> AcquireAsync(string key)
    {
        if (!db.Database.IsNpgsql())
        {
            var gate = Local.GetOrAdd(key, _ => new(1, 1));
            await gate.WaitAsync();
            return new Lease(() => { gate.Release(); return ValueTask.CompletedTask; });
        }
        var connection = new NpgsqlConnection(db.Database.GetConnectionString());
        await connection.OpenAsync();
        var id = BitConverter.ToInt64(SHA256.HashData(Encoding.UTF8.GetBytes(key)), 0);
        try
        {
            await using var command = new NpgsqlCommand("SELECT pg_advisory_lock(@id)", connection);
            command.Parameters.AddWithValue("id", id);
            await command.ExecuteNonQueryAsync();
            return new Lease(async () =>
            {
                try
                {
                    await using var release = new NpgsqlCommand("SELECT pg_advisory_unlock(@id)", connection);
                    release.Parameters.AddWithValue("id", id);
                    await release.ExecuteNonQueryAsync();
                }
                finally { await connection.DisposeAsync(); }
            });
        }
        catch { await connection.DisposeAsync(); throw; }
    }
    private sealed class Lease(Func<ValueTask> release) : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => release();
    }
}
