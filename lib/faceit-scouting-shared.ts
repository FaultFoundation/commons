// Client-safe half of the FACEIT Scouting tab (the `*-shared.ts` convention):
// types, pure derivations and formatters that both the server reader
// (lib/faceit-scouting.ts) and the client view import. No server-only imports —
// no D1, no cloudflare context — so a "use client" component can pull from here.
//
// Scouting looks up ANY FACEIT Overwatch player by nickname (opponents, not the
// linked member), reading the search-driven `faceit_*` cache the ow-data Worker
// fills. The headline view is win rate by map; the derivations below are what
// turn the raw scoreboard rows into that.

/** The lifecycle of a scouting lookup, surfaced to the searcher.
 *  - idle: nothing searched yet (fresh tab).
 *  - collecting: the Worker is still paging history / filling per-match detail.
 *  - ready: list + detail collected.
 *  - not_found: FACEIT has no such player (a definitive answer).
 *  - error: a transient provider/Worker failure.
 *  - not_configured: the OW binding or the search Worker isn't wired up. */
export type ScoutStatus =
  | "idle"
  | "collecting"
  | "ready"
  | "not_found"
  | "error"
  | "not_configured";

/** 'quick' surfaces the match list fast and fills detail lazily; 'deep'
 *  front-loads the per-match scoreboard/overview with bigger budgets. */
export type ScoutMode = "quick" | "deep";

export const SCOUT_STATUS_MESSAGES: Record<
  Exclude<ScoutStatus, "ready" | "idle">,
  string
> = {
  collecting:
    "Collecting this player's match history — maps and scoreboards keep filling in. Refresh in a moment for more.",
  not_found:
    "No FACEIT Overwatch player found with that name. Check the exact FACEIT nickname (not their BattleTag) and try again.",
  error:
    "We couldn't reach FACEIT just now. This is usually temporary — try again in a moment.",
  not_configured:
    "Scouting isn't configured on this environment yet (the FACEIT search service is unavailable).",
};

export type ScoutPlayer = {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
  country: string | null;
  skillLevel: number | null;
  faceitElo: number | null;
  region: string | null;
  faceitUrl: string | null;
  gamePlayerName: string | null;
  /** Matches known to the cache (may exceed the number returned for display). */
  matchCount: number;
  listDone: boolean;
  detailDone: boolean;
};

/** 'win' | 'loss' | 'draw' from the scouted player's perspective. */
export type ScoutResult = "win" | "loss" | "draw";

/** One match, from the scouted player's point of view — the row the list draws
 *  and the unit the derivations aggregate over. */
export type ScoutMatch = {
  matchId: string;
  competitionName: string | null;
  competitionType: string | null;
  mapName: string | null;
  mapMode: string | null;
  serverName: string | null;
  bestOf: number | null;
  startedAt: number | null;
  status: string;
  faceitUrl: string | null;
  result: ScoutResult | null;
  scoreFor: number | null;
  scoreAgainst: number | null;
  opponentName: string | null;
  // The scouted player's own scoreboard line (null until DETAIL/stats sync).
  role: string | null;
  eliminations: number | null;
  deaths: number | null;
  assists: number | null;
  kdRatio: number | null;
  damageDealt: number | null;
  healingDone: number | null;
  damageMitigated: number | null;
};

/** Win rate on a single map — one bar in the headline chart. `winrate` is a
 *  fraction (0..1) so a component can drive a bar width directly. */
export type MapWinrate = {
  map: string;
  mapMode: string | null;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  /** wins / decided (wins + losses); null when nothing is decided yet. */
  winrate: number | null;
};

export type ScoutSummary = {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** wins / decided (0..1), or null when nothing is decided. */
  winrate: number | null;
  /** How many of `total` carry a synced scoreboard (per-map/detail readiness). */
  withMap: number;
};

export type ScoutData = {
  summary: ScoutSummary;
  mapWinrates: MapWinrate[];
  matches: ScoutMatch[];
};

export type ScoutResponse = {
  status: ScoutStatus;
  player: ScoutPlayer | null;
  data: ScoutData | null;
  /** Human-readable detail for a non-ready status (else undefined). */
  message?: string;
};

// --- Pure derivations -------------------------------------------------------

/** Win rate per map, most-played first (ties broken by win rate). Only matches
 *  whose overview has landed (a known `mapName`) count — the rest are still
 *  collecting. Draws are shown but excluded from the win-rate denominator. */
export function computeMapWinrates(matches: ScoutMatch[]): MapWinrate[] {
  const byMap = new Map<string, MapWinrate>();
  for (const m of matches) {
    if (!m.mapName) continue;
    const key = m.mapName;
    let row = byMap.get(key);
    if (!row) {
      row = {
        map: key,
        mapMode: m.mapMode,
        wins: 0,
        losses: 0,
        draws: 0,
        total: 0,
        winrate: null,
      };
      byMap.set(key, row);
    }
    row.total += 1;
    if (m.result === "win") row.wins += 1;
    else if (m.result === "loss") row.losses += 1;
    else if (m.result === "draw") row.draws += 1;
  }
  const rows = [...byMap.values()];
  for (const row of rows) {
    const decided = row.wins + row.losses;
    row.winrate = decided > 0 ? row.wins / decided : null;
  }
  return rows.sort(
    (a, b) => b.total - a.total || (b.winrate ?? -1) - (a.winrate ?? -1),
  );
}

/** Overall record across all returned matches (with a `withMap` readiness count). */
export function computeSummary(matches: ScoutMatch[]): ScoutSummary {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let withMap = 0;
  for (const m of matches) {
    if (m.result === "win") wins += 1;
    else if (m.result === "loss") losses += 1;
    else if (m.result === "draw") draws += 1;
    if (m.mapName) withMap += 1;
  }
  const decided = wins + losses;
  return {
    total: matches.length,
    wins,
    losses,
    draws,
    winrate: decided > 0 ? wins / decided : null,
    withMap,
  };
}

// --- Formatters -------------------------------------------------------------

/** A 0..1 fraction as a whole-number percent ("58%"); dash when null. */
export function formatWinratePct(winrate: number | null): string {
  if (winrate == null) return "—";
  return `${Math.round(winrate * 100)}%`;
}

/** "W–L" (draws appended only when present): "107–77" / "12–3–1". */
export function formatRecord(row: {
  wins: number;
  losses: number;
  draws?: number;
}): string {
  const base = `${row.wins}–${row.losses}`;
  return row.draws ? `${base}–${row.draws}` : base;
}

export function formatElo(elo: number | null): string {
  return elo == null ? "—" : elo.toLocaleString();
}

/** Trim and cap the raw search box value; empty → null. FACEIT resolves the
 *  exact identity, so we only guard length and whitespace here. */
export function normalizeNickname(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}
