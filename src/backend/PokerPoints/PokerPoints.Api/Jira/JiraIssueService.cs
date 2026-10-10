using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Jira;

public class JiraIssueService(JiraClient client, PokerPointsDbContext db, JiraLocks locks, IMemoryCache cache)
{
    private static readonly string[] IssueFields = ["summary", "status", "project", "issuetype"];
    private static readonly TimeSpan FieldCacheDuration = TimeSpan.FromMinutes(5);

    public Task<JsonElement> ProjectsAsync(Guid user, string site, int startAt) => client.SendAsync(user, site,
        HttpMethod.Get, $"project/search?maxResults=50&startAt={Math.Max(0, startAt)}");

    public record Suggestion(string Id, string Key, string Summary);

    public async Task<List<Suggestion>> SuggestionsAsync(Guid user, string site, string? query)
    {
        query = query?.Trim() ?? "";
        if (query.Length > 100)
            throw new JiraException(400, "query_too_long", "Use at most 100 characters to find a story.");
        var response = await client.SendAsync(user, site, HttpMethod.Get,
            $"issue/picker?query={Uri.EscapeDataString(query)}&currentJQL={Uri.EscapeDataString("ORDER BY updated DESC")}&showSubTasks=true");
        return response.GetProperty("sections").EnumerateArray()
            .SelectMany(section => section.GetProperty("issues").EnumerateArray())
            .Select(issue => new Suggestion(issue.GetProperty("id").ToString(),
                issue.GetProperty("key").GetString()!,
                issue.TryGetProperty("summaryText", out var summary) ? summary.GetString() ?? "" : ""))
            .DistinctBy(issue => issue.Id).Take(15).ToList();
    }

    public async Task<JiraSearchResult> SearchAsync(Guid user, JiraSearchRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Jql) && string.IsNullOrWhiteSpace(request.ProjectId))
            throw new JiraException(400, "query_required", "Select a project or enter JQL.");
        var jql = string.IsNullOrWhiteSpace(request.Jql)
            ? $"project = {JsonSerializer.Serialize(request.ProjectId)} AND issuetype = Story ORDER BY Rank ASC" : request.Jql;
        var fields = await FieldsAsync(user, request.SiteId);
        var response = await client.SendAsync(user, request.SiteId, HttpMethod.Post, "search/jql", new
        {
            jql,
            maxResults = 25,
            nextPageToken = request.NextPageToken,
            expand = "editmeta",
            fields = IssueFields.Concat(fields.Select(f => f.Id)).ToArray()
        });
        var mappings = await db.JiraFieldMappings.AsNoTracking()
            .Where(m => m.UserId == user && m.SiteId == request.SiteId).ToListAsync();
        var issues = new List<JiraIssue>();
        foreach (var issue in response.GetProperty("issues").EnumerateArray())
        {
            var (project, type) = ProjectAndType(issue);
            var mapping = mappings.FirstOrDefault(m => m.ProjectId == project && m.IssueTypeId == type);
            issues.Add(Describe(issue, fields, await EditableAsync(user, request.SiteId, issue), mapping));
        }
        return new(issues, response.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null);
    }

    public async Task<List<JiraField>> FieldsAsync(Guid user, string site) =>
        (await cache.GetOrCreateAsync((typeof(JiraIssueService), user, site), async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = FieldCacheDuration;
            var result = await client.SendAsync(user, site, HttpMethod.Get, "field");
            return result.EnumerateArray().Where(f => f.TryGetProperty("schema", out var schema)
                && schema.TryGetProperty("type", out var type) && type.GetString() == "number")
                .Select(f => new JiraField(f.GetProperty("id").GetString()!, f.GetProperty("name").GetString()!)).ToList();
        }))!;

    public Task<JsonElement> ReadAsync(Guid user, string site, string issue, IEnumerable<string> fields, bool editMeta = false) =>
        client.SendAsync(user, site, HttpMethod.Get,
            $"issue/{Uri.EscapeDataString(issue)}?fields={Uri.EscapeDataString(string.Join(',', fields))}{(editMeta ? "&expand=editmeta" : "")}");

    public async Task<JiraIssue> GetAsync(Guid user, string site, string issue, List<JiraField> fields, string? selected = null)
    {
        var raw = await ReadAsync(user, site, issue, IssueFields.Concat(fields.Select(f => f.Id)), editMeta: true);
        var (project, type) = ProjectAndType(raw);
        var mapping = await db.JiraFieldMappings.FindAsync(user, site, project, type);
        return Describe(raw, fields, await EditableAsync(user, site, raw), mapping, selected);
    }

    public async Task<List<JiraField>> EditableAsync(Guid user, string site, string issue) =>
        Editable(await client.SendAsync(user, site, HttpMethod.Get, $"issue/{Uri.EscapeDataString(issue)}/editmeta"));

    private async Task<List<JiraField>> EditableAsync(Guid user, string site, JsonElement raw)
    {
        if (raw.TryGetProperty("editmeta", out var meta)) return Editable(meta);
        // Jira left out the expansion we asked for, so fall back to one request per issue.
        try { return await EditableAsync(user, site, raw.GetProperty("id").GetString()!); }
        catch (JiraException ex) when (ex.Status is 403 or 404) { return []; }
    }

    private static List<JiraField> Editable(JsonElement meta) => !meta.TryGetProperty("fields", out var fields) ? [] :
        fields.EnumerateObject().Where(f =>
            f.Value.TryGetProperty("schema", out var schema) && schema.TryGetProperty("type", out var type) && type.GetString() == "number"
            && f.Value.TryGetProperty("operations", out var ops) && ops.EnumerateArray().Any(o => o.GetString() == "set"))
            .Select(f => new JiraField(f.Name, f.Value.GetProperty("name").GetString()!)).ToList();

    private static (string Project, string Type) ProjectAndType(JsonElement raw)
    {
        var data = raw.GetProperty("fields");
        return (data.GetProperty("project").GetProperty("id").GetString()!, data.GetProperty("issuetype").GetProperty("id").GetString()!);
    }

    private static JiraIssue Describe(JsonElement raw, List<JiraField> fields, List<JiraField> editable, JiraFieldMapping? mapping, string? selected = null)
    {
        var data = raw.GetProperty("fields");
        var id = raw.GetProperty("id").GetString()!;
        var (project, type) = ProjectAndType(raw);
        var standards = fields.Where(f => f.Name.Equals("Story Points", StringComparison.OrdinalIgnoreCase)
            || f.Name.Equals("Story point estimate", StringComparison.OrdinalIgnoreCase)).ToList();
        var candidates = standards.Where(s => editable.Any(e => e.Id == s.Id)).ToList();
        var field = selected ?? mapping?.FieldId ?? (candidates.Count == 1 ? candidates[0].Id : standards.Count == 1 ? standards[0].Id : null);
        if (selected != null && !editable.Any(f => f.Id == selected))
            throw new JiraException(400, "field_unavailable", "Choose an editable numeric estimation field.");
        var unavailable = field == null ? "Choose an estimation field." : !editable.Any(f => f.Id == field)
            ? "The estimation field is not editable with your Jira account." : null;
        return new(id, raw.GetProperty("key").GetString()!, data.GetProperty("summary").GetString()!,
            data.GetProperty("status").GetProperty("name").GetString()!, project, type, field,
            field == null ? null : Value(data, field), editable, unavailable);
    }

    public static decimal? Value(JsonElement fields, string field) => fields.TryGetProperty(field, out var value)
        && value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out var number) ? number : null;

    public async Task SaveMappingAsync(Guid user, string site, JiraIssue issue)
    {
        if (issue.FieldId == null || issue.UnavailableReason != null) return;
        await using var lease = await locks.AcquireAsync($"jira-field:{user}:{site}:{issue.ProjectId}:{issue.IssueTypeId}");
        var mapping = await db.JiraFieldMappings.FindAsync(user, site, issue.ProjectId, issue.IssueTypeId);
        if (mapping == null)
        {
            mapping = new() { UserId = user, SiteId = site, ProjectId = issue.ProjectId, IssueTypeId = issue.IssueTypeId };
            db.JiraFieldMappings.Add(mapping);
        }
        mapping.FieldId = issue.FieldId;
        await db.SaveChangesAsync();
    }
}
