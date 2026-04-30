using System.Security.Claims;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Moq;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Controllers;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data.Entities;
using Xunit;

namespace PokerPoints.Api.Tests.Controllers;

public class SessionsControllerTests
{
    [Fact]
    public void CreateSession_ShouldUseCreateSessionRateLimitPolicy()
    {
        var method = typeof(SessionsController).GetMethod(nameof(SessionsController.CreateSession));

        var attribute = method!.GetCustomAttributes(typeof(EnableRateLimitingAttribute), false)
            .Single()
            .Should()
            .BeOfType<EnableRateLimitingAttribute>()
            .Subject;

        attribute.PolicyName.Should().Be("CreateSession");
    }

    [Fact]
    public async Task CreateSession_ShouldAllowAnonymousUsers()
    {
        var fixture = CreateFixture();
        var request = new CreateSessionRequest("modified", "Guest Game", 420);
        var response = new CreateSessionResponse(Guid.NewGuid(), "ABC123", "Guest Game", 420);

        fixture.SessionService
            .Setup(s => s.CreateSessionAsync("modified", "Guest Game", null, 420))
            .ReturnsAsync(response);

        var result = await fixture.Controller.CreateSession(request);

        var created = result.Result.Should().BeOfType<CreatedResult>().Subject;
        created.Value.Should().Be(response);
        fixture.SessionService.Verify(
            s => s.CreateSessionAsync("modified", "Guest Game", null, 420),
            Times.Once);
        fixture.AuthService.Verify(s => s.GetUserByIdAsync(It.IsAny<Guid>()), Times.Never);
    }

    [Fact]
    public async Task CreateSession_ShouldAttachVerifiedAuthenticatedUser()
    {
        var userId = Guid.NewGuid();
        var fixture = CreateFixture(userId);
        var response = new CreateSessionResponse(Guid.NewGuid(), "ABC123", "Verified Game", 300);

        fixture.AuthService
            .Setup(s => s.GetUserByIdAsync(userId))
            .ReturnsAsync(new User { Id = userId, EmailVerified = true });
        fixture.SessionService
            .Setup(s => s.CreateSessionAsync("fibonacci", "Verified Game", userId, 300))
            .ReturnsAsync(response);

        var result = await fixture.Controller.CreateSession(
            new CreateSessionRequest("fibonacci", "Verified Game", 300));

        result.Result.Should().BeOfType<CreatedResult>();
        fixture.SessionService.Verify(
            s => s.CreateSessionAsync("fibonacci", "Verified Game", userId, 300),
            Times.Once);
    }

    [Fact]
    public async Task CreateSession_ShouldTreatUnverifiedAuthenticatedUserAsGuest()
    {
        var userId = Guid.NewGuid();
        var fixture = CreateFixture(userId);
        var response = new CreateSessionResponse(Guid.NewGuid(), "ABC123", "Guest Game", 300);

        fixture.AuthService
            .Setup(s => s.GetUserByIdAsync(userId))
            .ReturnsAsync(new User { Id = userId, EmailVerified = false });
        fixture.SessionService
            .Setup(s => s.CreateSessionAsync("fibonacci", "Guest Game", null, 300))
            .ReturnsAsync(response);

        var result = await fixture.Controller.CreateSession(
            new CreateSessionRequest("fibonacci", "Guest Game", 300));

        result.Result.Should().BeOfType<CreatedResult>();
        fixture.SessionService.Verify(
            s => s.CreateSessionAsync("fibonacci", "Guest Game", null, 300),
            Times.Once);
    }

    private static ControllerFixture CreateFixture(Guid? userId = null)
    {
        var sessionService = new Mock<ISessionService>();
        var authService = new Mock<IAuthService>();
        var controller = new SessionsController(sessionService.Object, authService.Object)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = CreatePrincipal(userId)
                }
            }
        };

        return new ControllerFixture(controller, sessionService, authService);
    }

    private static ClaimsPrincipal CreatePrincipal(Guid? userId)
    {
        if (!userId.HasValue)
        {
            return new ClaimsPrincipal(new ClaimsIdentity());
        }

        var identity = new ClaimsIdentity(
            new[] { new Claim(ClaimTypes.NameIdentifier, userId.Value.ToString()) },
            "TestAuth");
        return new ClaimsPrincipal(identity);
    }

    private sealed record ControllerFixture(
        SessionsController Controller,
        Mock<ISessionService> SessionService,
        Mock<IAuthService> AuthService);
}
