using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;

namespace PokerPoints.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SessionsController : ControllerBase
{
    private readonly ISessionService _sessionService;

    public SessionsController(ISessionService sessionService)
    {
        _sessionService = sessionService;
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<CreateSessionResponse>> CreateSession([FromBody] CreateSessionRequest? request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? organizerId = Guid.TryParse(userIdClaim, out var userId) ? userId : null;

        var deckType = request?.DeckType ?? "fibonacci";
        var result = await _sessionService.CreateSessionAsync(deckType, organizerId);
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
