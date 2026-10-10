using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PokerPoints.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddParticipantConnectionIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Participants_ConnectionId",
                table: "Participants",
                column: "ConnectionId",
                filter: "\"ConnectionId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Participants_ConnectionId",
                table: "Participants");
        }
    }
}
