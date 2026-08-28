// The game mark shown bottom-right on a tournament tile. Prefers real art from
// the game's `logoUrl` (games.logoUrl in D1 — set it to a path like
// "/brand/games/overwatch.svg" or an absolute URL). Internal tournaments carry
// that D1 value; external ones (scraped into cen-sql from start.gg/FACEIT)
// have no `games` row to read it from at all, so KNOWN_GAME_LOGOS below
// matches their free-text game name against the same public/brand/games/
// files as a fallback. With neither, it falls back to a monogram chip built
// from the game's name, so an unknown game never renders a broken image.
// Drop-in convention for official art is documented in db/README.md.

/** Local art for games we ship an icon for, keyed by normalized name (so
    "CS2", "CS:GO", "Counter-Strike 2" etc. all resolve to the same file,
    since FACEIT and start.gg don't always tag the same game the same way) —
    the fallback used when there's no D1 `logoUrl`, which is always the case
    for external (start.gg/FACEIT) tournaments. */
const KNOWN_GAME_LOGOS: Record<string, string> = {
  overwatch: "/brand/games/overwatch.svg",
  overwatch2: "/brand/games/overwatch.svg",
  cs2: "/brand/games/cs2.svg",
  counterstrike2: "/brand/games/cs2.svg",
  csgo: "/brand/games/cs2.svg",
  counterstrikeglobaloffensive: "/brand/games/cs2.svg",
  counterstrike: "/brand/games/cs2.svg",
  valorant: "/brand/games/valorant.svg",
  leagueoflegends: "/brand/games/league-of-legends.svg",
  lol: "/brand/games/league-of-legends.svg",
  rocketleague: "/brand/games/rocket-league.svg",
};

function normalizeGameName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveLogoUrl(
  name: string | null | undefined,
  logoUrl: string | null | undefined,
): string | null {
  if (logoUrl) return logoUrl;
  if (!name) return null;
  return KNOWN_GAME_LOGOS[normalizeGameName(name)] ?? null;
}

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
  const resolved = resolveLogoUrl(name, logoUrl);
  if (resolved) {
    return (
      <span className="ff-tcard__game" title={label}>
        {/* Plain <img> to match the rest of the markup (next.config sets
            images.unoptimized). */}
        <img
          className="ff-tcard__game-img"
          src={resolved}
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
