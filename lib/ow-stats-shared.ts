// ---------------------------------------------------------------------------
// Overwatch statistics — the client-safe half. Serialized shapes, labels,
// formatters and the chunk hash, importable from client components (the
// PlayerStatsView charts). No server-only imports (db, cloudflare context, the
// OverFast fetchers) — those live in lib/ow-stats.ts. Follows the *-shared.ts
// convention (see CLAUDE.md).
// ---------------------------------------------------------------------------

import type { OverfastStatsSummary, OverfastSummary } from "@/lib/overfast";

export type { OwVisibility } from "@/lib/overfast";

/** How many hourly buckets the poller spreads players across (one per UTC hour). */
export const POLL_CHUNKS = 24;

/**
 * Don't append a new snapshot if the last one is younger than this — the guard
 * both writers (Commons connect/read, poller cron) respect so a member who
 * connects, opens the tab, and gets polled in the same window still gets ONE
 * row, not three. ~20 h leaves daily cadence intact.
 */
export const MIN_SNAPSHOT_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** How long a public/private visibility check is trusted before re-testing. */
export const VISIBILITY_TTL_MS = 30 * 60 * 1000;

/** Roles in display order. */
export const OW_ROLES = ["tank", "damage", "support"] as const;
export type OwRole = (typeof OW_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  tank: "Tank",
  damage: "Damage",
  support: "Support",
  open: "Open Queue",
  general: "All heroes",
};

/**
 * OW2 competitive divisions, lowest → highest. Used to turn a (division, tier)
 * pair into one monotonic score for the rank-over-time chart.
 */
export const DIVISION_ORDER = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
  "grandmaster",
  "champion",
] as const;

export type RoleRank = { division: string | null; tier: number | null };

/** One member's most-recent career snapshot, serialized for the client view. */
export type PlayerSnapshot = {
  capturedAt: number;
  battletag: string | null;
  platform: string | null;
  endorsementLevel: number | null;
  title: string | null;
  avatarUrl: string | null;
  namecardUrl: string | null;
  compSeason: number | null;
  ranks: {
    tank: RoleRank;
    damage: RoleRank;
    support: RoleRank;
    open: RoleRank;
  };
  gamesPlayed: number | null;
  gamesWon: number | null;
  gamesLost: number | null;
  timePlayed: number | null;
  winrate: number | null;
  kda: number | null;
  totalEliminations: number | null;
  totalAssists: number | null;
  totalDeaths: number | null;
  totalDamage: number | null;
  totalHealing: number | null;
};

/** One point in a metric's history. `value` is null for a gap. */
export type StatPoint = { t: number; value: number | null };

/** Everything the Player Data view renders. */
export type PlayerStatsData = {
  latest: PlayerSnapshot;
  snapshotCount: number;
  series: {
    gamesPlayed: StatPoint[];
    winrate: StatPoint[];
    kda: StatPoint[];
    timePlayed: StatPoint[];
  };
  /** Parsed `stats_json` of the latest snapshot — the per-role / per-hero table. */
  statsSummary: OverfastStatsSummary | null;
  /** Parsed `summary_json` of the latest snapshot — icons/frames for the header. */
  summary: OverfastSummary | null;
};

/** Stable 0–23 bucket for a member, so the poller spreads load across the day. */
export function chunkForUser(userId: string): number {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = (((h << 5) + h) + userId.charCodeAt(i)) | 0; // djb2
  }
  return Math.abs(h) % POLL_CHUNKS;
}

/** "123h 45m" (or "45m" under an hour). Input is seconds. */
export function formatTimePlayed(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** "51.5%" — OverFast already returns winrate as a percentage number. */
export function formatWinrate(winrate: number | null | undefined): string {
  if (winrate == null || !Number.isFinite(winrate)) return "—";
  return `${winrate.toFixed(1)}%`;
}

/** "Silver 4" — division capitalized, tier appended when present. */
export function formatRank(rank: RoleRank | null | undefined): string {
  if (!rank || !rank.division) return "Unranked";
  const division = rank.division.charAt(0).toUpperCase() + rank.division.slice(1);
  return rank.tier != null ? `${division} ${rank.tier}` : division;
}

/**
 * (division, tier) → one increasing number for the rank-trend chart. Divisions
 * are 8 bands; within a band OW tiers run 5 (lowest) → 1 (highest), so a lower
 * tier number is a better rank. Returns null for unranked so the chart skips it.
 */
export function rankToScore(rank: RoleRank | null | undefined): number | null {
  if (!rank || !rank.division) return null;
  const band = DIVISION_ORDER.indexOf(
    rank.division.toLowerCase() as (typeof DIVISION_ORDER)[number],
  );
  if (band < 0) return null;
  const tier = rank.tier != null && rank.tier >= 1 && rank.tier <= 5 ? rank.tier : 3;
  return band * 5 + (5 - tier); // higher = better
}

/** Compact large counts for stat tiles: 77,157,033 → "77.2M". */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
