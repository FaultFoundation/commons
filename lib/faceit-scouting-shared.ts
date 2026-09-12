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
  | "unauthorized"
  | "error"
  | "not_configured";

/** 'quick' surfaces the match list fast and fills detail lazily; 'deep'
 *  front-loads the per-match scoreboard/overview with bigger budgets. Note this
 *  is the search DEPTH — distinct from `ScoutGameMode`, the team size. */
export type ScoutMode = "quick" | "deep";
export type ScoutTarget = "player" | "team";

/**
 * The FACEIT team-size format a match was played in, which every scouting read
 * is filtered by. FACEIT reports it per match as `game_mode` and segments its
 * own map statistics the same way — which is exactly why this filter exists: a
 * 1v1 Tank Duel on Lijiang Tower says nothing about a player's 5v5 map strength,
 * and merging the two put our win rates above FACEIT's for any player with both.
 *
 * Ordered by team size, which is also how the filter pills read. FACEIT may emit
 * values beyond these; the list here is the set the tab offers, and is meant to
 * grow — adding one is this array plus nothing else, since every read validates
 * against it and the SQL filter is a plain equality on `game_mode`.
 */
export const SCOUT_GAME_MODES = ["1v1", "3v3", "5v5", "6v6"] as const;
export type ScoutGameMode = (typeof SCOUT_GAME_MODES)[number];

/** 5v5 is the competitive default — the format nearly every scouted match is in. */
export const DEFAULT_GAME_MODE: ScoutGameMode = "5v5";

/** Validate an untrusted mode (a query string, a stored view-state value). */
export function asScoutGameMode(value: unknown): ScoutGameMode | undefined {
  return typeof value === "string" &&
    (SCOUT_GAME_MODES as readonly string[]).includes(value)
    ? (value as ScoutGameMode)
    : undefined;
}

export const SCOUT_STATUS_MESSAGES: Record<
  Exclude<ScoutStatus, "ready" | "idle"> | "no_matches",
  string
> = {
  collecting:
    "Collecting this player's match history — maps and scoreboards keep filling in. Refresh in a moment for more.",
  no_matches:
    "No matches in this format for this player. Their history is collected — try another format above.",
  not_found:
    "No FACEIT Overwatch player found with that name. Check the exact FACEIT nickname (not their BattleTag) and try again.",
  unauthorized:
    "Your sign-in could not be verified. Sign in again to continue scouting; collected matches are saved.",
  error:
    "The scouting request was interrupted. Collected matches are saved — try the search again to continue.",
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
  /** 'quick' | 'deep' | null — how this player was last searched. Drives the
   *  display-readiness rule (quick is "ready" once the recent window is detailed;
   *  deep only once the whole history is). */
  searchMode: string | null;
};

/** 'win' | 'loss' | 'draw' from the scouted player's perspective. */
export type ScoutResult = "win" | "loss" | "draw";

/** One match, from the scouted player's point of view — the row the list draws
 *  and the unit the derivations aggregate over. */
export type ScoutMatch = {
  matchId: string;
  competitionName: string | null;
  competitionType: string | null;
  /** The FIRST map of the series only — kept for rows collected before per-map
   *  rounds existed. Prefer `maps`, which is every map actually played. */
  mapName: string | null;
  mapMode: string | null;
  /** Every map of the series, in play order (empty until rounds are collected). */
  maps: string[];
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
 *  fraction (0..1) so a component can drive a bar width directly.
 *
 *  The unit is a MAP, not a match: an Overwatch FACEIT match is a Bo3/Bo5
 *  series, so one match contributes one row here per map it played. */
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

/** A win/loss record over some unit of play. */
export type ScoutRecord = {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** wins / decided (0..1), or null when nothing is decided. */
  winrate: number | null;
};

/**
 * A scouted player's headline numbers, in BOTH units — because FACEIT's own
 * profile and our match list count different things and it is confusing to see
 * two "records" that disagree with no label saying why.
 *
 * - the top-level fields are SERIES: one per FACEIT match (a Bo3/Bo5).
 * - `maps` is per MAP played inside those series. This is what
 *   faceit.com/players/<name>/ow shows as "Matches" and "Win rate %".
 */
export type ScoutSummary = ScoutRecord & {
  maps: ScoutRecord;
  /** How many of `total` have had their per-map rounds collected — the
   *  readiness counter behind "N of M matches" while a search is filling in. */
  matchesWithMaps: number;
};

export type ScoutData = {
  summary: ScoutSummary;
  mapWinrates: MapWinrate[];
  matches: ScoutMatch[];
  /** The team-size format everything above was filtered to. Echoed back so a
   *  client can tell a stale payload from a fresh one after the filter moves. */
  gameMode: ScoutGameMode;
};

export type ScoutTeamMember = { player: ScoutPlayer; data: ScoutData | null; status: ScoutStatus };

export type ScoutResponse = {
  target?: ScoutTarget;
  team?: { teamId: string; members: ScoutTeamMember[] };
  status: ScoutStatus;
  player: ScoutPlayer | null;
  data: ScoutData | null;
  /** Collection progress, for the Deep search's loading bar. `total` is every
   *  match known for the player; `detailed` is how many carry a synced
   *  scoreboard. Both count the WHOLE history, never the selected format — the
   *  bar tracks the backfill, not the view. Present on deep-advance reads. */
  progress?: { total: number; detailed: number };
  /** Human-readable detail for a non-ready status (else undefined). */
  message?: string;
};

// --- Match detail (the expandable match dropdown) ---------------------------
// Fetched on demand (GET /api/scouting/match) when a match row expands, so the
// heavy per-participant scoreboard isn't carried in the main list payload. Every
// participant's scoreboard is already collected during the DETAIL phase, so this
// is a pure read of rows the ow-data Worker wrote.

/** One player's stats for a single FACEIT round (a control-map point, or the
 *  lone round of a Bo1). `raw` keeps the untouched stat map for extra columns. */
export type ScoutRoundStats = {
  /** 1-based round index, or null for the match-level aggregate. */
  round: number | null;
  eliminations: number | null;
  deaths: number | null;
  assists: number | null;
  kdRatio: number | null;
  damageDealt: number | null;
  healingDone: number | null;
  damageMitigated: number | null;
  raw: Record<string, string>;
};

/** One row in a match scoreboard — a participant, with the aggregate scalars and
 *  the per-round breakdown. */
export type ScoutScoreboardPlayer = {
  playerId: string;
  nickname: string | null;
  faction: string | null;
  result: ScoutResult | null;
  role: string | null;
  /** Whether this is the scouted player (highlighted in the scoreboard). */
  isScouted: boolean;
  eliminations: number | null;
  deaths: number | null;
  assists: number | null;
  kdRatio: number | null;
  damageDealt: number | null;
  healingDone: number | null;
  damageMitigated: number | null;
  finalBlows: number | null;
  soloKills: number | null;
  rounds: ScoutRoundStats[];
};

/** One team (faction) block in a match scoreboard. */
export type ScoutScoreboardTeam = {
  faction: string;
  name: string | null;
  score: number | null;
  result: ScoutResult | null;
  players: ScoutScoreboardPlayer[];
};

export type ScoutVoting = {
  teams: Record<string, { id?: string; name?: string }>;
  games: Array<{
    game: number; mapId: string; mapName: string; pickedBy: string | null;
    heroBans: Array<{ id: string; name: string; by: string | null; random: boolean }>;
    mapBans: Array<{ id: string; name: string; by: string | null; random: boolean }>;
  }>;
};

/** The fully-expanded detail for one match: overview + both teams' scoreboards. */
export type ScoutMatchDetail = {
  matchId: string;
  competitionName: string | null;
  competitionType: string | null;
  serverName: string | null;
  mapName: string | null;
  mapMode: string | null;
  round: number | null;
  groupNum: number | null;
  bestOf: number | null;
  status: string;
  startedAt: number | null;
  faceitUrl: string | null;
  replayCodes: string[];
  heroBans: string[];
  voting?: ScoutVoting | null;
  teams: ScoutScoreboardTeam[];
  /** Max number of rounds across participants (>1 → per-round tabs). */
  roundCount: number;
  /** The map played in each round, so a series' round tabs read "Ilios" rather
   *  than "Round 1". Indexed by `round` (1-based); may be shorter than
   *  `roundCount` for matches collected before rounds existed. */
  rounds: ScoutMapRound[];
  /** True once the scoreboard has been synced; false → nothing to show yet. */
  detailed: boolean;
};

/** One map of a series, as stored per round. */
export type ScoutMapRound = {
  round: number;
  mapName: string | null;
  mapMode: string | null;
  /** "2 / 1" — the map's own scoreline, as FACEIT words it. */
  scoreSummary: string | null;
  /** The scouted player's outcome on this map, when a winner is known. */
  result: ScoutResult | null;
};

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

/** A K/D ratio to two places; dash when null. */
export function formatKd(kd: number | null): string {
  return kd == null ? "—" : kd.toFixed(2);
}

/** A large scalar compactly ("10.8k"); dash when null. */
export function formatCompact(n: number | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

// --- Analytics derivations (the Overview graph dropdowns) --------------------
// All pure, computed from the windowed ScoutMatch[] the reader returns (newest
// first). Only matches carrying the relevant scoreboard scalar are counted, so a
// still-collecting quick search simply shows a smaller window. These are exactly
// the analytics deferred at MVP — the data is already on each ScoutMatch.

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n−1); null for fewer than 2 points. */
export function stddev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** Least-squares slope/intercept of y over its own index (0..n−1). */
export function linearRegression(
  ys: number[],
): { slope: number; intercept: number } | null {
  const n = ys.length;
  if (n < 2) return null;
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xm) * (ys[i] - ym);
    den += (i - xm) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: ym - slope * xm };
}

export type KdPoint = { at: number | null; kd: number };
export type KdOverTime = {
  /** Oldest → newest (left-to-right in time), the plotted window. */
  points: KdPoint[];
  avg: number | null;
  trend: { slope: number; intercept: number } | null;
  window: number;
};

/** K/D over the newest `window` decided-enough matches, plotted oldest→newest. */
export function computeKdOverTime(matches: ScoutMatch[], window = 20): KdOverTime {
  const withKd = matches.filter(
    (m): m is ScoutMatch & { kdRatio: number } => m.kdRatio != null,
  );
  const recent = withKd.slice(0, window).reverse();
  const points: KdPoint[] = recent.map((m) => ({ at: m.startedAt, kd: m.kdRatio }));
  const kds = points.map((p) => p.kd);
  return { points, avg: mean(kds), trend: linearRegression(kds), window: points.length };
}

export type WinLossStrip = {
  /** Newest-first, capped. */
  results: ScoutResult[];
  /** Consecutive same result from the most recent match. */
  streak: { type: ScoutResult; count: number } | null;
};

export function computeWinLossStrip(matches: ScoutMatch[], cap = 24): WinLossStrip {
  const decided = matches
    .map((m) => m.result)
    .filter((r): r is ScoutResult => r != null);
  let streak: WinLossStrip["streak"] = null;
  if (decided.length) {
    const type = decided[0];
    let count = 0;
    for (const r of decided) {
      if (r === type) count++;
      else break;
    }
    streak = { type, count };
  }
  return { results: decided.slice(0, cap), streak };
}

export type DamageHealingPoint = { at: number | null; damage: number; healing: number };
export type DamageHealing = {
  /** Oldest → newest, the plotted window. */
  points: DamageHealingPoint[];
  avgDamage: number | null;
  avgHealing: number | null;
  detailedCount: number;
};

export function computeDamageHealing(
  matches: ScoutMatch[],
  window = 20,
): DamageHealing {
  const detailed = matches.filter(
    (m) => m.damageDealt != null || m.healingDone != null,
  );
  const recent = detailed.slice(0, window).reverse();
  return {
    points: recent.map((m) => ({
      at: m.startedAt,
      damage: m.damageDealt ?? 0,
      healing: m.healingDone ?? 0,
    })),
    avgDamage: mean(
      detailed.map((m) => m.damageDealt).filter((n): n is number => n != null),
    ),
    avgHealing: mean(
      detailed.map((m) => m.healingDone).filter((n): n is number => n != null),
    ),
    detailedCount: detailed.length,
  };
}

export type AnomalyMetric = "kd" | "damage" | "healing";
export type Anomaly = {
  matchId: string;
  at: number | null;
  mapName: string | null;
  metric: AnomalyMetric;
  value: number;
  /** Signed z-score against that metric's mean. */
  z: number;
};
export type PerformanceAnomalies = { flagged: Anomaly[]; sampleSize: number };

const ANOMALY_METRICS: {
  key: AnomalyMetric;
  pick: (m: ScoutMatch) => number | null;
}[] = [
  { key: "kd", pick: (m) => m.kdRatio },
  { key: "damage", pick: (m) => m.damageDealt },
  { key: "healing", pick: (m) => m.healingDone },
];

/** Matches whose K/D, damage or healing sits ≥ `threshold` SD from the player's
 *  own mean — outlier games, most extreme first. */
export function computePerformanceAnomalies(
  matches: ScoutMatch[],
  threshold = 2,
): PerformanceAnomalies {
  const flagged: Anomaly[] = [];
  let sampleSize = 0;
  for (const { key, pick } of ANOMALY_METRICS) {
    const rows = matches
      .map((m) => ({ m, v: pick(m) }))
      .filter((r): r is { m: ScoutMatch; v: number } => r.v != null);
    sampleSize = Math.max(sampleSize, rows.length);
    const mu = mean(rows.map((r) => r.v));
    const sd = stddev(rows.map((r) => r.v));
    if (mu == null || sd == null || sd === 0) continue;
    for (const { m, v } of rows) {
      const z = (v - mu) / sd;
      if (Math.abs(z) >= threshold) {
        flagged.push({
          matchId: m.matchId,
          at: m.startedAt,
          mapName: m.mapName,
          metric: key,
          value: v,
          z,
        });
      }
    }
  }
  flagged.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return { flagged, sampleSize };
}

export type ConsistencyStat = {
  key: string;
  stat: string;
  mean: number | null;
  stddev: number | null;
  /** Coefficient of variation (stddev / |mean|); lower is steadier. */
  cv: number | null;
};

const CONSISTENCY_STATS: {
  key: string;
  label: string;
  pick: (m: ScoutMatch) => number | null;
}[] = [
  { key: "kd", label: "K/D", pick: (m) => m.kdRatio },
  { key: "damage", label: "Damage", pick: (m) => m.damageDealt },
  { key: "healing", label: "Healing", pick: (m) => m.healingDone },
  { key: "mitigation", label: "Mitigation", pick: (m) => m.damageMitigated },
];

export function computeConsistency(matches: ScoutMatch[]): ConsistencyStat[] {
  return CONSISTENCY_STATS.map(({ key, label, pick }) => {
    const vals = matches.map(pick).filter((n): n is number => n != null);
    const mu = mean(vals);
    const sd = stddev(vals);
    const cv = mu != null && sd != null && mu !== 0 ? sd / Math.abs(mu) : null;
    return { key, stat: label, mean: mu, stddev: sd, cv };
  }).filter((s) => s.cv != null);
}

/** Each roster member has equal weight; unknown/undecided rates are omitted. */
export function teamMapWinrates(members: ScoutTeamMember[]) {
  const maps = new Map<string, MapWinrate & { players: { member: ScoutTeamMember; rate: number; total: number }[] }>();
  for (const member of members) for (const row of member.data?.mapWinrates ?? []) {
    const entry = maps.get(row.map) ?? { ...row, wins: 0, losses: 0, draws: 0, total: 0, players: [] };
    entry.wins += row.wins; entry.losses += row.losses; entry.draws += row.draws; entry.total += row.total;
    if (row.winrate != null) entry.players.push({ member, rate: row.winrate, total: row.total });
    maps.set(row.map, entry);
  }
  return [...maps.values()].map(row => ({ ...row, winrate: mean(row.players.map(p => p.rate)),
    low: row.players.length ? Math.min(...row.players.map(p => p.rate)) : null,
    high: row.players.length ? Math.max(...row.players.map(p => p.rate)) : null }));
}
