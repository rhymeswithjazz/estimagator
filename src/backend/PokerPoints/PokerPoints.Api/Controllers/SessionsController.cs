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

    [HttpPost]
    public async Task<ActionResult<CreateSessionResponse>> CreateSession([FromBody] CreateSessionRequest? request)
    {
        var deckType = request?.DeckType ?? "fibonacci";
        var result = await _sessionService.CreateSessionAsync(deckType);
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
}
