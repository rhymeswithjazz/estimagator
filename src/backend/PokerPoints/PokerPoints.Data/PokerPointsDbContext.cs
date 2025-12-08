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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        ConfigureUser(modelBuilder);
        ConfigureSession(modelBuilder);
        ConfigureParticipant(modelBuilder);
        ConfigureStory(modelBuilder);
        ConfigureVote(modelBuilder);
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

            entity.HasIndex(e => e.Email).IsUnique();
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
            entity.Property(e => e.IsActive).HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasDefaultValueSql("NOW()");

            entity.HasIndex(e => e.AccessCode).IsUnique();

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
            entity.Property(e => e.JoinedAt).HasDefaultValueSql("NOW()");

            entity.HasOne(e => e.Session)
                .WithMany(s => s.Participants)
                .HasForeignKey(e => e.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
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
