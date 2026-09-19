using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PokerPoints.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddJiraIntegration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AgreedEstimate",
                table: "Stories",
                type: "numeric(4,1)",
                precision: 4,
                scale: 1,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "EstimateConfirmedAt",
                table: "Stories",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "EstimateConfirmedBy",
                table: "Stories",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EstimateRevision",
                table: "Stories",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "EndingHostUserId",
                table: "Sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "JiraAuthorizations",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccessToken = table.Column<string>(type: "text", nullable: false),
                    RefreshToken = table.Column<string>(type: "text", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Scopes = table.Column<string>(type: "text", nullable: false),
                    ReconnectRequired = table.Column<bool>(type: "boolean", nullable: false),
                    RetryAfter = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JiraAuthorizations", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_JiraAuthorizations_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JiraFieldMappings",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<string>(type: "text", nullable: false),
                    ProjectId = table.Column<string>(type: "text", nullable: false),
                    IssueTypeId = table.Column<string>(type: "text", nullable: false),
                    FieldId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JiraFieldMappings", x => new { x.UserId, x.SiteId, x.ProjectId, x.IssueTypeId });
                    table.ForeignKey(
                        name: "FK_JiraFieldMappings_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JiraOAuthStates",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    BrowserHash = table.Column<string>(type: "text", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReturnPath = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JiraOAuthStates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JiraPublishAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<string>(type: "text", nullable: false),
                    IssueId = table.Column<string>(type: "text", nullable: false),
                    FieldId = table.Column<string>(type: "text", nullable: false),
                    EstimateRevision = table.Column<int>(type: "integer", nullable: false),
                    Value = table.Column<decimal>(type: "numeric", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    ErrorCode = table.Column<string>(type: "text", nullable: true),
                    StartedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FinishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JiraPublishAttempts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JiraStoryLinks",
                columns: table => new
                {
                    StoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<string>(type: "text", nullable: false),
                    IssueId = table.Column<string>(type: "text", nullable: false),
                    IssueKey = table.Column<string>(type: "text", nullable: false),
                    ProjectId = table.Column<string>(type: "text", nullable: false),
                    IssueTypeId = table.Column<string>(type: "text", nullable: false),
                    FieldId = table.Column<string>(type: "text", nullable: true),
                    Baseline = table.Column<decimal>(type: "numeric", nullable: true),
                    PublishStatus = table.Column<string>(type: "text", nullable: false),
                    Message = table.Column<string>(type: "text", nullable: true),
                    ConflictValue = table.Column<decimal>(type: "numeric", nullable: true),
                    RetryAfter = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PublishedValue = table.Column<decimal>(type: "numeric", nullable: true),
                    PublishedRevision = table.Column<int>(type: "integer", nullable: true),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PublishedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JiraStoryLinks", x => x.StoryId);
                    table.ForeignKey(
                        name: "FK_JiraStoryLinks_Stories_StoryId",
                        column: x => x.StoryId,
                        principalTable: "Stories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JiraSites",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SiteId = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Url = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JiraSites", x => new { x.UserId, x.SiteId });
                    table.ForeignKey(
                        name: "FK_JiraSites_JiraAuthorizations_UserId",
                        column: x => x.UserId,
                        principalTable: "JiraAuthorizations",
                        principalColumn: "UserId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_JiraPublishAttempts_StoryId_StartedAt",
                table: "JiraPublishAttempts",
                columns: new[] { "StoryId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_JiraStoryLinks_SessionId_SiteId_IssueId",
                table: "JiraStoryLinks",
                columns: new[] { "SessionId", "SiteId", "IssueId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "JiraFieldMappings");

            migrationBuilder.DropTable(
                name: "JiraOAuthStates");

            migrationBuilder.DropTable(
                name: "JiraPublishAttempts");

            migrationBuilder.DropTable(
                name: "JiraSites");

            migrationBuilder.DropTable(
                name: "JiraStoryLinks");

            migrationBuilder.DropTable(
                name: "JiraAuthorizations");

            migrationBuilder.DropColumn(
                name: "AgreedEstimate",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "EstimateConfirmedAt",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "EstimateConfirmedBy",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "EstimateRevision",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "EndingHostUserId",
                table: "Sessions");
        }
    }
}
