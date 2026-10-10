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
        _service = new SessionService(_db, new NullTimerService());
    }

    private sealed class NullTimerService : ITimerService
    {
        public void StartTimer(string accessCode, int durationSeconds) { }
        public void ExtendTimer(string accessCode, int additionalSeconds) { }
        public void StopTimer(string accessCode) { }
        public Models.TimerStateDto? GetTimerState(string accessCode) => null;
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
        result.GuestHostToken.Should().BeNull();

        var sessionInDb = await _db.Sessions.FirstOrDefaultAsync(s => s.AccessCode == result.AccessCode);
        sessionInDb.Should().NotBeNull();
        sessionInDb!.DeckType.Should().Be(deckType);
        sessionInDb.IsActive.Should().BeTrue();
        sessionInDb.OrganizerId.Should().Be(organizerId);
        sessionInDb.GuestHostTokenHash.Should().BeNull();
    }

    [Fact]
    public async Task CreateSessionAsync_ShouldReturnGuestHostTokenAndStoreOnlyHash_WhenOrganizerIsNull()
    {
        var result = await _service.CreateSessionAsync("fibonacci", "Guest Game");

        result.GuestHostToken.Should().NotBeNullOrWhiteSpace();

        var sessionInDb = await _db.Sessions.FirstAsync(s => s.AccessCode == result.AccessCode);
        sessionInDb.OrganizerId.Should().BeNull();
        sessionInDb.GuestHostTokenHash.Should().NotBeNullOrWhiteSpace();
        sessionInDb.GuestHostTokenHash.Should().NotBe(result.GuestHostToken);
        GuestHostToken.Verify(result.GuestHostToken!, sessionInDb.GuestHostTokenHash!).Should().BeTrue();
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
        var result = await _service.UpdateStoryTitleAsync(story.SessionId, story.Id, "New Title");

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
        var result = await _service.CompleteStoryAsync(story.SessionId, story.Id, 5.0m);

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
        var result = await _service.RestartStoryAsync(story.SessionId, story.Id);

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
        await _service.DeleteStoryAsync(story.SessionId, storyId);

        // Assert
        var deletedStory = await _db.Stories.FindAsync(storyId);
        deletedStory.Should().BeNull();
    }
    [Fact]
    public async Task MutationsWithForeignSession_DoNotChangeStoryOrVotes()
    {
        var story = new Story { SessionId = Guid.NewGuid(), Title = "Original", Status = "completed", AgreedEstimate = 5, EstimateRevision = 1 };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();
        var foreignSession = Guid.NewGuid();
        (await _service.UpdateStoryAsync(foreignSession, story.Id, "Changed", null)).Should().BeNull();
        (await _service.UpdateStoryTitleAsync(foreignSession, story.Id, "Changed")).Should().BeNull();
        (await _service.ActivateStoryAsync(foreignSession, story.Id)).Should().BeNull();
        (await _service.RestartStoryAsync(foreignSession, story.Id)).Should().BeNull();
        (await _service.CompleteStoryAsync(foreignSession, story.Id, 8)).Should().BeNull();
        await _service.DeleteStoryAsync(foreignSession, story.Id);
        story.Title.Should().Be("Original");
        story.Status.Should().Be("completed");
        story.AgreedEstimate.Should().Be(5);
        (await _db.Stories.FindAsync(story.Id)).Should().NotBeNull();
    }

    [Fact]
    public async Task RestartClearsAgreementButPreservesPublishHistory()
    {
        var session = new Session { AccessCode = "ABC123" };
        _db.Sessions.Add(session);
        var story = new Story { Id = Guid.NewGuid(), Session = session, Title = "Story", Status = "completed", AgreedEstimate = 5, EstimateRevision = 1 };
        story.JiraLink = new() { StoryId = story.Id, SessionId = story.SessionId, SiteId = "site", IssueId = "100", PublishedValue = 5, PublishedRevision = 1, PublishStatus = "published" };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();
        await _service.RestartStoryAsync(story.SessionId, story.Id);
        story.AgreedEstimate.Should().BeNull();
        story.EstimateRevision.Should().Be(2);
        story.JiraLink.PublishedValue.Should().Be(5);
    }

    [Theory]
    [InlineData("active", false)]
    [InlineData("active", true)]
    [InlineData("pending", false)]
    [InlineData("pending", true)]
    [InlineData("completed", false)]
    [InlineData("completed", true)]
    [InlineData("unknown", false)]
    public async Task GetSessionHistoryAsync_ShouldOnlyDiscloseCompletedVotes(string status, bool isOrganizer)
    {
        var userId = Guid.NewGuid();
        var session = new Session
        {
            AccessCode = "ABC123",
            OrganizerId = isOrganizer ? userId : Guid.NewGuid()
        };
        var participant = new Participant
        {
            Session = session,
            UserId = isOrganizer ? null : userId,
            DisplayName = "Voter"
        };
        var story = new Story
        {
            Session = session,
            Title = "Estimate this story",
            Url = "https://example.com/story",
            Status = status,
            FinalScore = status == "completed" ? 5 : null,
            AgreedEstimate = status == "completed" ? 8 : null,
            EstimateRevision = 2
        };
        _db.Votes.Add(new Vote { Story = story, Participant = participant, CardValue = "5" });
        await _db.SaveChangesAsync();

        var history = await _service.GetSessionHistoryAsync("abc123", userId);

        history.Should().NotBeNull();
        var result = history!.Stories.Should().ContainSingle().Subject;
        result.Id.Should().Be(story.Id);
        result.Title.Should().Be(story.Title);
        result.Url.Should().Be(story.Url);
        result.Status.Should().Be(status);
        result.FinalScore.Should().Be(story.FinalScore);
        result.AgreedEstimate.Should().Be(story.AgreedEstimate);
        result.EstimateRevision.Should().Be(2);
        if (status == "completed")
        {
            result.Votes.Should().Equal(new VoteDto(participant.Id, "Voter", "5"));
        }
        else
        {
            result.Votes.Should().BeEmpty();
        }

        // Redaction must not discard the actual vote needed for a later reveal.
        (await _db.Votes.SingleAsync()).CardValue.Should().Be("5");
    }

}
