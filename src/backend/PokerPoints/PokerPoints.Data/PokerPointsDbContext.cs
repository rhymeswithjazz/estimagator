using Microsoft.EntityFrameworkCore;
using PokerPoints.Data.Entities;

namespace PokerPoints.Data;

public class PokerPointsDbContext : DbContext
{
    public PokerPointsDbContext(DbContextOptions<PokerPointsDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<Participant> Participants => Set<Participant>();
    public DbSet<Story> Stories => Set<Story>();
    public DbSet<Vote> Votes => Set<Vote>();

    public DbSet<JiraAuthorization> JiraAuthorizations => Set<JiraAuthorization>();
    public DbSet<JiraSite> JiraSites => Set<JiraSite>();
    public DbSet<JiraOAuthState> JiraOAuthStates => Set<JiraOAuthState>();
    public DbSet<JiraFieldMapping> JiraFieldMappings => Set<JiraFieldMapping>();
    public DbSet<JiraStoryLink> JiraStoryLinks => Set<JiraStoryLink>();
    public DbSet<JiraPublishAttempt> JiraPublishAttempts => Set<JiraPublishAttempt>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        ConfigureUser(modelBuilder);
        ConfigureSession(modelBuilder);
        ConfigureParticipant(modelBuilder);
        ConfigureStory(modelBuilder);
        ConfigureVote(modelBuilder);
        modelBuilder.Entity<Story>().Property(s => s.AgreedEstimate).HasPrecision(4, 1);
        modelBuilder.Entity<Story>().Property(s => s.EstimateRevision).IsConcurrencyToken();
        modelBuilder.Entity<Story>().Navigation(s => s.JiraLink).AutoInclude();
        modelBuilder.Entity<JiraAuthorization>().HasKey(a => a.UserId);
        modelBuilder.Entity<JiraAuthorization>().HasOne<User>().WithMany().HasForeignKey(a => a.UserId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<JiraAuthorization>().HasMany(a => a.Sites).WithOne().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<JiraSite>().HasKey(s => new { s.UserId, s.SiteId });
        modelBuilder.Entity<JiraOAuthState>().HasKey(s => s.Id);
        modelBuilder.Entity<JiraFieldMapping>().HasKey(m => new { m.UserId, m.SiteId, m.ProjectId, m.IssueTypeId });
        modelBuilder.Entity<JiraFieldMapping>().HasOne<User>().WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<JiraStoryLink>().HasKey(l => l.StoryId);
        modelBuilder.Entity<JiraStoryLink>().HasIndex(l => new { l.SessionId, l.SiteId, l.IssueId }).IsUnique();
        modelBuilder.Entity<JiraStoryLink>().HasOne<Story>().WithOne(s => s.JiraLink).HasForeignKey<JiraStoryLink>(l => l.StoryId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<JiraPublishAttempt>().HasKey(a => a.Id);
        modelBuilder.Entity<JiraPublishAttempt>().HasIndex(a => new { a.StoryId, a.StartedAt });
    }

    private static void ConfigureUser(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.Email).HasMaxLength(255);
            entity.Property(e => e.PasswordHash).HasMaxLength(255);
            entity.Property(e => e.DisplayName).HasMaxLength(100);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("NOW()");
            entity.Property(e => e.ExternalId).HasMaxLength(255);
            entity.Property(e => e.ExternalProvider).HasMaxLength(50);
            entity.Property(e => e.RefreshToken).HasMaxLength(255);
            entity.Property(e => e.EmailVerified).HasDefaultValue(false);
            entity.Property(e => e.EmailVerificationToken).HasMaxLength(255);
            entity.Property(e => e.PasswordResetToken).HasMaxLength(255);
            entity.Property(e => e.Role)
                .HasDefaultValue(UserRole.User)
                .HasConversion<string>()
                .HasMaxLength(20);

            entity.HasIndex(e => e.Email).IsUnique();
            entity.HasIndex(e => e.RefreshToken)
                .HasFilter("\"RefreshToken\" IS NOT NULL");
            entity.HasIndex(e => e.EmailVerificationToken)
                .HasFilter("\"EmailVerificationToken\" IS NOT NULL");
            entity.HasIndex(e => e.PasswordResetToken)
                .HasFilter("\"PasswordResetToken\" IS NOT NULL");
            entity.HasIndex(e => new { e.ExternalProvider, e.ExternalId })
                .IsUnique()
                .HasFilter("\"ExternalId\" IS NOT NULL");
        });
    }

    private static void ConfigureSession(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Session>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.AccessCode).HasMaxLength(20).IsRequired();
            entity.Property(e => e.DeckType).HasMaxLength(50).HasDefaultValue("fibonacci");
            entity.Property(e => e.GuestHostTokenHash).HasMaxLength(64);
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("NOW()");

            entity.HasIndex(e => e.AccessCode).IsUnique();

            entity.HasOne<Story>()
                .WithMany()
                .HasForeignKey(e => e.CurrentStoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Organizer)
                .WithMany(u => u.Sessions)
                .HasForeignKey(e => e.OrganizerId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    private static void ConfigureParticipant(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Participant>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.DisplayName).HasMaxLength(50).IsRequired();
            entity.Property(e => e.IsObserver).HasDefaultValue(false);
            entity.Property(e => e.IsOrganizer).HasDefaultValue(false);
            entity.Property(e => e.ConnectionId).HasMaxLength(255);
            entity.Property(e => e.ReconnectTokenHash).HasMaxLength(64);
            entity.Property(e => e.JoinedAt).HasDefaultValueSql("NOW()");

            entity.HasIndex(e => e.ConnectionId)
                .HasFilter("\"ConnectionId\" IS NOT NULL");

            entity.HasOne(e => e.Session)
                .WithMany(s => s.Participants)
                .HasForeignKey(e => e.SessionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.SetNull);
        });
    }

    private static void ConfigureStory(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Story>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.Title).HasMaxLength(255).IsRequired();
            entity.Property(e => e.Status).HasMaxLength(20).HasDefaultValue("pending");
            entity.Property(e => e.FinalScore).HasPrecision(4, 1);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("NOW()");

            entity.HasOne(e => e.Session)
                .WithMany(s => s.Stories)
                .HasForeignKey(e => e.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureVote(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Vote>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
            entity.Property(e => e.CardValue).HasMaxLength(10);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("NOW()");

            entity.HasIndex(e => new { e.StoryId, e.ParticipantId }).IsUnique();

            entity.HasOne(e => e.Story)
                .WithMany(s => s.Votes)
                .HasForeignKey(e => e.StoryId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Participant)
                .WithMany(p => p.Votes)
                .HasForeignKey(e => e.ParticipantId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
