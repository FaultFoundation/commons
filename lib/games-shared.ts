// ---------------------------------------------------------------------------
// Games — the client-safe half. The option shape server pages hand to the
// create/settings forms, plus the banner gradient a game tints its cards with.
// No server-only imports (db, cloudflare context) — follows the *-shared.ts
// convention (see CLAUDE.md). The server reader is lib/games.ts.
// ---------------------------------------------------------------------------

/** One selectable game, as passed to the team create/settings dropdowns. */
export type GameOption = {
  id: string;
  name: string;
  /** Real art path (games.logoUrl) or null for the GameLogo monogram fallback. */
  logoUrl: string | null;
};

/**
 * Per-game banner gradients, keyed by game id. A team's card and hero banner
 * paints its game's gradient, so the Teams tab carries the same colour the
 * tournament menu does instead of a flat card. An unlisted game (or none) falls
 * back to the house brand gradient, so a new game is never a broken banner.
 */
const GAME_GRADIENTS: Record<string, string> = {
  overwatch: "linear-gradient(120deg, #b34700 0%, #f27a1a 100%)",
  valorant: "linear-gradient(120deg, #7a1f28 0%, #fa4454 100%)",
  cs2: "linear-gradient(120deg, #6b4b00 0%, #f0a500 100%)",
  "league-of-legends": "linear-gradient(120deg, #0a3a54 0%, #0ac8b9 100%)",
  "rocket-league": "linear-gradient(120deg, #0a2a54 0%, #1f8fff 100%)",
};

/** The CSS background for a game's banner — its own gradient, or the brand one. */
export function gameGradient(gameId: string | null | undefined): string {
  if (gameId && GAME_GRADIENTS[gameId]) return GAME_GRADIENTS[gameId];
  return "var(--ff-grad-brand)";
}
