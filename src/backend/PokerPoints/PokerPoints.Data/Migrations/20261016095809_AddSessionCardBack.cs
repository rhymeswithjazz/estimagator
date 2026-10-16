using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PokerPoints.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionCardBack : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CardBack",
                table: "Sessions",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "classic-red");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CardBack",
                table: "Sessions");
        }
    }
}
