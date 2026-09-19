using System.Security.Cryptography;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Jira;

public class JiraClient(HttpClient http, PokerPointsDbContext db, IDataProtectionProvider protection,
    IOptions<JiraOptions> options, JiraLocks locks)
{
    private readonly IDataProtector protector = protection.CreateProtector("Estimagator.Jira.Tokens.v1");
    public const string Scopes = "read:jira-work write:jira-work offline_access";
    public void RequireEnabled()
    {
        if (!options.Value.Enabled) throw new JiraException(404, "disabled", "Jira integration is disabled.");
    }

    public async Task StoreCodeAsync(Guid userId, string code)
    {
        RequireEnabled();
        await using var lease = await locks.AcquireAsync($"jira-auth:{userId}");
        var token = await TokenAsync(new { grant_type = "authorization_code", client_id = options.Value.ClientId,
            client_secret = options.Value.ClientSecret, code, redirect_uri = options.Value.CallbackUrl });
        if (!token.TryGetProperty("refresh_token", out _))
            throw new JiraException(400, "offline_access_required", "Reconnect Jira and grant offline access.");
        var sites = await ResourcesAsync(token.GetProperty("access_token").GetString()!);
        var auth = await db.JiraAuthorizations.Include(a => a.Sites).SingleOrDefaultAsync(a => a.UserId == userId);
        if (auth == null) { auth = new() { UserId = userId }; db.JiraAuthorizations.Add(auth); }
        else { db.JiraSites.RemoveRange(auth.Sites); await db.SaveChangesAsync(); auth.Sites.Clear(); }
        SetTokens(auth, token);
        auth.Sites = sites.Select(s => new JiraSite { UserId = userId, SiteId = s.Id, Name = s.Name, Url = s.Url }).ToList();
        await db.SaveChangesAsync();
    }

    public async Task DisconnectAsync(Guid userId)
    {
        await using var lease = await locks.AcquireAsync($"jira-auth:{userId}");
        var auth = await db.JiraAuthorizations.Include(a => a.Sites).SingleOrDefaultAsync(a => a.UserId == userId);
        if (auth != null) db.JiraAuthorizations.Remove(auth);
        db.JiraOAuthStates.RemoveRange(await db.JiraOAuthStates.Where(s => s.UserId == userId).ToListAsync());
        await db.SaveChangesAsync();
    }

    public async Task<JsonElement> SendAsync(Guid userId, string siteId, HttpMethod method, string path, object? body = null)
    {
        RequireEnabled();
        // Hold the authorization lock through the request so disconnect and refresh cannot race it.
        await using var lease = await locks.AcquireAsync($"jira-auth:{userId}");
        var auth = await db.JiraAuthorizations.Include(a => a.Sites).SingleOrDefaultAsync(a => a.UserId == userId);
        if (auth == null || auth.ReconnectRequired) throw new JiraException(401, "reconnect_required", "Connect or reconnect your Jira account.");
        await db.Entry(auth).ReloadAsync();
        if (auth.ReconnectRequired) throw new JiraException(401, "reconnect_required", "Reconnect your Jira account.");
        if (!auth.Sites.Any(s => s.SiteId == siteId)) throw new JiraException(403, "site_unavailable", "This Jira site is not available to your account.");
        if (auth.RetryAfter > DateTime.UtcNow) throw new JiraException(429, "rate_limited", "Jira requested a pause before retrying.", auth.RetryAfter);
        string accessToken;
        string refreshToken;
        try
        {
            accessToken = protector.Unprotect(auth.AccessToken);
            refreshToken = protector.Unprotect(auth.RefreshToken);
        }
        catch (CryptographicException)
        {
            auth.ReconnectRequired = true;
            await db.SaveChangesAsync();
            throw new JiraException(401, "reconnect_required", "Reconnect Jira to replace credentials that can no longer be decrypted.");
        }
        if (auth.ExpiresAt <= DateTime.UtcNow.AddMinutes(1))
        {
            try
            {
                var token = await TokenAsync(new { grant_type = "refresh_token", client_id = options.Value.ClientId,
                    client_secret = options.Value.ClientSecret, refresh_token = refreshToken });
                SetTokens(auth, token);
                accessToken = protector.Unprotect(auth.AccessToken);
                await db.SaveChangesAsync();
            }
            catch (JiraException ex) when (ex.Status == 429)
            {
                auth.RetryAfter = ex.RetryAfter;
                await db.SaveChangesAsync();
                throw;
            }
            catch (JiraException ex) when (ex.Status is 400 or 401)
            {
                auth.ReconnectRequired = true;
                await db.SaveChangesAsync();
                throw new JiraException(401, "reconnect_required", "Reconnect your Jira account.");
            }
        }
        using var request = new HttpRequestMessage(method, $"https://api.atlassian.com/ex/jira/{Uri.EscapeDataString(siteId)}/rest/api/3/{path}");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        if (body != null) request.Content = JsonContent.Create(body);
        try { return await ExecuteAsync(request); }
        catch (JiraException ex)
        {
            if (ex.Status == 401) auth.ReconnectRequired = true;
            if (ex.Status == 429) auth.RetryAfter = ex.RetryAfter;
            await db.SaveChangesAsync();
            throw;
        }
    }

    private void SetTokens(JiraAuthorization auth, JsonElement token)
    {
        auth.AccessToken = protector.Protect(token.GetProperty("access_token").GetString()!);
        if (token.TryGetProperty("refresh_token", out var refresh)) auth.RefreshToken = protector.Protect(refresh.GetString()!);
        auth.ExpiresAt = DateTime.UtcNow.AddSeconds(token.GetProperty("expires_in").GetInt32());
        auth.Scopes = token.TryGetProperty("scope", out var scope) ? scope.GetString() ?? Scopes : Scopes;
        auth.ReconnectRequired = false;
        auth.RetryAfter = null;
    }
    private async Task<JsonElement> TokenAsync(object body)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://auth.atlassian.com/oauth/token") { Content = JsonContent.Create(body) };
        return await ExecuteAsync(request);
    }
    private async Task<List<(string Id, string Name, string Url)>> ResourcesAsync(string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.atlassian.com/oauth/token/accessible-resources");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        var result = await ExecuteAsync(request);
        return result.EnumerateArray().Where(s => s.GetProperty("scopes").EnumerateArray().Any(v => v.GetString() == "read:jira-work"))
            .Select(s => (s.GetProperty("id").GetString()!, s.GetProperty("name").GetString()!, s.GetProperty("url").GetString()!)).DistinctBy(s => s.Item1).ToList();
    }
    private async Task<JsonElement> ExecuteAsync(HttpRequestMessage request)
    {
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        using var response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var status = (int)response.StatusCode;
            var retry = response.Headers.RetryAfter?.Date?.UtcDateTime
                ?? DateTime.UtcNow.Add(response.Headers.RetryAfter?.Delta ?? TimeSpan.FromSeconds(30));
            throw new JiraException(status, status switch { 401 => "reconnect_required", 403 => "permission_denied", 404 => "issue_unavailable", 429 => "rate_limited", _ => "jira_error" },
                status switch { 401 => "Reconnect your Jira account.", 403 => "Your Jira account cannot perform this action.", 404 => "Jira issue or resource is unavailable.", 429 => "Jira requested a pause before retrying.", 400 => "Jira rejected the query or field value. Check the JQL and field configuration.", _ => "Jira is unavailable. Try again later." }, status == 429 ? retry : null);
        }
        if (response.StatusCode == HttpStatusCode.NoContent || response.Content.Headers.ContentLength == 0)
            return JsonSerializer.SerializeToElement(new { });
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
}
