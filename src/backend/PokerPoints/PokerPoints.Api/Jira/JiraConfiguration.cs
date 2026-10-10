using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace PokerPoints.Api.Jira;

public static class JiraConfiguration
{
    public static void AddJira(this WebApplicationBuilder builder)
    {
        var options = builder.Configuration.GetSection("Jira").Get<JiraOptions>() ?? new();
        builder.Services.Configure<JiraOptions>(builder.Configuration.GetSection("Jira"));
        var protection = builder.Services.AddDataProtection().SetApplicationName("Estimagator");
        if (options.Enabled)
        {
            bool ValidUrl(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri)
                && (uri.Scheme == "https" || (builder.Environment.IsDevelopment() && uri.Scheme == "http" && uri.IsLoopback));
            if (string.IsNullOrWhiteSpace(options.ClientId) || string.IsNullOrWhiteSpace(options.ClientSecret)
                || !ValidUrl(options.CallbackUrl) || !ValidUrl(options.FrontendUrl) || string.IsNullOrWhiteSpace(options.KeyPath))
                throw new InvalidOperationException("Jira requires ClientId, ClientSecret, CallbackUrl, FrontendUrl and a persistent KeyPath.");
            protection.PersistKeysToFileSystem(new DirectoryInfo(options.KeyPath));
            if (!builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(options.CertificatePath))
                throw new InvalidOperationException("Jira requires a token-protection certificate in production.");
            if (!string.IsNullOrWhiteSpace(options.CertificatePath))
                protection.ProtectKeysWithCertificate(X509CertificateLoader.LoadPkcs12FromFile(options.CertificatePath, options.CertificatePassword));
        }
        builder.Services.AddMemoryCache();
        builder.Services.AddScoped<JiraLocks>();
        builder.Services.AddScoped<Services.SessionAuthorization>();
        builder.Services.AddScoped<JiraIssueService>();
        builder.Services.AddScoped<JiraStoryService>();
        builder.Services.AddHttpClient<JiraClient>(http => http.Timeout = TimeSpan.FromSeconds(30)).RemoveAllLoggers();
    }

    public static void UseJiraErrors(this WebApplication app) => app.Use(async (context, next) =>
    {
        try { await next(context); }
        catch (JiraException ex)
        {
            context.Response.StatusCode = ex.Status;
            if (ex.RetryAfter is { } retry) context.Response.Headers.RetryAfter = Math.Max(1, (int)(retry - DateTime.UtcNow).TotalSeconds).ToString();
            await context.Response.WriteAsJsonAsync(new { error = ex.Message, code = ex.Code, retryAfter = ex.RetryAfter });
        }
        catch (DbUpdateConcurrencyException) when (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.StatusCode = 409;
            await context.Response.WriteAsJsonAsync(new { error = "The story changed. Refresh and try again.", code = "stale_estimate" });
        }
        catch (Exception ex) when ((ex is HttpRequestException or TaskCanceledException) && context.Request.Path.Value?.Contains("jira") == true)
        {
            context.Response.StatusCode = 503;
            await context.Response.WriteAsJsonAsync(new { error = "Jira is unavailable. Try again later.", code = "network_error" });
        }
    });
}
