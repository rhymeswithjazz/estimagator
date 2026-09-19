using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Jira;

[ApiController]
[Authorize]
[Route("api/integrations/jira")]
public class JiraController(PokerPointsDbContext db, JiraClient client, JiraIssueService issues,
    JiraStoryService stories, JiraLocks locks, IOptions<JiraOptions> options) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private static string Random() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    [AllowAnonymous]
    [HttpGet("enabled")]
    public object Enabled() => new { enabled = options.Value.Enabled };

    [HttpGet("connection")]
    public async Task<object> Connection()
    {
        client.RequireEnabled();
        var auth = await db.JiraAuthorizations.AsNoTracking().Include(a => a.Sites).SingleOrDefaultAsync(a => a.UserId == UserId);
        return new { connected = auth != null, reconnectRequired = auth?.ReconnectRequired ?? false,
            sites = auth?.Sites.Select(s => new { id = s.SiteId, s.Name, s.Url }).ToArray() };
    }

    public record ConnectRequest(string? ReturnPath);
    [HttpPost("authorize")]
    public async Task<object> Connect(ConnectRequest request)
    {
        client.RequireEnabled();
        var state = Random();
        var browser = Random();
        var returnPath = request.ReturnPath;
        // Only return to known routes, never an arbitrary redirect supplied by the browser.
        if (returnPath == null || !System.Text.RegularExpressions.Regex.IsMatch(returnPath, @"^/(profile|session/[A-Za-z0-9]+/history|history/[A-Za-z0-9]+|game/[A-Za-z0-9]+)$"))
            returnPath = "/profile";
        db.JiraOAuthStates.RemoveRange(await db.JiraOAuthStates.Where(s => s.UserId == UserId || s.ExpiresAt < DateTime.UtcNow).ToListAsync());
        db.JiraOAuthStates.Add(new() { Id = Hash(state), UserId = UserId, BrowserHash = Hash(browser),
            ExpiresAt = DateTime.UtcNow.AddMinutes(10), ReturnPath = returnPath });
        await db.SaveChangesAsync();
        Response.Cookies.Append("jira-oauth", browser, new CookieOptions { HttpOnly = true, Secure = options.Value.CallbackUrl.StartsWith("https://"),
            SameSite = SameSiteMode.Lax, Path = "/api/integrations/jira", MaxAge = TimeSpan.FromMinutes(10) });
        return new { url = "https://auth.atlassian.com/authorize?audience=api.atlassian.com&response_type=code&prompt=consent"
            + $"&client_id={Uri.EscapeDataString(options.Value.ClientId)}&redirect_uri={Uri.EscapeDataString(options.Value.CallbackUrl)}"
            + $"&scope={Uri.EscapeDataString(JiraClient.Scopes)}&state={state}" };
    }

    [AllowAnonymous]
    [HttpGet("callback")]
    public async Task<IActionResult> Callback(string? state, string? code, string? error)
    {
        client.RequireEnabled();
        if (state == null) throw new JiraException(400, "invalid_state", "The Jira connection request expired. Start again.");
        await using var lease = await locks.AcquireAsync($"jira-state:{Hash(state)}");
        var saved = await db.JiraOAuthStates.FindAsync(Hash(state));
        if (saved == null || saved.ExpiresAt < DateTime.UtcNow || !Request.Cookies.TryGetValue("jira-oauth", out var browser)
            || !CryptographicOperations.FixedTimeEquals(Convert.FromHexString(saved.BrowserHash), Convert.FromHexString(Hash(browser))))
            throw new JiraException(400, "invalid_state", "The Jira connection request expired or belongs to another browser. Start again.");
        db.JiraOAuthStates.Remove(saved);
        await db.SaveChangesAsync();
        Response.Cookies.Delete("jira-oauth", new CookieOptions { Path = "/api/integrations/jira" });
        var result = "connected";
        if (error != null || string.IsNullOrEmpty(code)) result = "denied";
        else
        {
            try { await client.StoreCodeAsync(saved.UserId, code); }
            catch (Exception ex) when (ex is JiraException or HttpRequestException or TaskCanceledException) { result = "failed"; }
        }
        return Redirect($"{options.Value.FrontendUrl.TrimEnd('/')}{saved.ReturnPath}?jira={result}");
    }

    [HttpDelete("connection")]
    public async Task<IActionResult> Disconnect() { await client.DisconnectAsync(UserId); return NoContent(); }

    [HttpGet("projects")]
    public async Task<object> Projects(string siteId, int startAt = 0) => await issues.ProjectsAsync(UserId, siteId, startAt);

    [HttpGet("suggestions")]
    public Task<List<JiraIssueService.Suggestion>> Suggestions(string siteId, string? query = null) =>
        issues.SuggestionsAsync(UserId, siteId, query);

    [HttpPost("search")]
    public Task<JiraSearchResult> Search(JiraSearchRequest request) => issues.SearchAsync(UserId, request);

    [HttpGet("fields")]
    public Task<List<JiraField>> Fields(string siteId, string issueId) => issues.EditableAsync(UserId, siteId, issueId);

    public record MappingRequest(string FieldId);
    [HttpPut("/api/sessions/{code}/stories/{storyId:guid}/jira/field")]
    public async Task<object> Map(string code, Guid storyId, MappingRequest request) => await stories.MapAsync(code, storyId, UserId, request.FieldId);

    [HttpPost("/api/sessions/{code}/jira/import")]
    public Task<object> Import(string code, JiraImportRequest request) => stories.ImportAsync(code, UserId, request);

    [HttpPut("/api/sessions/{code}/stories/{storyId:guid}/estimate")]
    public async Task<object> Estimate(string code, Guid storyId, EstimateRequest request) => await stories.EstimateAsync(code, storyId, UserId, request);

    [HttpPost("/api/sessions/{code}/stories/{storyId:guid}/jira/publish")]
    public async Task<object> Publish(string code, Guid storyId, PublishRequest request) => await stories.PublishAsync(code, storyId, UserId, request);
}
