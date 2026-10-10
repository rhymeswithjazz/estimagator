using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data;
using PokerPoints.Data.Entities;
using Testcontainers.PostgreSql;
using Xunit;

namespace PokerPoints.Integration.Tests;

public class ParticipantReconnectTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").Build();

    public Task InitializeAsync() => database.StartAsync();
    public Task DisposeAsync() => database.DisposeAsync().AsTask();

    [Fact]
    public async Task GuestHost_RequiresPrivateProof_AndTransferSurvivesReconnect()
    {
        await using var app = new App(database.GetConnectionString());
        using var http = app.CreateClient();
        var created = await (await http.PostAsJsonAsync("/api/sessions", new CreateSessionRequest()))
            .Content.ReadFromJsonAsync<CreateSessionResponse>();
        Assert.NotNull(created);
        await using var host = await Connect(app);
        var joined = await Join(host, created.AccessCode, guestHostToken: created.GuestHostToken);
        Assert.True(joined.Participant.IsOrganizer);
        Assert.NotNull(joined.ReconnectToken);
        Assert.NotEqual(created.GuestHostToken, joined.ReconnectToken);
        using (var scope = app.Services.CreateScope())
        {
            var participant = await scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>()
                .Participants.SingleAsync(p => p.Id == joined.Participant.Id);
            Assert.NotEqual(joined.ReconnectToken, participant.ReconnectTokenHash);
            Assert.True(GuestHostToken.Verify(joined.ReconnectToken, participant.ReconnectTokenHash!));
        }

        // IDs remain public, but neither they nor the one-time host reservation prove a reconnect.
        foreach (var path in new[] { $"/api/sessions/{created.AccessCode}", $"/api/sessions/{created.AccessCode}/state" })
        {
            var json = await http.GetStringAsync(path);
            Assert.Contains(joined.Participant.Id.ToString(), json);
            Assert.DoesNotContain(joined.ReconnectToken, json);
            Assert.DoesNotContain("reconnectToken", json, StringComparison.OrdinalIgnoreCase);
        }
        await using var attacker = await Connect(app);
        await Assert.ThrowsAsync<HubException>(() => Join(attacker, created.AccessCode, joined.Participant.Id));
        await Assert.ThrowsAsync<HubException>(() => Join(attacker, created.AccessCode, joined.Participant.Id,
            created.GuestHostToken, "incorrect"));
        Assert.Null(await attacker.InvokeAsync<GameStateResponse?>("GetSessionState"));

        var broadcast = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var subscription = host.On<JsonElement>("UserJoined", value => broadcast.TrySetResult(value));
        var target = await Join(attacker, created.AccessCode);
        var publicEvent = (await broadcast.Task.WaitAsync(TimeSpan.FromSeconds(10))).GetRawText();
        Assert.DoesNotContain(target.ReconnectToken!, publicEvent);
        Assert.DoesNotContain("reconnectToken", publicEvent, StringComparison.OrdinalIgnoreCase);
        await host.InvokeAsync<ParticipantDto?>("TransferHost", target.Participant.Id);

        await using var targetReconnected = await Connect(app);
        var restored = await Join(targetReconnected, created.AccessCode, target.Participant.Id,
            reconnectToken: target.ReconnectToken);
        Assert.True(restored.Participant.IsOrganizer);
        Assert.Equal(target.Participant.Id, restored.Participant.Id);
        // The replaced socket no longer controls this participant.
        Assert.Null(await attacker.InvokeAsync<ParticipantDto?>("SwitchRole", true));
        await attacker.StopAsync();
        Assert.NotNull(await targetReconnected.InvokeAsync<GameStateResponse?>("GetSessionState"));

        await using var oldHostReconnected = await Connect(app);
        var formerHost = await Join(oldHostReconnected, created.AccessCode, joined.Participant.Id,
            created.GuestHostToken, joined.ReconnectToken);
        Assert.False(formerHost.Participant.IsOrganizer);
        Assert.Equal(joined.Participant.Id, formerHost.Participant.Id);
    }

    [Fact]
    public async Task RegisteredHost_RequiresMatchingVerifiedAccount()
    {
        await using var app = new App(database.GetConnectionString());
        using var http = app.CreateClient();
        var owner = new User { Email = "owner@example.test", EmailVerified = true };
        var other = new User { Email = "other@example.test", EmailVerified = true };
        string ownerToken;
        string otherToken;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
            db.Users.AddRange(owner, other);
            await db.SaveChangesAsync();
            var tokens = scope.ServiceProvider.GetRequiredService<IJwtTokenService>();
            ownerToken = tokens.GenerateAccessToken(owner);
            otherToken = tokens.GenerateAccessToken(other);
        }
        http.DefaultRequestHeaders.Authorization = new("Bearer", ownerToken);
        var created = await (await http.PostAsJsonAsync("/api/sessions", new CreateSessionRequest()))
            .Content.ReadFromJsonAsync<CreateSessionResponse>();
        await using var host = await Connect(app, ownerToken);
        var joined = await Join(host, created!.AccessCode);
        Assert.True(joined.Participant.IsOrganizer);
        Assert.Null(joined.ReconnectToken);

        await using var anonymous = await Connect(app);
        await using var wrongAccount = await Connect(app, otherToken);
        await Assert.ThrowsAsync<HubException>(() => Join(anonymous, created.AccessCode, joined.Participant.Id));
        await Assert.ThrowsAsync<HubException>(() => Join(wrongAccount, created.AccessCode, joined.Participant.Id));
        await using var ownerReconnected = await Connect(app, ownerToken);
        var restored = await Join(ownerReconnected, created.AccessCode, joined.Participant.Id);
        Assert.Equal(joined.Participant, restored.Participant);
        Assert.Null(await host.InvokeAsync<ParticipantDto?>("SwitchRole", true));
    }

    [Fact]
    public async Task MigrationPreservesLegacyParticipantsAndVotes_ButDoesNotInventGuestProof()
    {
        var options = new DbContextOptionsBuilder<PokerPointsDbContext>().UseNpgsql(database.GetConnectionString()).Options;
        await using var db = new PokerPointsDbContext(options);
        var previous = db.Database.GetMigrations().TakeWhile(m => !m.EndsWith("AddParticipantReconnectToken")).Last();
        await db.GetService<IMigrator>().MigrateAsync(previous);
        await db.Database.ExecuteSqlRawAsync("""
            INSERT INTO "Sessions" ("Id", "AccessCode") VALUES ('11111111-1111-1111-1111-111111111111', 'LEGACY');
            INSERT INTO "Participants" ("Id", "SessionId", "DisplayName", "IsOrganizer", "ConnectionId")
            VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Legacy host', true, 'legacy-connection');
            INSERT INTO "Stories" ("Id", "SessionId", "Title", "SortOrder", "EstimateRevision")
            VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Story', 0, 0);
            INSERT INTO "Votes" ("StoryId", "ParticipantId", "CardValue")
            VALUES ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '5');
            """);
        await db.Database.MigrateAsync();
        var participant = await db.Participants.SingleAsync();
        Assert.Null(participant.ReconnectTokenHash);
        Assert.True(participant.IsOrganizer);
        Assert.Equal("5", (await db.Votes.SingleAsync()).CardValue);
        Assert.Null(await new ParticipantService(db).ReconnectAsync(participant.SessionId, participant.Id, "attacker"));
        Assert.Equal("legacy-connection", participant.ConnectionId);
    }

    private static async Task<JoinSessionResponse> Join(HubConnection connection, string code,
        Guid? participantId = null, string? guestHostToken = null, string? reconnectToken = null)
        => (await connection.InvokeAsync<JoinSessionResponse?>("JoinSession", code, "Player", false,
            participantId, guestHostToken, reconnectToken))!;

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
            builder.UseSetting("Authentication:Jwt:Secret", "reconnect-integration-test-only-signing-secret-at-least-sixty-four-characters");
            builder.UseSetting("Jira:Enabled", "false");
            builder.UseSetting("ADMIN_EMAIL", "");
            builder.UseSetting("ADMIN_PASSWORD", "");
        }
    }
}
