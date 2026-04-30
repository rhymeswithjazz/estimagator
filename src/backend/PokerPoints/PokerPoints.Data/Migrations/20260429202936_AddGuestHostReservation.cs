using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PokerPoints.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestHostReservation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "GuestHostClaimedAt",
                table: "Sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GuestHostTokenHash",
                table: "Sessions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GuestHostClaimedAt",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "GuestHostTokenHash",
                table: "Sessions");
        }
    }
}
