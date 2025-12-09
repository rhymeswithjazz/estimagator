using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PokerPoints.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStoryUrlAndSortOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Stories",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Url",
                table: "Stories",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "Url",
                table: "Stories");
        }
    }
}
