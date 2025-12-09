using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;

namespace PokerPoints.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SessionsController : ControllerBase
{
    private readonly ISessionService _sessionService;
    private readonly IAuthService _authService;

    public SessionsController(ISessionService sessionService, IAuthService authService)
    {
        _sessionService = sessionService;
        _authService = authService;
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<CreateSessionResponse>> CreateSession([FromBody] CreateSessionRequest? request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var user = await _authService.GetUserByIdAsync(userId);
        if (user == null)
            return Unauthorized();

        if (!user.EmailVerified)
            return StatusCode(403, new { message = "Please verify your email address before creating sessions" });

        var deckType = request?.DeckType ?? "fibonacci";
        var result = await _sessionService.CreateSessionAsync(deckType, userId);
        return Created($"/api/sessions/{result.AccessCode}", result);
    }

    [HttpGet("{code}")]
    public async Task<ActionResult<SessionInfoResponse>> GetSession(string code)
    {
        var session = await _sessionService.GetSessionInfoAsync(code);
        if (session == null)
            return NotFound(new { error = "Session not found" });

        return Ok(session);
    }

    [HttpGet("{code}/state")]
    public async Task<ActionResult<GameStateResponse>> GetSessionState(string code)
    {
        var state = await _sessionService.GetGameStateAsync(code);
        if (state == null)
            return NotFound(new { error = "Session not found" });

        return Ok(state);
    }

    [Authorize]
    [HttpGet("my-sessions")]
    public async Task<ActionResult<List<SessionInfoResponse>>> GetMySessions()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var sessions = await _sessionService.GetUserSessionsAsync(userId);
        return Ok(sessions);
    }
}
