using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Services;

namespace PokerPoints.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IEmailService _emailService;

    public AuthController(IAuthService authService, IEmailService emailService)
    {
        _authService = authService;
        _emailService = emailService;
    }

    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        var (response, verificationToken) = await _authService.RegisterAsync(request);

        if (response == null)
        {
            return Conflict(new { message = "A user with this email already exists" });
        }

        if (verificationToken != null)
        {
            await _emailService.SendVerificationEmailAsync(
                request.Email,
                request.DisplayName,
                verificationToken);
        }

        return Ok(response);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var result = await _authService.LoginAsync(request);

        if (result == null)
        {
            return Unauthorized(new { message = "Invalid email or password" });
        }

        return Ok(result);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> RefreshToken([FromBody] RefreshTokenRequest request)
    {
        var result = await _authService.RefreshTokenAsync(request.RefreshToken);

        if (result == null)
        {
            return Unauthorized(new { message = "Invalid or expired refresh token" });
        }

        return Ok(result);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<ActionResult> Logout()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (Guid.TryParse(userIdClaim, out var userId))
        {
            await _authService.RevokeRefreshTokenAsync(userId);
        }

        return Ok(new { message = "Logged out successfully" });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<UserDto>> GetCurrentUser()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        var user = await _authService.GetUserByIdAsync(userId);

        if (user == null)
        {
            return NotFound();
        }

        return Ok(new UserDto(
            Id: user.Id,
            Email: user.Email ?? "",
            DisplayName: user.DisplayName ?? "",
            CreatedAt: user.CreatedAt,
            EmailVerified: user.EmailVerified,
            Role: user.Role.ToString()
        ));
    }

    [HttpPost("verify-email")]
    public async Task<ActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
    {
        var success = await _authService.VerifyEmailAsync(request.Token);

        if (!success)
        {
            return BadRequest(new { message = "Invalid or expired verification token" });
        }

        return Ok(new { message = "Email verified successfully" });
    }

    [HttpPost("resend-verification")]
    public async Task<ActionResult> ResendVerification([FromBody] ResendVerificationRequest request)
    {
        var token = await _authService.ResendVerificationEmailAsync(request.Email);
        var user = await _authService.GetUserByEmailAsync(request.Email);

        if (token != null && user != null)
        {
            await _emailService.SendVerificationEmailAsync(
                user.Email!,
                user.DisplayName ?? "User",
                token);
        }

        // Always return success to prevent email enumeration
        return Ok(new { message = "If an account exists with that email, a verification link has been sent" });
    }

    [HttpPost("forgot-password")]
    public async Task<ActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
    {
        var token = await _authService.GeneratePasswordResetTokenAsync(request.Email);
        var user = await _authService.GetUserByEmailAsync(request.Email);

        if (token != null && user != null)
        {
            await _emailService.SendPasswordResetEmailAsync(
                user.Email!,
                user.DisplayName ?? "User",
                token);
        }

        // Always return success to prevent email enumeration
        return Ok(new { message = "If an account exists with that email, a password reset link has been sent" });
    }

    [HttpPost("reset-password")]
    public async Task<ActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var success = await _authService.ResetPasswordAsync(request.Token, request.NewPassword);

        if (!success)
        {
            return BadRequest(new { message = "Invalid or expired reset token" });
        }

        return Ok(new { message = "Password reset successfully" });
    }
}
