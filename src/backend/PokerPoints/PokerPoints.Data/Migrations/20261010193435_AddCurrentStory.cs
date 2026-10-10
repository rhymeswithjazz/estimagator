using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PokerPoints.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCurrentStory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CurrentStoryId",
                table: "Sessions",
                type: "uuid",
                nullable: true);

            // Older sessions did not record which completed story was displayed.
            // Prefer an open story, otherwise the most recently created completed story.
            // Never change story status or votes while establishing this reference.
            migrationBuilder.Sql("""
                UPDATE "Sessions" AS session
                SET "CurrentStoryId" = (
                    SELECT story."Id" FROM "Stories" AS story
                    WHERE story."SessionId" = session."Id"
                      AND story."Status" IN ('active', 'completed')
                    ORDER BY (story."Status" = 'active') DESC,
                             story."CreatedAt" DESC, story."SortOrder" DESC, story."Id" DESC
                    LIMIT 1
                );
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_CurrentStoryId",
                table: "Sessions",
                column: "CurrentStoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Sessions_Stories_CurrentStoryId",
                table: "Sessions",
                column: "CurrentStoryId",
                principalTable: "Stories",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Sessions_Stories_CurrentStoryId",
                table: "Sessions");

            migrationBuilder.DropIndex(
                name: "IX_Sessions_CurrentStoryId",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "CurrentStoryId",
                table: "Sessions");
        }
    }
}
