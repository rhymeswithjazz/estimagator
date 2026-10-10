using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;
using Testcontainers.PostgreSql;
using Xunit;

namespace PokerPoints.Integration.Tests;

public class SessionHistoryTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").Build();

    public Task InitializeAsync() => database.StartAsync();
    public Task DisposeAsync() => database.DisposeAsync().AsTask();

    [Fact]
    public async Task History_KeepsVotesPrivateAcrossReconnectAndReset_AndPreservesCompletedResults()
    {
        await using var app = new App(database.GetConnectionString());
        using var anonymous = app.CreateClient();
        var created = await (await anonymous.PostAsJsonAsync("/api/sessions", new CreateSessionRequest()))
            .Content.ReadFromJsonAsync<CreateSessionResponse>();
        Assert.NotNull(created);
        var historyPath = $"/api/sessions/{created.AccessCode}/history";

        string memberToken;
        string outsiderToken;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
            var member = new User { Email = "member@example.test", EmailVerified = true };
            var outsider = new User { Email = "outsider@example.test", EmailVerified = true };
            db.Users.AddRange(member, outsider);
            await db.SaveChangesAsync();
            var tokens = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
            memberToken = tokens.GenerateAccessToken(member);
            outsiderToken = tokens.GenerateAccessToken(outsider);
        }

        // Guest hosting and voting remain available without an account.
        await using var host = await Connect(app);
        var hostIdentity = await host.InvokeAsync<JoinSessionResponse>("JoinSession",
            created.AccessCode, "Guest host", false, null, created.GuestHostToken, null);
        await using var voter = await Connect(app, memberToken);
        var voterIdentity = await voter.InvokeAsync<JoinSessionResponse>("JoinSession",
            created.AccessCode, "Member", false, null, null, null);
        using var memberHttp = app.CreateClient();
        memberHttp.DefaultRequestHeaders.Authorization = new("Bearer", memberToken);
        using var outsiderHttp = app.CreateClient();
        outsiderHttp.DefaultRequestHeaders.Authorization = new("Bearer", outsiderToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(historyPath)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsiderHttp.GetAsync(historyPath)).StatusCode);

        await host.InvokeAsync("CastVote", "8");
        await voter.InvokeAsync("CastVote", "5");
        var hidden = Assert.Single((await ReadHistory()).Stories);
        Assert.Equal("active", hidden.Status);
        Assert.Empty(hidden.Votes);

        await using var restoredHost = await Connect(app);
        await restoredHost.InvokeAsync<JoinSessionResponse>("JoinSession", created.AccessCode,
            "Guest host", false, hostIdentity.Participant.Id, null, hostIdentity.ReconnectToken);
        var state = await restoredHost.InvokeAsync<GameStateResponse>("GetSessionState");
        Assert.Null(state.RevealedVotes);
        Assert.All(state.VoteStatuses, status => Assert.True(status.HasVoted));
        Assert.Empty(Assert.Single((await ReadHistory()).Stories).Votes);

        await restoredHost.InvokeAsync("RevealVotes");
        var revealed = Assert.Single((await ReadHistory()).Stories);
        Assert.Equal("completed", revealed.Status);
        Assert.Equal(6.5m, revealed.FinalScore);
        Assert.Equal(2, revealed.Votes.Count);
        Assert.Contains(new VoteDto(hostIdentity.Participant.Id, "Guest host", "8"), revealed.Votes);
        Assert.Contains(new VoteDto(voterIdentity.Participant.Id, "Member", "5"), revealed.Votes);

        // Preserve earlier results even while another story has secret votes.
        await restoredHost.InvokeAsync("NextStory", "Second story");
        await restoredHost.InvokeAsync("CastVote", "13");
        var mixed = await ReadHistory();
        Assert.Equal(revealed.Votes.OrderBy(v => v.ParticipantId),
            mixed.Stories.Single(s => s.Id == revealed.Id).Votes.OrderBy(v => v.ParticipantId));
        var nextStory = Assert.Single(mixed.Stories, s => s.Status == "active");
        Assert.Empty(nextStory.Votes);

        await restoredHost.InvokeAsync("ResetVotes");
        await voter.InvokeAsync("CastVote", "3");
        Assert.Empty((await ReadHistory()).Stories.Single(s => s.Id == nextStory.Id).Votes);
        await restoredHost.InvokeAsync("RevealVotes");
        Assert.Equal("3", Assert.Single((await ReadHistory()).Stories.Single(s => s.Id == nextStory.Id).Votes).CardValue);

        // Restarting a completed story must hide its new round until the next reveal.
        await restoredHost.InvokeAsync("RestartStory", nextStory.Id);
        var restarted = (await ReadHistory()).Stories.Single(s => s.Id == nextStory.Id);
        Assert.Equal("active", restarted.Status);
        Assert.Null(restarted.FinalScore);
        Assert.Empty(restarted.Votes);
        await voter.InvokeAsync("CastVote", "2");
        Assert.Empty((await ReadHistory()).Stories.Single(s => s.Id == nextStory.Id).Votes);

        // Ending a session already completes its active story; retain that history behavior.
        await restoredHost.InvokeAsync("EndSession");
        var ended = await ReadHistory();
        Assert.False(ended.IsActive);
        var finalStory = ended.Stories.Single(s => s.Id == nextStory.Id);
        Assert.Equal("completed", finalStory.Status);
        Assert.Equal(2m, finalStory.FinalScore);
        Assert.Equal("2", Assert.Single(finalStory.Votes).CardValue);

        async Task<SessionHistoryResponse> ReadHistory() =>
            (await memberHttp.GetFromJsonAsync<SessionHistoryResponse>(historyPath))!;
    }

    private static async Task<HubConnection> Connect(App app, string? token = null)
    {
        var connection = new HubConnectionBuilder().WithUrl("http://localhost/hubs/poker", options =>
        {
            options.Transports = HttpTransportType.LongPolling;
            options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
            options.AccessTokenProvider = () => Task.FromResult(token);
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
            builder.UseSetting("Authentication:Jwt:Secret", "history-integration-test-only-signing-secret-at-least-sixty-four-characters");
            builder.UseSetting("Jira:Enabled", "false");
            builder.UseSetting("ADMIN_EMAIL", "");
            builder.UseSetting("ADMIN_PASSWORD", "");
        }
    }
}
