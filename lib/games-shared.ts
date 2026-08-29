// ---------------------------------------------------------------------------
// Games — the client-safe half. The option shape server pages hand to the
// create/settings forms. No server-only imports (db, cloudflare context) —
// follows the *-shared.ts convention (see CLAUDE.md). The server reader is
// lib/games.ts. (Team accent colour is member-chosen, not game-derived — see
// lib/teams-shared.ts.)
// ---------------------------------------------------------------------------

/** One selectable game, as passed to the team create/settings dropdowns. */
export type GameOption = {
  id: string;
  name: string;
  /** Real art path (games.logoUrl) or null for the GameLogo monogram fallback. */
  logoUrl: string | null;
};
