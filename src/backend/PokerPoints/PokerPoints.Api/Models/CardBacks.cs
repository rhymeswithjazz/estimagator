namespace PokerPoints.Api.Models;

public static class CardBacks
{
    public const string Default = "classic-red";

    public static readonly IReadOnlyList<string> All =
    [
        "classic-red",
        "classic-blue",
        "midnight-neon",
        "art-deco",
        "retro-sunset",
        "scout-night",
        "scout-deco",
    ];

    public static bool IsValid(string? cardBack) =>
        cardBack is not null && All.Contains(cardBack, StringComparer.Ordinal);
}
