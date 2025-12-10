using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;

namespace PokerPoints.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IEmailService _emailService;

    public AdminController(IAdminService adminService, IEmailService emailService)
    {
        _adminService = adminService;
        _emailService = emailService;
    }

    // User Management
    [HttpGet("users")]
    public async Task<ActionResult<PagedResult<AdminUserDto>>> GetUsers(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var result = await _adminService.GetUsersAsync(page, pageSize, search);
        return Ok(result);
    }

    [HttpGet("users/{id:guid}")]
    public async Task<ActionResult<AdminUserDetailDto>> GetUser(Guid id)
    {
        var user = await _adminService.GetUserDetailAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        return Ok(user);
    }

    [HttpPut("users/{id:guid}")]
    public async Task<ActionResult<AdminUserDto>> UpdateUser(Guid id, [FromBody] UpdateUserRequest request)
    {
        var user = await _adminService.UpdateUserAsync(id, request);
        if (user == null)
            return NotFound(new { message = "User not found" });

        return Ok(user);
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<ActionResult> DeleteUser(Guid id)
    {
        var success = await _adminService.DeleteUserAsync(id);
        if (!success)
            return BadRequest(new { message = "Cannot delete user (not found or is admin)" });

        return Ok(new { message = "User deleted" });
    }

    [HttpPost("users/{id:guid}/resend-verification")]
    public async Task<ActionResult> ResendUserVerification(Guid id)
    {
        var user = await _adminService.GetUserDetailAsync(id);
        if (user == null)
            return NotFound(new { message = "User not found" });

        var token = await _adminService.ResendUserVerificationAsync(id);
        if (token == null)
            return BadRequest(new { message = "User already verified or not found" });

        await _emailService.SendVerificationEmailAsync(user.Email, user.DisplayName, token);
        return Ok(new { message = "Verification email sent" });
    }

    // Session Management
    [HttpGet("sessions")]
    public async Task<ActionResult<PagedResult<AdminSessionDto>>> GetSessions(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] bool? isActive = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 100) pageSize = 20;

        var result = await _adminService.GetSessionsAsync(page, pageSize, search, isActive);
        return Ok(result);
    }

    [HttpGet("sessions/{id:guid}")]
    public async Task<ActionResult<AdminSessionDetailDto>> GetSession(Guid id)
    {
        var session = await _adminService.GetSessionDetailAsync(id);
        if (session == null)
            return NotFound(new { message = "Session not found" });

        return Ok(session);
    }

    [HttpDelete("sessions/{id:guid}")]
    public async Task<ActionResult> DeleteSession(Guid id)
    {
        var success = await _adminService.DeleteSessionAsync(id);
        if (!success)
            return NotFound(new { message = "Session not found" });

        return Ok(new { message = "Session deleted" });
    }
}
