using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Hubs;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data;
using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Jira;

public class JiraStoryService(PokerPointsDbContext db, SessionAuthorization authorization, JiraClient client,
    JiraIssueService issues, JiraLocks locks, IHubContext<PokerHub> hub, ILogger<JiraStoryService> logger)
{
    public async Task<StoryDto> EstimateAsync(string code, Guid storyId, Guid user, EstimateRequest request)
    {
        var session = await authorization.RequireHostAsync(code, user);
        if (request.Value == null || request.Value < 0 || request.Value > 999.9m || decimal.Round(request.Value.Value, 1) != request.Value)
            throw new JiraException(400, "invalid_estimate", "Enter a value from 0 to 999.9 with at most one decimal place.");
        var story = await StoryAsync(session.Id, storyId);
        RequireRevision(story, request.ExpectedRevision);
        story.AgreedEstimate = request.Value;
        story.EstimateConfirmedBy = user;
        story.EstimateConfirmedAt = DateTime.UtcNow;
        story.EstimateRevision++;
        if (story.JiraLink is { } link)
        {
            link.PublishStatus = link.PublishedAt.HasValue ? "changes_pending" : "not_published";
            link.Message = null;
            link.ConflictValue = null;
        }
        await db.SaveChangesAsync();
        await NotifyAsync(session, story);
        return StoryDto.From(story);
    }

    public async Task<object> ImportAsync(string code, Guid user, JiraImportRequest request)
    {
        client.RequireEnabled();
        var session = await authorization.RequireHostAsync(code, user, true);
        if (request.Issues.Count is < 1 or > 100) throw new JiraException(400, "invalid_selection", "Select between 1 and 100 issues.");
        await using var lease = await locks.AcquireAsync($"jira-import:{session.Id}");
        var fields = await issues.FieldsAsync(user, request.SiteId);
        var site = await db.JiraSites.SingleAsync(s => s.UserId == user && s.SiteId == request.SiteId);
        var order = await db.Stories.Where(s => s.SessionId == session.Id).MaxAsync(s => (int?)s.SortOrder) ?? 0;
        var imported = new List<StoryDto>();
        var skipped = new List<object>();
        foreach (var item in request.Issues.DistinctBy(i => i.IssueId))
        {
            try
            {
                var issue = await issues.GetAsync(user, request.SiteId, item.IssueId, fields, item.FieldId);
                if (await db.JiraStoryLinks.AnyAsync(l => l.SessionId == session.Id && l.SiteId == site.SiteId && l.IssueId == issue.Id))
                { skipped.Add(new { issueId = issue.Id, reason = "Already imported." }); continue; }
                await authorization.RequireHostAsync(code, user, true);
                var story = new Story { Id = Guid.NewGuid(), SessionId = session.Id, Title = issue.Summary, SortOrder = ++order,
                    Url = $"{site.Url.TrimEnd('/')}/browse/{Uri.EscapeDataString(issue.Key)}", Status = "pending" };
                story.JiraLink = new() { StoryId = story.Id, SessionId = session.Id, SiteId = site.SiteId, IssueId = issue.Id,
                    IssueKey = issue.Key, ProjectId = issue.ProjectId, IssueTypeId = issue.IssueTypeId, FieldId = issue.FieldId,
                    Baseline = issue.Estimate, Message = issue.UnavailableReason };
                db.Stories.Add(story);
                await issues.SaveMappingAsync(user, site.SiteId, issue);
                await db.SaveChangesAsync();
                imported.Add(StoryDto.From(story));
            }
            catch (JiraException ex) when (ex.Status is 400 or 403 or 404)
            { skipped.Add(new { issueId = item.IssueId, reason = ex.Message }); }
            catch (Exception ex) when (ex is JiraException or HttpRequestException or TaskCanceledException)
            {
                skipped.Add(new { issueId = item.IssueId, reason = ex is JiraException jira ? jira.Message : "Jira is unavailable. Retry importing the remaining issues." });
                foreach (var remaining in request.Issues.SkipWhile(i => i != item).Skip(1))
                    skipped.Add(new { issueId = remaining.IssueId, reason = "Not attempted because Jira is unavailable. Retry this issue." });
                break;
            }
        }
        var queue = await db.Stories.Where(s => s.SessionId == session.Id && s.Status != "active").OrderBy(s => s.SortOrder).ToListAsync();
        await hub.Clients.Group(session.AccessCode).SendAsync("StoryQueueUpdated", queue.Select(StoryDto.From));
        return new { imported, skipped };
    }

    public async Task<StoryDto> PublishAsync(string code, Guid storyId, Guid user, PublishRequest request)
    {
        client.RequireEnabled();
        var session = await authorization.RequireHostAsync(code, user);
        await using var storyLease = await locks.AcquireAsync($"jira-story:{storyId}");
        var story = await StoryAsync(session.Id, storyId);
        var link = story.JiraLink ?? throw new JiraException(400, "not_linked", "This story is not linked to Jira.");
        if (link.FieldId == null) throw new JiraException(400, "field_required", "Choose an estimation field before publishing.");
        await using var lease = await locks.AcquireAsync($"jira-publish:{link.SiteId}:{link.IssueId}:{link.FieldId}");
        await db.Entry(story).ReloadAsync();
        await db.Entry(link).ReloadAsync();
        RequireRevision(story, request.ExpectedRevision);
        if (story.AgreedEstimate == null) throw new JiraException(400, "estimate_required", "Confirm an agreed estimate before publishing.");
        if (link.RetryAfter > DateTime.UtcNow) throw new JiraException(429, "rate_limited", "Wait before retrying.", link.RetryAfter);
        // A prior in-flight attempt is now orphaned: holding the issue lock proves no other writer is running.
        var interrupted = await db.JiraPublishAttempts.Where(a => a.StoryId == story.Id && a.Status == "publishing").ToListAsync();
        foreach (var old in interrupted) { old.Status = "uncertain"; old.ErrorCode = "interrupted"; old.FinishedAt = DateTime.UtcNow; }
        var attempt = new JiraPublishAttempt { StoryId = story.Id, ActorId = user, SiteId = link.SiteId, IssueId = link.IssueId,
            FieldId = link.FieldId, EstimateRevision = story.EstimateRevision, Value = story.AgreedEstimate.Value };
        db.JiraPublishAttempts.Add(attempt);
        link.PublishStatus = "publishing";
        link.Message = null;
        link.RetryAfter = null;
        await db.SaveChangesAsync();
        await NotifyAsync(session, story);
        try
        {
            var editable = await issues.EditableAsync(user, link.SiteId, link.IssueId);
            if (!editable.Any(f => f.Id == link.FieldId)) throw new JiraException(400, "field_unavailable", "The estimation field is not editable. Check your Jira permissions and field configuration.");
            var raw = await issues.ReadAsync(user, link.SiteId, link.IssueId, [link.FieldId]);
            var jiraFields = raw.GetProperty("fields");
            if (!jiraFields.TryGetProperty(link.FieldId, out var value) ||
                (value.ValueKind != System.Text.Json.JsonValueKind.Null && value.ValueKind != System.Text.Json.JsonValueKind.Number))
                throw new JiraException(400, "field_unavailable", "Jira did not return the numeric estimation field. Check its configuration.");
            var current = JiraIssueService.Value(jiraFields, link.FieldId);
            if (current != attempt.Value && current != link.Baseline && !(request.Replace && request.ObservedValue == current))
            {
                link.PublishStatus = "conflict";
                link.ConflictValue = current;
                link.Message = "The Jira estimate changed. Review it before replacing it.";
                attempt.Status = "conflict";
            }
            else
            {
                await authorization.RequireHostAsync(code, user);
                await db.Entry(story).ReloadAsync();
                RequireRevision(story, request.ExpectedRevision);
                if (current != attempt.Value)
                    await client.SendAsync(user, link.SiteId, HttpMethod.Put, $"issue/{Uri.EscapeDataString(link.IssueId)}",
                        new { fields = new Dictionary<string, decimal> { [link.FieldId] = attempt.Value } });
                // Agreement may have changed while Jira was responding. Never mark the newer revision published.
                await db.Entry(story).ReloadAsync();
                link.Baseline = attempt.Value;
                link.PublishedValue = attempt.Value;
                link.PublishedRevision = attempt.EstimateRevision;
                link.PublishedAt = DateTime.UtcNow;
                link.PublishedBy = user;
                link.PublishStatus = story.EstimateRevision == attempt.EstimateRevision ? "published" : "changes_pending";
                link.Message = null;
                link.ConflictValue = null;
                attempt.Status = "published";
            }
        }
        catch (Exception ex) when (ex is JiraException or HttpRequestException or TaskCanceledException)
        {
            var error = ex as JiraException;
            link.PublishStatus = error?.Code == "reconnect_required" ? "reconnect_required" : "failed";
            link.Message = error?.Message ?? "The outcome is uncertain. Retry to check Jira before writing again.";
            link.RetryAfter = error?.RetryAfter;
            attempt.Status = error == null ? "uncertain" : "failed";
            attempt.ErrorCode = error?.Code ?? "network_error";
        }
        await db.Entry(story).ReloadAsync();
        attempt.FinishedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        logger.LogInformation("Jira publish {AttemptId} finished {Status} ({ErrorCode}) in {ElapsedMs}ms", attempt.Id,
            attempt.Status, attempt.ErrorCode, (attempt.FinishedAt.Value - attempt.StartedAt).TotalMilliseconds);
        await NotifyAsync(session, story);
        return StoryDto.From(story);
    }

    public async Task<StoryDto> MapAsync(string code, Guid storyId, Guid user, string fieldId)
    {
        client.RequireEnabled();
        var session = await authorization.RequireHostAsync(code, user);
        await using var storyLease = await locks.AcquireAsync($"jira-story:{storyId}");
        var story = await StoryAsync(session.Id, storyId, false);
        var link = story.JiraLink ?? throw new JiraException(400, "not_linked", "Story is not linked to Jira.");
        // Keep the target fixed after a publish; changing it would invalidate the audit baseline.
        if (link.PublishedAt != null || await db.JiraPublishAttempts.AnyAsync(a => a.StoryId == storyId))
            throw new JiraException(409, "mapping_locked", "The field cannot change after a publishing attempt.");
        var fields = await issues.FieldsAsync(user, link.SiteId);
        var issue = await issues.GetAsync(user, link.SiteId, link.IssueId, fields, fieldId);
        link.FieldId = issue.FieldId;
        link.Baseline = issue.Estimate;
        link.Message = issue.UnavailableReason;
        await issues.SaveMappingAsync(user, link.SiteId, issue);
        await db.SaveChangesAsync();
        await NotifyAsync(session, story);
        return StoryDto.From(story);
    }

    private async Task<Story> StoryAsync(Guid session, Guid id, bool completed = true)
    {
        var story = await db.Stories.SingleOrDefaultAsync(s => s.Id == id && s.SessionId == session)
            ?? throw new JiraException(404, "not_found", "Story not found in this session.");
        if (completed && story.Status != "completed") throw new JiraException(409, "not_completed", "Complete voting before confirming or publishing an estimate.");
        return story;
    }
    private static void RequireRevision(Story story, int expected)
    {
        if (story.Status != "completed" || story.EstimateRevision != expected)
            throw new JiraException(409, "stale_estimate", "The story changed. Refresh and review its estimate.");
    }
    private Task NotifyAsync(Session session, Story story) =>
        hub.Clients.Group(session.AccessCode).SendAsync("StoryEstimateUpdated", StoryDto.From(story));
}
