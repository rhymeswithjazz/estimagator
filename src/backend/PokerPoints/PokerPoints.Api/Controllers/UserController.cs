using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PokerPoints.Api.Authentication;
using PokerPoints.Data;

namespace PokerPoints.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class UserController : ControllerBase
{
    private readonly PokerPointsDbContext _context;

    public UserController(PokerPointsDbContext context)
    {
        _context = context;
    }

    [HttpPut("profile")]
    public async Task<ActionResult<UserDto>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return NotFound();

        if (!string.IsNullOrWhiteSpace(request.DisplayName))
        {
            user.DisplayName = request.DisplayName.Trim();
        }

        await _context.SaveChangesAsync();

        return Ok(new UserDto(
            Id: user.Id,
            Email: user.Email ?? "",
            DisplayName: user.DisplayName ?? "",
            CreatedAt: user.CreatedAt,
            EmailVerified: user.EmailVerified
        ));
    }
}

public record UpdateProfileRequest(string? DisplayName);
