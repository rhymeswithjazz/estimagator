using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using PokerPoints.Api.Models;
using PokerPoints.Api.Services;
using PokerPoints.Data;
using PokerPoints.Data.Entities;
using Xunit;

namespace PokerPoints.Api.Tests.Services;

public class SessionServiceTests : IDisposable
{
    private readonly PokerPointsDbContext _db;
    private readonly SessionService _service;

    public SessionServiceTests()
    {
        var options = new DbContextOptionsBuilder<PokerPointsDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        _db = new PokerPointsDbContext(options);
        _service = new SessionService(_db);
    }

    public void Dispose()
    {
        _db.Database.EnsureDeleted();
        _db.Dispose();
    }

    [Fact]
    public async Task CreateSessionAsync_ShouldCreateSessionWithUniqueAccessCode()
    {
        // Arrange
        var deckType = "fibonacci";
        var name = "Test Session";
        var organizerId = Guid.NewGuid();

        // Act
        var result = await _service.CreateSessionAsync(deckType, name, organizerId);

        // Assert
        result.Should().NotBeNull();
        result.AccessCode.Should().HaveLength(6);
        result.Name.Should().Be(name);

        var sessionInDb = await _db.Sessions.FirstOrDefaultAsync(s => s.AccessCode == result.AccessCode);
        sessionInDb.Should().NotBeNull();
        sessionInDb!.DeckType.Should().Be(deckType);
        sessionInDb.IsActive.Should().BeTrue();
        sessionInDb.OrganizerId.Should().Be(organizerId);
    }

    [Fact]
    public async Task CreateSessionAsync_ShouldGenerateUniqueAccessCodes()
    {
        // Arrange & Act
        var session1 = await _service.CreateSessionAsync("fibonacci");
        var session2 = await _service.CreateSessionAsync("fibonacci");
        var session3 = await _service.CreateSessionAsync("fibonacci");

        // Assert
        var codes = new[] { session1.AccessCode, session2.AccessCode, session3.AccessCode };
        codes.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task GetSessionByCodeAsync_ShouldReturnSession_WhenCodeExists()
    {
        // Arrange
        var session = new Session
        {
            AccessCode = "ABC123",
            DeckType = "fibonacci",
            IsActive = true
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.GetSessionByCodeAsync("abc123"); // Case insensitive

        // Assert
        result.Should().NotBeNull();
        result!.AccessCode.Should().Be("ABC123");
    }

    [Fact]
    public async Task GetSessionByCodeAsync_ShouldReturnNull_WhenSessionIsInactive()
    {
        // Arrange
        var session = new Session
        {
            AccessCode = "ABC123",
            DeckType = "fibonacci",
            IsActive = false
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.GetSessionByCodeAsync("ABC123");

        // Assert
        result.Should().BeNull();
    }

    [Fact]
    public async Task GetOrCreateActiveStoryAsync_ShouldReturnExistingActiveStory()
    {
        // Arrange
        var session = new Session { AccessCode = "ABC123", DeckType = "fibonacci", IsActive = true };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var existingStory = new Story
        {
            SessionId = session.Id,
            Title = "Existing Story",
            Status = "active"
        };
        _db.Stories.Add(existingStory);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.GetOrCreateActiveStoryAsync(session.Id);

        // Assert
        result.Should().NotBeNull();
        result!.Id.Should().Be(existingStory.Id);
        result.Title.Should().Be("Existing Story");
    }

    [Fact]
    public async Task GetOrCreateActiveStoryAsync_ShouldCreateNewStory_WhenNoActiveStory()
    {
        // Arrange
        var session = new Session { AccessCode = "ABC123", DeckType = "fibonacci", IsActive = true };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.GetOrCreateActiveStoryAsync(session.Id);

        // Assert
        result.Should().NotBeNull();
        result!.Title.Should().Be("New Story");
        result.Status.Should().Be("active");
        result.SessionId.Should().Be(session.Id);
    }

    [Fact]
    public async Task UpdateStoryTitleAsync_ShouldUpdateTitle()
    {
        // Arrange
        var story = new Story
        {
            SessionId = Guid.NewGuid(),
            Title = "Old Title",
            Status = "active"
        };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.UpdateStoryTitleAsync(story.Id, "New Title");

        // Assert
        result.Should().NotBeNull();
        result!.Title.Should().Be("New Title");

        var storyInDb = await _db.Stories.FindAsync(story.Id);
        storyInDb!.Title.Should().Be("New Title");
    }

    [Fact]
    public async Task CompleteStoryAsync_ShouldMarkStoryAsCompleted()
    {
        // Arrange
        var story = new Story
        {
            SessionId = Guid.NewGuid(),
            Title = "Test Story",
            Status = "active"
        };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.CompleteStoryAsync(story.Id, 5.0m);

        // Assert
        result.Should().NotBeNull();
        result!.Status.Should().Be("completed");
        result.FinalScore.Should().Be(5.0m);
    }

    [Fact]
    public async Task AddStoriesAsync_ShouldAddMultipleStories()
    {
        // Arrange
        var session = new Session { AccessCode = "ABC123", DeckType = "fibonacci", IsActive = true };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var storyRequests = new List<CreateStoryRequest>
        {
            new("Story 1", "https://example.com/1"),
            new("Story 2", null),
            new("Story 3", "https://example.com/3")
        };

        // Act
        var results = await _service.AddStoriesAsync(session.Id, storyRequests);

        // Assert
        results.Should().HaveCount(3);
        results[0].Title.Should().Be("Story 1");
        results[0].Url.Should().Be("https://example.com/1");
        results[1].Title.Should().Be("Story 2");
        results[2].Title.Should().Be("Story 3");

        results[0].SortOrder.Should().Be(1);
        results[1].SortOrder.Should().Be(2);
        results[2].SortOrder.Should().Be(3);

        results.All(s => s.Status == "pending").Should().BeTrue();
    }

    [Fact]
    public async Task ActivateNextStoryAsync_ShouldActivateFirstPendingStory()
    {
        // Arrange
        var session = new Session { AccessCode = "ABC123", DeckType = "fibonacci", IsActive = true };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var story1 = new Story { SessionId = session.Id, Title = "Story 1", Status = "pending", SortOrder = 1 };
        var story2 = new Story { SessionId = session.Id, Title = "Story 2", Status = "pending", SortOrder = 2 };
        _db.Stories.AddRange(story1, story2);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.ActivateNextStoryAsync(session.Id);

        // Assert
        result.Should().NotBeNull();
        result!.Id.Should().Be(story1.Id);
        result.Status.Should().Be("active");

        var story2InDb = await _db.Stories.FindAsync(story2.Id);
        story2InDb!.Status.Should().Be("pending"); // Should still be pending
    }

    [Fact]
    public async Task RestartStoryAsync_ShouldClearVotesAndResetStatus()
    {
        // Arrange
        var session = new Session { AccessCode = "ABC123", DeckType = "fibonacci", IsActive = true };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var participant = new Participant
        {
            SessionId = session.Id,
            DisplayName = "Test User",
            IsObserver = false
        };
        _db.Participants.Add(participant);

        var story = new Story
        {
            SessionId = session.Id,
            Title = "Story",
            Status = "completed",
            FinalScore = 5.0m
        };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();

        var vote = new Vote
        {
            StoryId = story.Id,
            ParticipantId = participant.Id,
            CardValue = "5"
        };
        _db.Votes.Add(vote);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.RestartStoryAsync(story.Id);

        // Assert
        result.Should().NotBeNull();
        result!.Status.Should().Be("active");
        result.FinalScore.Should().BeNull();

        var votesInDb = await _db.Votes.Where(v => v.StoryId == story.Id).ToListAsync();
        votesInDb.Should().BeEmpty();
    }

    [Fact]
    public async Task DeactivateSessionAsync_ShouldDeactivateSession_WhenUserIsOrganizer()
    {
        // Arrange
        var organizerId = Guid.NewGuid();
        var session = new Session
        {
            AccessCode = "ABC123",
            DeckType = "fibonacci",
            IsActive = true,
            OrganizerId = organizerId
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.DeactivateSessionAsync("ABC123", organizerId);

        // Assert
        result.Should().BeTrue();

        var sessionInDb = await _db.Sessions.FindAsync(session.Id);
        sessionInDb!.IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task DeactivateSessionAsync_ShouldReturnFalse_WhenUserIsNotOrganizer()
    {
        // Arrange
        var organizerId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();
        var session = new Session
        {
            AccessCode = "ABC123",
            DeckType = "fibonacci",
            IsActive = true,
            OrganizerId = organizerId
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.DeactivateSessionAsync("ABC123", otherUserId);

        // Assert
        result.Should().BeFalse();

        var sessionInDb = await _db.Sessions.FindAsync(session.Id);
        sessionInDb!.IsActive.Should().BeTrue(); // Should still be active
    }

    [Fact]
    public async Task DeactivateSessionAsync_ShouldCompleteActiveStory_WhenDeactivating()
    {
        // Arrange
        var organizerId = Guid.NewGuid();
        var session = new Session
        {
            AccessCode = "ABC123",
            DeckType = "fibonacci",
            IsActive = true,
            OrganizerId = organizerId
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var participant = new Participant
        {
            SessionId = session.Id,
            DisplayName = "User",
            IsObserver = false
        };
        _db.Participants.Add(participant);

        var story = new Story { SessionId = session.Id, Title = "Story", Status = "active" };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();

        var vote = new Vote { StoryId = story.Id, ParticipantId = participant.Id, CardValue = "8" };
        _db.Votes.Add(vote);
        await _db.SaveChangesAsync();

        // Act
        var result = await _service.DeactivateSessionAsync("ABC123", organizerId);

        // Assert
        result.Should().BeTrue();

        var storyInDb = await _db.Stories.FindAsync(story.Id);
        storyInDb!.Status.Should().Be("completed");
        storyInDb.FinalScore.Should().Be(8.0m);
    }

    [Fact]
    public async Task GetUserSessionsAsync_ShouldReturnSessionsWhereUserIsOrganizer()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var session1 = new Session
        {
            AccessCode = "ABC123",
            Name = "My Session",
            DeckType = "fibonacci",
            IsActive = true,
            OrganizerId = userId
        };
        var session2 = new Session
        {
            AccessCode = "XYZ789",
            Name = "Other Session",
            DeckType = "fibonacci",
            IsActive = true,
            OrganizerId = Guid.NewGuid()
        };
        _db.Sessions.AddRange(session1, session2);
        await _db.SaveChangesAsync();

        // Act
        var results = await _service.GetUserSessionsAsync(userId);

        // Assert
        results.Should().HaveCount(1);
        results[0].AccessCode.Should().Be("ABC123");
        results[0].IsOrganizer.Should().BeTrue();
    }

    [Fact]
    public async Task GetUserSessionsAsync_ShouldReturnSessionsWhereUserIsParticipant()
    {
        // Arrange
        var userId = Guid.NewGuid();
        var session = new Session
        {
            AccessCode = "ABC123",
            DeckType = "fibonacci",
            IsActive = true,
            OrganizerId = Guid.NewGuid()
        };
        _db.Sessions.Add(session);
        await _db.SaveChangesAsync();

        var participant = new Participant
        {
            SessionId = session.Id,
            UserId = userId,
            DisplayName = "Test User",
            IsObserver = false
        };
        _db.Participants.Add(participant);
        await _db.SaveChangesAsync();

        // Act
        var results = await _service.GetUserSessionsAsync(userId);

        // Assert
        results.Should().HaveCount(1);
        results[0].AccessCode.Should().Be("ABC123");
        results[0].IsOrganizer.Should().BeFalse();
    }

    [Fact]
    public async Task DeleteStoryAsync_ShouldRemoveStoryFromDatabase()
    {
        // Arrange
        var story = new Story
        {
            SessionId = Guid.NewGuid(),
            Title = "To Delete",
            Status = "pending"
        };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();

        var storyId = story.Id;

        // Act
        await _service.DeleteStoryAsync(storyId);

        // Assert
        var deletedStory = await _db.Stories.FindAsync(storyId);
        deletedStory.Should().BeNull();
    }
}
