using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using PokerPoints.Api.Hubs;
using PokerPoints.Api.Jira;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data;
using PokerPoints.Data.Entities;
using Xunit;

namespace PokerPoints.Api.Tests.Jira;

public class JiraWorkflowTests
{
    [Fact]
    public async Task Suggestions_UsePickerWithEncodedQueryAndPlainTitles_WithoutMetadataCalls()
    {
        using var f = new Fixture();
        var result = await f.Issues.SuggestionsAsync(f.User, "site", " TEAM- & login ");
        var issue = Assert.Single(result);
        Assert.Equal("100", issue.Id);
        Assert.Equal("Plain title", issue.Summary);
        Assert.Contains("query=TEAM-%20%26%20login", f.Handler.PickerQuery);
        Assert.Equal(1, f.Handler.Requests);
    }

    [Fact]
    public async Task Suggestions_RejectOversizedQueryBeforeCallingJira()
    {
        using var f = new Fixture();
        await Assert.ThrowsAsync<JiraException>(() => f.Issues.SuggestionsAsync(f.User, "site", new string('a', 101)));
        Assert.Equal(0, f.Handler.Requests);
    }

    [Fact]
    public async Task ConfirmAndPublish_UsesAgreementAndPreservesAverage()
    {
        using var f = new Fixture();
        var result = await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        Assert.Equal(5.5m, result.FinalScore);
        Assert.Equal(5m, result.AgreedEstimate);
        Assert.Empty(f.Handler.Writes);
        result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal("published", result.Jira!.PublishStatus);
        Assert.Equal(5m, Assert.Single(f.Handler.Writes));
        var attempt = Assert.Single(f.Db.JiraPublishAttempts);
        Assert.Equal(f.User, attempt.ActorId);
        Assert.Equal("published", attempt.Status);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(-1.0)]
    [InlineData(1000.0)]
    [InlineData(1.25)]
    public async Task RejectsInvalidEstimates(double? number)
    {
        using var f = new Fixture();
        var error = await Assert.ThrowsAsync<JiraException>(() => f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new((decimal?)number, 0)));
        Assert.Equal("invalid_estimate", error.Code);
    }

    [Fact]
    public async Task ZeroIsAValidConfirmedEstimate()
    {
        using var f = new Fixture();
        var result = await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(0, 0));
        Assert.Equal(0, result.AgreedEstimate);
    }

    [Fact]
    public async Task PublishingRequiresConfirmationAndCurrentRevision()
    {
        using var f = new Fixture();
        Assert.Equal("estimate_required", (await Assert.ThrowsAsync<JiraException>(() => f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(0)))).Code);
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        Assert.Equal("stale_estimate", (await Assert.ThrowsAsync<JiraException>(() => f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(0)))).Code);
        Assert.Empty(f.Handler.Writes);
    }

    [Fact]
    public async Task JiraChangeRequiresExplicitReplacement_AndChecksObservedValueAgain()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        f.Handler.Value = 8;
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal("conflict", result.Jira!.PublishStatus);
        Assert.Equal(8, result.Jira.ConflictValue);
        Assert.Empty(f.Handler.Writes);
        f.Handler.Value = 13;
        result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1, true, 8));
        Assert.Equal("conflict", result.Jira!.PublishStatus);
        result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1, true, 13));
        Assert.Equal("published", result.Jira!.PublishStatus);
        Assert.Single(f.Handler.Writes);
    }

    [Fact]
    public async Task SuccessfulWriteWithLostResponse_IsReconciledWithoutDuplicateWrite()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        f.Handler.LoseResponse = true;
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal("failed", result.Jira!.PublishStatus);
        Assert.Equal("uncertain", Assert.Single(f.Db.JiraPublishAttempts).Status);
        f.Handler.LoseResponse = false;
        result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal("published", result.Jira!.PublishStatus);
        Assert.Single(f.Handler.Writes);
    }

    [Fact]
    public async Task ChangedAgreementDuringWrite_IsNotMarkedPublished()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        f.Handler.OnWrite = async () =>
        {
            await using var other = new PokerPointsDbContext(f.Options);
            var story = await other.Stories.SingleAsync();
            story.AgreedEstimate = 8; story.EstimateRevision++;
            await other.SaveChangesAsync();
        };
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal(8, result.AgreedEstimate);
        Assert.Equal(5, result.Jira!.PublishedValue);
        Assert.Equal("changes_pending", result.Jira.PublishStatus);
    }

    [Fact]
    public async Task RateLimitPersistsRetryTimeAndPreventsImmediateRequest()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        f.Handler.Status = HttpStatusCode.TooManyRequests;
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.NotNull(result.Jira!.RetryAfter);
        var requests = f.Handler.Requests;
        Assert.Equal(429, (await Assert.ThrowsAsync<JiraException>(() => f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1)))).Status);
        Assert.Equal(requests, f.Handler.Requests);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "reconnect_required")]
    [InlineData(HttpStatusCode.Forbidden, "failed")]
    public async Task ExternalErrorsKeepTheAgreement(HttpStatusCode status, string expected)
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        f.Handler.Status = status;
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal(5, result.AgreedEstimate);
        Assert.Equal(expected, result.Jira!.PublishStatus);
    }

    [Fact]
    public async Task ParticipantsAndFormerHostsCannotConfirmOrPublish()
    {
        using var f = new Fixture();
        var stranger = Guid.NewGuid();
        Assert.Equal(403, (await Assert.ThrowsAsync<JiraException>(() => f.Service.EstimateAsync("ABC123", f.Story.Id, stranger, new(5, 0)))).Status);
        f.Session.OrganizerId = stranger;
        f.Session.Participants.First().IsOrganizer = false;
        await f.Db.SaveChangesAsync();
        Assert.Equal(403, (await Assert.ThrowsAsync<JiraException>(() => f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(0)))).Status);
        Assert.Empty(f.Handler.Writes);
    }

    [Fact]
    public async Task EndingHostCanPublishAfterClosure_ButGuestCannotGrantAuthority()
    {
        using var f = new Fixture();
        f.Session.IsActive = false; f.Session.EndingHostUserId = f.User;
        await f.Db.SaveChangesAsync();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        Assert.Equal("published", (await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1))).Jira!.PublishStatus);
        f.Session.EndingHostUserId = null;
        await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<JiraException>(() => f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(8, 1)));
    }

    [Fact]
    public async Task ImportRefetchesIssue_Deduplicates_AndDoesNotConfirmExistingEstimate()
    {
        using var f = new Fixture();
        f.Db.Stories.Remove(f.Story); await f.Db.SaveChangesAsync();
        var request = new JiraImportRequest("site", [new("100", null)]);
        await f.Service.ImportAsync("ABC123", f.User, request);
        await f.Service.ImportAsync("ABC123", f.User, request);
        var story = Assert.Single(f.Db.Stories);
        Assert.Equal("Server summary", story.Title);
        Assert.Equal("https://example.atlassian.net/browse/TEAM-1", story.Url);
        Assert.Null(story.AgreedEstimate);
        Assert.Equal(3, story.JiraLink!.Baseline);
        Assert.Empty(f.Handler.Writes);
    }

    [Fact]
    public async Task SearchUsesEnhancedJqlAndCursor()
    {
        using var f = new Fixture();
        var result = await f.Issues.SearchAsync(f.User, new("site", "10", null, "cursor"));
        Assert.Single(result.Issues);
        Assert.Equal("next", result.NextPageToken);
        Assert.Equal("cursor", f.Handler.Search!.Value.GetProperty("nextPageToken").GetString());
        Assert.Contains("project =", f.Handler.Search.Value.GetProperty("jql").GetString());
    }

    [Fact]
    public async Task ReadOnlyIssuesCanBeImported()
    {
        using var f = new Fixture();
        f.Db.Stories.Remove(f.Story); await f.Db.SaveChangesAsync();
        f.Handler.Editable = false;
        await f.Service.ImportAsync("ABC123", f.User, new("site", [new("100", null)]));
        Assert.Contains("not editable", Assert.Single(f.Db.Stories).JiraLink!.Message);
    }

    [Fact]
    public async Task DisconnectRemovesCredentialsButKeepsStoriesAndAudit()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        await f.Client.DisconnectAsync(f.User);
        Assert.Empty(f.Db.JiraAuthorizations);
        Assert.Single(f.Db.Stories);
        Assert.Single(f.Db.JiraPublishAttempts);
    }

    [Fact]
    public async Task ExpiredCredentialsRotateRefreshToken()
    {
        using var f = new Fixture();
        var auth = Assert.Single(f.Db.JiraAuthorizations);
        auth.ExpiresAt = DateTime.UtcNow.AddMinutes(-5); await f.Db.SaveChangesAsync();
        await f.Issues.FieldsAsync(f.User, "site");
        Assert.Equal(1, f.Handler.RefreshCount);
        Assert.Equal("new-refresh", f.Protector.Unprotect(auth.RefreshToken));
        Assert.DoesNotContain("new-refresh", auth.RefreshToken);
    }

    [Fact]
    public async Task OAuthStateIsBrowserBoundAndSingleUse()
    {
        using var f = new Fixture();
        var controller = f.Controller();
        var state = "state"; var browser = "browser";
        f.Db.JiraOAuthStates.Add(new() { Id = Hash(state), UserId = f.User, BrowserHash = Hash(browser), ExpiresAt = DateTime.UtcNow.AddMinutes(5) });
        await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<JiraException>(() => controller.Callback(state, "code", null));
        controller.HttpContext.Request.Headers.Cookie = "jira-oauth=browser";
        Assert.IsType<RedirectResult>(await controller.Callback(state, "code", null));
        await Assert.ThrowsAsync<JiraException>(() => controller.Callback(state, "code", null));
    }

    [Fact]
    public async Task DisabledIntegrationBlocksJiraButAllowsLocalAgreements()
    {
        using var f = new Fixture(false);
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        Assert.Equal("disabled", (await Assert.ThrowsAsync<JiraException>(() => f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1)))).Code);
        Assert.Empty(f.Handler.Writes);
    }

    [Fact]
    public async Task EstimateControllerRejectsStoryFromAnotherSession()
    {
        using var f = new Fixture();
        f.Story.SessionId = Guid.NewGuid(); await f.Db.SaveChangesAsync();
        Assert.Equal(404, (await Assert.ThrowsAsync<JiraException>(() => f.Controller().Estimate("ABC123", f.Story.Id, new(5, 0)))).Status);
        Assert.Null(f.Story.AgreedEstimate);
    }

    [Fact]
    public async Task NewHostMustUseTheirOwnConnection()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        var newHost = Guid.NewGuid();
        f.Session.OrganizerId = newHost;
        f.Session.Participants.First().IsOrganizer = false;
        f.Db.Participants.Add(new() { Id = Guid.NewGuid(), SessionId = f.Session.Id, UserId = newHost, IsOrganizer = true });
        await f.Db.SaveChangesAsync();
        var requests = f.Handler.Requests;
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, newHost, new(1));
        Assert.Equal("reconnect_required", result.Jira!.PublishStatus);
        Assert.Equal(requests, f.Handler.Requests);
    }

    [Fact]
    public async Task ExpiredOAuthStateIsRejected_AndDenialConsumesState()
    {
        using var f = new Fixture();
        var controller = f.Controller();
        controller.HttpContext.Request.Headers.Cookie = "jira-oauth=browser";
        var saved = new JiraOAuthState { Id = Hash("state"), UserId = f.User, BrowserHash = Hash("browser"), ExpiresAt = DateTime.UtcNow.AddMinutes(-1) };
        f.Db.JiraOAuthStates.Add(saved); await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<JiraException>(() => controller.Callback("state", "code", null));
        saved.ExpiresAt = DateTime.UtcNow.AddMinutes(1); await f.Db.SaveChangesAsync();
        var response = Assert.IsType<RedirectResult>(await controller.Callback("state", null, "access_denied"));
        Assert.EndsWith("jira=denied", response.Url);
        Assert.Empty(f.Db.JiraOAuthStates);
    }

    [Fact]
    public async Task TeamManagedFieldIsDiscovered_AndAmbiguityRequiresSelection()
    {
        using var f = new Fixture();
        f.Handler.FieldName = "Story point estimate";
        var issue = await f.Issues.GetAsync(f.User, "site", "100", await f.Issues.FieldsAsync(f.User, "site"));
        Assert.Equal("customfield_42", issue.FieldId);
        f.Handler.AmbiguousFields = true;
        issue = await f.Issues.GetAsync(f.User, "site", "100", await f.Issues.FieldsAsync(f.User, "site"));
        Assert.Null(issue.FieldId);
        Assert.Equal(2, issue.Fields.Count);
        Assert.Equal("Choose an estimation field.", issue.UnavailableReason);
    }

    [Fact]
    public async Task InterruptedPublishingAttemptCanBeRecovered()
    {
        using var f = new Fixture();
        await f.Service.EstimateAsync("ABC123", f.Story.Id, f.User, new(5, 0));
        f.Story.JiraLink!.PublishStatus = "publishing";
        f.Db.JiraPublishAttempts.Add(new() { StoryId = f.Story.Id, ActorId = f.User, Value = 5, EstimateRevision = 1 });
        await f.Db.SaveChangesAsync();
        f.Handler.Value = 5;
        var result = await f.Service.PublishAsync("ABC123", f.Story.Id, f.User, new(1));
        Assert.Equal("published", result.Jira!.PublishStatus);
        Assert.Empty(f.Handler.Writes);
        Assert.Contains(f.Db.JiraPublishAttempts, a => a.Status == "uncertain" && a.ErrorCode == "interrupted");
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private sealed class Fixture : IDisposable
    {
        public readonly Guid User = Guid.NewGuid();
        public readonly DbContextOptions<PokerPointsDbContext> Options = new DbContextOptionsBuilder<PokerPointsDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        public readonly PokerPointsDbContext Db;
        public readonly FakeJira Handler = new();
        public readonly JiraClient Client;
        public readonly JiraIssueService Issues;
        public readonly JiraStoryService Service;
        public readonly IDataProtector Protector;
        public readonly JiraLocks Locks;
        public readonly IOptions<JiraOptions> Configuration;
        public readonly Session Session;
        public readonly Story Story;
        public Fixture(bool enabled = true)
        {
            Db = new(Options);
            var provider = new EphemeralDataProtectionProvider();
            Protector = provider.CreateProtector("Estimagator.Jira.Tokens.v1");
            Configuration = Microsoft.Extensions.Options.Options.Create(new JiraOptions { Enabled = enabled, FrontendUrl = "https://app.example", CallbackUrl = "https://app.example/api/integrations/jira/callback" });
            Locks = new(Db);
            Client = new(new HttpClient(Handler), Db, provider, Configuration, Locks);
            Issues = new(Client, Db, Locks);
            var proxy = new Mock<IClientProxy>();
            proxy.Setup(p => p.SendCoreAsync(It.IsAny<string>(), It.IsAny<object?[]>(), It.IsAny<CancellationToken>())).Returns(Task.CompletedTask);
            var hub = new Mock<IHubContext<PokerHub>>();
            hub.Setup(h => h.Clients.Group(It.IsAny<string>())).Returns(proxy.Object);
            Service = new(Db, new(Db), Client, Issues, Locks, hub.Object, NullLogger<JiraStoryService>.Instance);
            Session = new() { Id = Guid.NewGuid(), AccessCode = "ABC123", OrganizerId = User, IsActive = true };
            Session.Participants.Add(new() { Id = Guid.NewGuid(), UserId = User, IsOrganizer = true });
            Story = new() { Id = Guid.NewGuid(), SessionId = Session.Id, Status = "completed", Title = "Story", FinalScore = 5.5m };
            Story.JiraLink = new() { StoryId = Story.Id, SessionId = Session.Id, SiteId = "site", IssueId = "100", IssueKey = "TEAM-1", FieldId = "customfield_42", Baseline = 3 };
            Db.Users.Add(new() { Id = User, Email = "host@example.com" });
            Db.Sessions.Add(Session); Db.Stories.Add(Story);
            Db.JiraAuthorizations.Add(new()
            {
                UserId = User,
                AccessToken = Protector.Protect("access"),
                RefreshToken = Protector.Protect("refresh"),
                ExpiresAt = DateTime.UtcNow.AddHours(1),
                Sites = [new() { UserId = User, SiteId = "site", Name = "Test", Url = "https://example.atlassian.net" }]
            });
            Db.SaveChanges();
        }
        public JiraController Controller()
        {
            var result = new JiraController(Db, Client, Issues, Service, Locks, Configuration);
            result.ControllerContext = new() { HttpContext = new DefaultHttpContext() };
            result.HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, User.ToString())], "test"));
            return result;
        }
        public void Dispose() { Db.Dispose(); Handler.Dispose(); }
    }

    private sealed class FakeJira : HttpMessageHandler
    {
        public decimal? Value = 3;
        public List<decimal> Writes = [];
        public int Requests;
        public string PickerQuery = "";
        public int RefreshCount;
        public bool LoseResponse;
        public bool Editable = true;
        public string FieldName = "Story Points";
        public bool AmbiguousFields;
        public HttpStatusCode? Status;
        public JsonElement? Search;
        public Func<Task>? OnWrite;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests++;
            if (Status is { } status)
            {
                var response = new HttpResponseMessage(status);
                response.Headers.RetryAfter = new(TimeSpan.FromSeconds(60));
                return response;
            }
            var path = request.RequestUri!.AbsolutePath;
            if (path.EndsWith("oauth/token")) { RefreshCount++; return Json(new { access_token = "new-access", refresh_token = "new-refresh", expires_in = 3600 }); }
            if (path.EndsWith("accessible-resources")) return Json(new[] { new { id = "site", name = "Test", url = "https://example.atlassian.net", scopes = new[] { "read:jira-work", "write:jira-work" } } });
            if (path.EndsWith("/issue/picker"))
            {
                PickerQuery = request.RequestUri.Query;
                var section = new { issues = new[] { new { id = 100, key = "TEAM-1", summary = "<b>Plain</b> title", summaryText = "Plain title" } } };
                return Json(new { sections = new[] { section, section } });
            }
            if (path.EndsWith("/field"))
            {
                var fields = new List<object> { new { id = "customfield_42", name = FieldName, schema = new { type = "number" } } };
                if (AmbiguousFields) fields.Add(new { id = "customfield_99", name = "Story Points", schema = new { type = "number" } });
                return Json(fields);
            }
            if (path.EndsWith("/editmeta"))
            {
                var fields = new Dictionary<string, object>();
                if (Editable) fields["customfield_42"] = new { name = FieldName, schema = new { type = "number" }, operations = new[] { "set" } };
                if (Editable && AmbiguousFields) fields["customfield_99"] = new { name = "Story Points", schema = new { type = "number" }, operations = new[] { "set" } };
                return Json(new { fields });
            }
            if (path.EndsWith("/search/jql"))
            {
                Search = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
                return Json(new { issues = new[] { Issue() }, nextPageToken = "next" });
            }
            if (request.Method == HttpMethod.Put)
            {
                var body = await request.Content!.ReadFromJsonAsync<JsonElement>(cancellationToken);
                Value = body.GetProperty("fields").GetProperty("customfield_42").GetDecimal(); Writes.Add(Value.Value);
                if (OnWrite != null) await OnWrite();
                if (LoseResponse) throw new HttpRequestException("lost response");
                return new(HttpStatusCode.NoContent);
            }
            if (path.Contains("/issue/")) return Json(Issue());
            throw new InvalidOperationException("Unexpected fake Jira request: " + path);
        }
        private object Issue() => new { id = "100", key = "TEAM-1", fields = new { summary = "Server summary", status = new { name = "To Do" }, project = new { id = "10" }, issuetype = new { id = "20" }, customfield_42 = Value } };
        private static HttpResponseMessage Json(object body) => new(HttpStatusCode.OK) { Content = JsonContent.Create(body) };
    }
}
