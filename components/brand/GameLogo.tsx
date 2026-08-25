// The game mark shown bottom-right on a tournament tile. Prefers real art from
// the game's `logoUrl` (games.logoUrl in D1 — set it to a path like
// "/brand/games/overwatch.svg" or an absolute URL); with none it falls back to a
// monogram chip built from the game's name, so an unknown game never renders a
// broken image. Drop-in convention for official art is documented in
// db/README.md (public/brand/games/<slug>.svg + set games.logoUrl).

/** First-letters monogram: "Overwatch" -> "OV", "Rocket League" -> "RL". */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

export function GameLogo({
  name,
  logoUrl,
}: {
  name: string | null | undefined;
  logoUrl?: string | null;
}) {
  const label = name?.trim() || "Game";
  if (logoUrl) {
    return (
      <span className="ff-tcard__game" title={label}>
        {/* Plain <img> to match the rest of the markup (next.config sets
            images.unoptimized). */}
        <img
          className="ff-tcard__game-img"
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }
  return (
    <span
      className="ff-tcard__game ff-tcard__game--mono"
      title={label}
      aria-label={label}
    >
      {monogram(label)}
    </span>
  );
}
