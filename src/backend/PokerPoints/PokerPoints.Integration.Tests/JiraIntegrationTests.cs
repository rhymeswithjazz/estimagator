using Microsoft.EntityFrameworkCore.Infrastructure;

using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Jira;
using PokerPoints.Api.Models;
using PokerPoints.Data;
using PokerPoints.Data.Entities;
using Testcontainers.PostgreSql;
using Xunit;

namespace PokerPoints.Integration.Tests;

public class JiraIntegrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer database = new PostgreSqlBuilder().WithImage("postgres:16-alpine").Build();
    private readonly string keys = Path.Combine(Path.GetTempPath(), "estimagator-jira-tests-" + Guid.NewGuid());
    public Task InitializeAsync() => database.StartAsync();
    public async Task DisposeAsync() { await database.DisposeAsync(); if (Directory.Exists(keys)) Directory.Delete(keys, true); }

    [Fact]
    public async Task OAuthImportEstimateConflictPublishAndHistory_WorkThroughAuthenticatedEndpoints()
    {
        var fake = new FakeJira();
        await using var app = new App(database.GetConnectionString(), keys, fake);
        using var http = app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var user = new User { Id = Guid.NewGuid(), Email = "host@example.test", EmailVerified = true };
        var session = new Session { Id = Guid.NewGuid(), AccessCode = "JIRA01", OrganizerId = user.Id };
        session.Participants.Add(new() { Id = Guid.NewGuid(), UserId = user.Id, IsOrganizer = true });
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
            db.Users.Add(user); db.Sessions.Add(session); await db.SaveChangesAsync();
            http.DefaultRequestHeaders.Authorization = new("Bearer", scope.ServiceProvider.GetRequiredService<IJwtTokenService>().GenerateAccessToken(user));
        }
        var start = await http.PostAsJsonAsync("/api/integrations/jira/authorize", new { returnPath = "/session/JIRA01/history" });
        start.EnsureSuccessStatusCode();
        var authorization = await start.Content.ReadFromJsonAsync<JsonElement>();
        var state = QueryHelpers.ParseQuery(new Uri(authorization.GetProperty("url").GetString()!).Query)["state"].ToString();
        var callback = await http.GetAsync($"/api/integrations/jira/callback?state={state}&code=fake-code");
        Assert.Equal(HttpStatusCode.Redirect, callback.StatusCode);
        Assert.Contains("/session/JIRA01/history?jira=connected", callback.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await http.GetAsync($"/api/integrations/jira/callback?state={state}&code=fake-code")).StatusCode);
        var search = await http.PostAsJsonAsync("/api/integrations/jira/search", new JiraSearchRequest("site", "10", null, null));
        search.EnsureSuccessStatusCode();
        var issue = Assert.Single((await search.Content.ReadFromJsonAsync<JiraSearchResult>())!.Issues);
        Assert.Equal("customfield_42", issue.FieldId);
        var selection = new JiraImportRequest("site", [new(issue.Id, issue.FieldId)]);
        // The database lock and unique constraint must survive requests in separate DI scopes.
        var imports = await Task.WhenAll(http.PostAsJsonAsync("/api/sessions/JIRA01/jira/import", selection), http.PostAsJsonAsync("/api/sessions/JIRA01/jira/import", selection));
        foreach (var response in imports) response.EnsureSuccessStatusCode();
        Guid storyId;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
            var story = Assert.Single(await db.Stories.ToListAsync()); storyId = story.Id;
            Assert.Null(story.AgreedEstimate);
            story.Status = "completed"; story.FinalScore = 5.5m; await db.SaveChangesAsync();
        }
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PokerPointsDbContext>();
            (await db.JiraAuthorizations.SingleAsync()).ExpiresAt = DateTime.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }
        var searches = await Task.WhenAll(
            http.PostAsJsonAsync("/api/integrations/jira/search", new JiraSearchRequest("site", "10", null, null)),
            http.PostAsJsonAsync("/api/integrations/jira/search", new JiraSearchRequest("site", "10", null, null)));
        foreach (var response in searches) response.EnsureSuccessStatusCode();
        Assert.Equal(2, fake.TokenExchanges); // Initial code exchange plus exactly one serialized refresh.
        var storyPath = $"/api/sessions/JIRA01/stories/{storyId}";
        (await http.PutAsJsonAsync(storyPath + "/estimate", new EstimateRequest(5, 0))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await http.PutAsJsonAsync(storyPath + "/estimate", new EstimateRequest(8, 0))).StatusCode);
        fake.Value = 8;
        var conflict = await http.PostAsJsonAsync(storyPath + "/jira/publish", new PublishRequest(1));
        Assert.Equal("conflict", (await conflict.Content.ReadFromJsonAsync<StoryDto>())!.Jira!.PublishStatus);
        var writes = await Task.WhenAll(http.PostAsJsonAsync(storyPath + "/jira/publish", new PublishRequest(1, true, 8)), http.PostAsJsonAsync(storyPath + "/jira/publish", new PublishRequest(1, true, 8)));
        foreach (var result in writes) Assert.Equal("published", (await result.Content.ReadFromJsonAsync<StoryDto>())!.Jira!.PublishStatus);
        Assert.Equal(1, fake.WriteCount);
        (await http.PostAsync("/api/sessions/JIRA01/deactivate", null)).EnsureSuccessStatusCode();
        var history = await http.GetFromJsonAsync<SessionHistoryResponse>("/api/sessions/JIRA01/history");
        Assert.True(history!.CanManageEstimates);
        Assert.Equal(5, Assert.Single(history.Stories).AgreedEstimate);
        (await http.PutAsJsonAsync(storyPath + "/estimate", new EstimateRequest(8, 1))).EnsureSuccessStatusCode();
        var published = await http.PostAsJsonAsync(storyPath + "/jira/publish", new PublishRequest(2));
        Assert.Equal("published", (await published.Content.ReadFromJsonAsync<StoryDto>())!.Jira!.PublishStatus);
        // A separate app instance decrypts tokens using the same persisted keys.
        await using var restarted = new App(database.GetConnectionString(), keys, fake);
        using var second = restarted.CreateClient();
        second.DefaultRequestHeaders.Authorization = http.DefaultRequestHeaders.Authorization;
        (await second.PostAsJsonAsync("/api/integrations/jira/search", new JiraSearchRequest("site", "10", null, null))).EnsureSuccessStatusCode();
        using var anonymous = restarted.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync(storyPath + "/jira/publish", new PublishRequest(2))).StatusCode);
    }

    [Fact]
    public async Task MigrationPreservesOldScores_AndIssueUniquenessIsPerSession()
    {
        var options = new DbContextOptionsBuilder<PokerPointsDbContext>().UseNpgsql(database.GetConnectionString()).Options;
        await using var db = new PokerPointsDbContext(options);
        var migrations = db.Database.GetMigrations().ToList();
        var migrator = db.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
        await migrator.MigrateAsync(migrations[^2]);
        await db.Database.ExecuteSqlRawAsync("INSERT INTO \"Sessions\" (\"Id\", \"AccessCode\", \"DeckType\", \"IsActive\", \"CreatedAt\", \"TimerDurationSeconds\") VALUES ('11111111-1111-1111-1111-111111111111', 'OLD001', 'fibonacci', false, NOW(), 120)");
        await db.Database.ExecuteSqlRawAsync("INSERT INTO \"Stories\" (\"Id\", \"SessionId\", \"Title\", \"SortOrder\", \"Status\", \"FinalScore\", \"CreatedAt\") VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Old story', 0, 'completed', 5.5, NOW())");
        await db.Database.MigrateAsync();
        var old = await db.Stories.SingleAsync();
        Assert.Equal(5.5m, old.FinalScore); Assert.Null(old.AgreedEstimate);
        old.JiraLink = new() { StoryId = old.Id, SessionId = old.SessionId, SiteId = "site", IssueId = "100" };
        await db.SaveChangesAsync();
        var duplicate = new Story { Id = Guid.NewGuid(), SessionId = old.SessionId, Title = "Duplicate" };
        duplicate.JiraLink = new() { StoryId = duplicate.Id, SessionId = old.SessionId, SiteId = "site", IssueId = "100" };
        db.Stories.Add(duplicate);
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        var later = new Session { Id = Guid.NewGuid(), AccessCode = "NEW001" };
        var laterStory = new Story { Id = Guid.NewGuid(), SessionId = later.Id, Title = "Later" };
        laterStory.JiraLink = new() { StoryId = laterStory.Id, SessionId = later.Id, SiteId = "site", IssueId = "100" };
        db.Sessions.Add(later); db.Stories.Add(laterStory);
        await db.SaveChangesAsync();
        Assert.Equal(2, await db.JiraStoryLinks.CountAsync());
    }

    private sealed class App(string connection, string keys, FakeJira fake) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("ConnectionStrings:DefaultConnection", connection);
            builder.UseSetting("Authentication:Jwt:Secret", "integration-test-secret-that-is-at-least-sixty-four-characters-long-only-for-tests");
            builder.UseSetting("Jira:Enabled", "false");
            builder.ConfigureServices(services =>
            {
                services.Configure<JiraOptions>(o =>
                {
                    o.Enabled = true; o.ClientId = "test"; o.ClientSecret = "test";
                    o.CallbackUrl = "http://localhost/api/integrations/jira/callback"; o.FrontendUrl = "http://localhost";
                });
                services.AddDataProtection().SetApplicationName("Estimagator").PersistKeysToFileSystem(new DirectoryInfo(keys));
                services.AddHttpClient<JiraClient>().ConfigurePrimaryHttpMessageHandler(() => fake);
            });
        }
    }

    private sealed class FakeJira : HttpMessageHandler
    {
        public decimal Value = 3;
        public int WriteCount;
        public int TokenExchanges;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path.EndsWith("/oauth/token")) { Interlocked.Increment(ref TokenExchanges); return Json(new { access_token = "access", refresh_token = "refresh", expires_in = 3600 }); }
            if (path.EndsWith("accessible-resources")) return Json(new[] { new { id = "site", name = "Test", url = "https://example.atlassian.net", scopes = new[] { "read:jira-work", "write:jira-work" } } });
            if (path.EndsWith("/field")) return Json(new[] { new { id = "customfield_42", name = "Story Points", schema = new { type = "number" } } });
            if (path.EndsWith("/editmeta")) return Json(new { fields = new { customfield_42 = new { name = "Story Points", schema = new { type = "number" }, operations = new[] { "set" } } } });
            if (path.EndsWith("/search/jql")) return Json(new { issues = new[] { Issue() } });
            if (request.Method == HttpMethod.Put)
            {
                var body = await request.Content!.ReadFromJsonAsync<JsonElement>(ct);
                Value = body.GetProperty("fields").GetProperty("customfield_42").GetDecimal(); Interlocked.Increment(ref WriteCount);
                return new(HttpStatusCode.NoContent);
            }
            if (path.Contains("/issue/")) return Json(Issue());
            throw new InvalidOperationException("Unexpected Jira request " + path);
        }
        private object Issue() => new { id = "100", key = "TEAM-1", fields = new { summary = "Test story", status = new { name = "To Do" }, project = new { id = "10" }, issuetype = new { id = "20" }, customfield_42 = Value } };
        private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK) { Content = JsonContent.Create(body) };
        protected override void Dispose(bool disposing) { /* shared across simulated app restarts */ }
    }
}
