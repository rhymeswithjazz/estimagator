namespace PokerPoints.Data.Entities;

public class JiraAuthorization
{
    public Guid UserId { get; set; }
    public string AccessToken { get; set; } = "";
    public string RefreshToken { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public string Scopes { get; set; } = "";
    public bool ReconnectRequired { get; set; }
    public DateTime? RetryAfter { get; set; }
    public List<JiraSite> Sites { get; set; } = [];
}

public class JiraSite
{
    public Guid UserId { get; set; }
    public string SiteId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
}

public class JiraOAuthState
{
    public string Id { get; set; } = "";
    public Guid UserId { get; set; }
    public string BrowserHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public string ReturnPath { get; set; } = "/profile";
}

public class JiraFieldMapping
{
    public Guid UserId { get; set; }
    public string SiteId { get; set; } = "";
    public string ProjectId { get; set; } = "";
    public string IssueTypeId { get; set; } = "";
    public string FieldId { get; set; } = "";
}

public class JiraStoryLink
{
    public Guid StoryId { get; set; }
    public Guid SessionId { get; set; }
    public string SiteId { get; set; } = "";
    public string IssueId { get; set; } = "";
    public string IssueKey { get; set; } = "";
    public string ProjectId { get; set; } = "";
    public string IssueTypeId { get; set; } = "";
    public string? FieldId { get; set; }
    public decimal? Baseline { get; set; }
    public string PublishStatus { get; set; } = "not_published";
    public string? Message { get; set; }
    public decimal? ConflictValue { get; set; }
    public DateTime? RetryAfter { get; set; }
    public decimal? PublishedValue { get; set; }
    public int? PublishedRevision { get; set; }
    public DateTime? PublishedAt { get; set; }
    public Guid? PublishedBy { get; set; }
}

public class JiraPublishAttempt
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StoryId { get; set; }
    public Guid ActorId { get; set; }
    public string SiteId { get; set; } = "";
    public string IssueId { get; set; } = "";
    public string FieldId { get; set; } = "";
    public int EstimateRevision { get; set; }
    public decimal Value { get; set; }
    public string Status { get; set; } = "publishing";
    public string? ErrorCode { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? FinishedAt { get; set; }
}
