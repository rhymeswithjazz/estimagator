using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using Testcontainers.PostgreSql;
using Xunit;

namespace PokerPoints.Integration.Tests;

public class RoundStateTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").Build();

    public Task InitializeAsync() => database.StartAsync();
    public Task DisposeAsync() => database.DisposeAsync().AsTask();

    [Fact]
    public async Task RevealedRound_SurvivesReconnectRoleChangeAndHostTransfer_AndCanBeReset()
    {
        await using var app = new App(database.GetConnectionString());
        using var http = app.CreateClient();
        var created = await CreateSession(http);
        await using var host = await Connect(app);
        var hostIdentity = await Join(host, created, "Host", creator: true);
        await using var voter = await Connect(app);
        var voterIdentity = await Join(voter, created, "Voter");
        var originalStory = (await State(host)).CurrentStory!;
        await host.InvokeAsync("CastVote", "5");
        await voter.InvokeAsync("CastVote", "8");
        await host.InvokeAsync("RevealVotes");
        AssertRevealed(await State(host), originalStory.Id, 6.5m, false, 2);

        // HTTP and a fresh SignalR connection reconstruct the same persisted current round.
        var httpState = await http.GetFromJsonAsync<GameStateResponse>($"/api/sessions/{created.AccessCode}/state");
        AssertRevealed(httpState!, originalStory.Id, 6.5m, false, 2);
        var info = await http.GetFromJsonAsync<SessionInfoResponse>($"/api/sessions/{created.AccessCode}");
        Assert.Equal(originalStory.Id, info!.CurrentStory!.Id);
        await using var reconnected = await Connect(app);
        await reconnected.InvokeAsync<JoinSessionResponse>("JoinSession", created.AccessCode,
            "Host", false, hostIdentity.Participant.Id, null, hostIdentity.ReconnectToken);
        AssertRevealed(await State(reconnected), originalStory.Id, 6.5m, false, 2);
        await using var lateJoiner = await Connect(app);
        await Join(lateJoiner, created, "Late observer", observer: true);
        AssertRevealed(await State(lateJoiner), originalStory.Id, 6.5m, false, 2);

        // A displayed result is not an open voting round, and a role change retains history.
        await reconnected.InvokeAsync("CastVote", "13");
        await reconnected.InvokeAsync("StartTimer");
        Assert.Null((await State(reconnected)).ActiveTimer);
        await reconnected.InvokeAsync<ParticipantDto>("SwitchRole", true);
        AssertRevealed(await State(reconnected), originalStory.Id, 6.5m, false, 2);
        await reconnected.InvokeAsync<ParticipantDto>("TransferHost", voterIdentity.Participant.Id);
        AssertRevealed(await State(voter), originalStory.Id, 6.5m, false, 2);

        // Reset after reveal reopens the same story and clears votes and results.
        await voter.InvokeAsync("ResetVotes");
        var reset = await State(voter);
        Assert.Equal(originalStory.Id, reset.CurrentStory!.Id);
        Assert.Equal("active", reset.CurrentStory.Status);
        Assert.Null(reset.CurrentStory.FinalScore);
        Assert.Null(reset.RevealedVotes);
        Assert.Null(reset.VotingResults);
        Assert.All(reset.VoteStatuses, s => Assert.False(s.HasVoted));
        await voter.InvokeAsync("CastVote", "3");
        await voter.InvokeAsync("RevealVotes");
        AssertRevealed(await State(voter), originalStory.Id, 3m, true, 1);

        // Next uses queue order, and starting a selected story updates the durable pointer.
        var queued = await voter.InvokeAsync<List<StoryDto>>("AddStories",
            new List<CreateStoryRequest> { new("Queued first"), new("Queued second") });
        await voter.InvokeAsync("NextStory", (string?)null);
        Assert.Equal(queued[0].Id, (await State(voter)).CurrentStory!.Id);
        await voter.InvokeAsync("StartStory", queued[1].Id);
        Assert.Equal(queued[1].Id, (await State(voter)).CurrentStory!.Id);
        // Even empty revealed rounds must stay revealed after refresh.
        await voter.InvokeAsync("RevealVotes");
        AssertRevealed(await State(voter), queued[1].Id, null, false, 0);

        // Revisiting an older story must not select the newest historical story on reconnect.
        await voter.InvokeAsync("RestartStory", originalStory.Id);
        await voter.InvokeAsync("CastVote", "?");
        await voter.InvokeAsync("RevealVotes");
        AssertRevealed(await State(voter), originalStory.Id, null, false, 1);
        await using var restoredVoter = await Connect(app);
        await restoredVoter.InvokeAsync<JoinSessionResponse>("JoinSession", created.AccessCode,
            "Voter", false, voterIdentity.Participant.Id, null, voterIdentity.ReconnectToken);
        AssertRevealed(await State(restoredVoter), originalStory.Id, null, false, 1);

        await restoredVoter.InvokeAsync("DeleteStory", originalStory.Id);
        var deleted = await State(restoredVoter);
        Assert.Null(deleted.CurrentStory);
        Assert.Null(deleted.RevealedVotes);
        await restoredVoter.InvokeAsync("NextStory", "Fresh round");
        var fresh = await State(restoredVoter);
        Assert.Equal("Fresh round", fresh.CurrentStory!.Title);
        Assert.Equal("active", fresh.CurrentStory.Status);
        Assert.Null(fresh.VotingResults);
        // Removing the whole session must still cascade with the new story reference.
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
        db.Sessions.Remove(await db.Sessions.SingleAsync());
        await db.SaveChangesAsync();
        Assert.Empty(await db.Stories.ToListAsync());
    }

    [Fact]
    public async Task TimerReveal_PreservesCurrentRoundAndResults()
    {
        await using var app = new App(database.GetConnectionString());
        using var http = app.CreateClient();
        var created = await CreateSession(http);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
            (await db.Sessions.SingleAsync()).TimerDurationSeconds = 1;
            await db.SaveChangesAsync();
        }
        await using var host = await Connect(app);
        await Join(host, created, "Host", creator: true);
        var storyId = (await State(host)).CurrentStory!.Id;
        await host.InvokeAsync("CastVote", "5");
        var revealed = new TaskCompletionSource<VotesRevealedEvent>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var subscription = host.On<VotesRevealedEvent>("VotesRevealed", value => revealed.TrySetResult(value));
        await host.InvokeAsync("StartTimer");
        var result = await revealed.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(5m, result.Average);
        AssertRevealed(await State(host), storyId, 5m, true, 1);
        await host.InvokeAsync("ResetVotes");
        Assert.Equal(storyId, (await State(host)).CurrentStory!.Id);
    }

    [Fact]
    public async Task Migration_BackfillsCurrentStoryWithoutChangingVotesOrPendingStories()
    {
        var options = new DbContextOptionsBuilder<PokerPointsDbContext>().UseNpgsql(database.GetConnectionString()).Options;
        await using var db = new PokerPointsDbContext(options);
        var previous = db.Database.GetMigrations().TakeWhile(m => !m.EndsWith("AddCurrentStory")).Last();
        await db.GetService<IMigrator>().MigrateAsync(previous);
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO "Sessions" ("Id", "AccessCode") VALUES
                ('00000000-0000-0000-0000-000000000001', 'ACTIVE'),
                ('00000000-0000-0000-0000-000000000002', 'RESULT'),
                ('00000000-0000-0000-0000-000000000003', 'QUEUED');
            INSERT INTO "Stories" ("Id", "SessionId", "Title", "Status", "CreatedAt", "SortOrder", "EstimateRevision") VALUES
                ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Active', 'active', '2026-01-01', 0, 0),
                ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'Newer completed', 'completed', '2026-02-01', 1, 0),
                ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000002', 'Old result', 'completed', '2026-01-01', 0, 0),
                ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000002', 'Latest result', 'completed', '2026-02-01', 1, 0),
                ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000003', 'Pending', 'pending', '2026-01-01', 0, 0);
            INSERT INTO "Participants" ("Id", "SessionId", "DisplayName") VALUES
                ('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000002', 'Voter');
            INSERT INTO "Votes" ("StoryId", "ParticipantId", "CardValue") VALUES
                ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000041', '8');
            """);
        await db.Database.MigrateAsync();
        var sessions = await db.Sessions.ToDictionaryAsync(s => s.AccessCode);
        Assert.Equal(Guid.Parse("00000000-0000-0000-0000-000000000011"), sessions["ACTIVE"].CurrentStoryId);
        Assert.Equal(Guid.Parse("00000000-0000-0000-0000-000000000022"), sessions["RESULT"].CurrentStoryId);
        Assert.Null(sessions["QUEUED"].CurrentStoryId);
        Assert.Equal(5, await db.Stories.CountAsync());
        Assert.Equal("8", (await db.Votes.SingleAsync()).CardValue);
        Assert.Equal(1, await db.Stories.CountAsync(s => s.Status == "active"));
        Assert.Equal(1, await db.Stories.CountAsync(s => s.Status == "pending"));
    }

    private static void AssertRevealed(GameStateResponse state, Guid storyId, decimal? average, bool consensus, int votes)
    {
        Assert.Equal(storyId, state.CurrentStory!.Id);
        Assert.Equal(storyId, state.Session.CurrentStory!.Id);
        Assert.Equal("completed", state.CurrentStory.Status);
        Assert.Equal(average, state.CurrentStory.FinalScore);
        Assert.NotNull(state.RevealedVotes);
        Assert.Equal(votes, state.RevealedVotes.Count);
        Assert.Equal(new VotingResultsDto(average, consensus), state.VotingResults);
    }

    private static async Task<CreateSessionResponse> CreateSession(HttpClient http) =>
        (await (await http.PostAsJsonAsync("/api/sessions", new CreateSessionRequest()))
            .Content.ReadFromJsonAsync<CreateSessionResponse>())!;

    private static Task<GameStateResponse> State(HubConnection connection) =>
        connection.InvokeAsync<GameStateResponse>("GetSessionState");

    private static Task<JoinSessionResponse> Join(HubConnection connection, CreateSessionResponse session,
        string name, bool creator = false, bool observer = false) =>
        connection.InvokeAsync<JoinSessionResponse>("JoinSession", session.AccessCode, name, observer,
            null, creator ? session.GuestHostToken : null, null);

    private static async Task<HubConnection> Connect(App app)
    {
        var connection = new HubConnectionBuilder().WithUrl("http://localhost/hubs/poker", options =>
        {
            options.Transports = HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
        }).Build();
        await connection.StartAsync();
        return connection;
    }

    private sealed class App(string connection) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("ConnectionStrings:DefaultConnection", connection);
            builder.UseSetting("Authentication:Jwt:Secret", "round-state-integration-test-only-signing-secret-at-least-sixty-four-characters");
            builder.UseSetting("Jira:Enabled", "false");
            builder.UseSetting("ADMIN_EMAIL", "");
            builder.UseSetting("ADMIN_PASSWORD", "");
        }
    }
}
