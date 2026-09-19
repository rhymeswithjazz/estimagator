using PokerPoints.Data.Entities;

namespace PokerPoints.Api.Jira;

public class JiraOptions
{
    public bool Enabled { get; set; }
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string CallbackUrl { get; set; } = "";
    public string FrontendUrl { get; set; } = "";
    public string KeyPath { get; set; } = "";
    public string CertificatePath { get; set; } = "";
    public string CertificatePassword { get; set; } = "";
}

public class JiraException(int status, string code, string message, DateTime? retryAfter = null) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public DateTime? RetryAfter { get; } = retryAfter;
}

public record JiraField(string Id, string Name);
public record JiraIssue(string Id, string Key, string Summary, string Status, string ProjectId,
    string IssueTypeId, string? FieldId, decimal? Estimate, List<JiraField> Fields, string? UnavailableReason);
public record JiraSearchResult(List<JiraIssue> Issues, string? NextPageToken);
public record JiraSearchRequest(string SiteId, string? ProjectId, string? Jql, string? NextPageToken);
public record JiraImportItem(string IssueId, string? FieldId);
public record JiraImportRequest(string SiteId, List<JiraImportItem> Issues);
public record EstimateRequest(decimal? Value, int ExpectedRevision);
public record PublishRequest(int ExpectedRevision, bool Replace = false, decimal? ObservedValue = null);
public record JiraLinkDto(string SiteId, string IssueId, string Key, string? FieldId, string PublishStatus,
    string? Message, decimal? ConflictValue, DateTime? RetryAfter, decimal? PublishedValue, DateTime? PublishedAt)
{
    public static JiraLinkDto? From(Story story)
    {
        var l = story.JiraLink;
        if (l == null) return null;
        var status = l.PublishStatus;
        if (status == "published" && l.PublishedRevision != story.EstimateRevision) status = "changes_pending";
        return new(l.SiteId, l.IssueId, l.IssueKey, l.FieldId, status, l.Message, l.ConflictValue,
            l.RetryAfter, l.PublishedValue, l.PublishedAt);
    }
}
