import { asc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { owPlayers, owSnapshots } from "@/db/ow-schema";
import { getOwDb } from "@/lib/ow-db";
import {
  DEFAULT_OVERFAST_BASE,
  battletagToPlayerId,
  checkOwVisibility,
  fetchOwStatsSummary,
  fetchOwSummary,
  type OverfastRank,
  type OverfastStatsSummary,
  type OverfastSummary,
  type OwVisibility,
} from "@/lib/overfast";
import {
  MIN_SNAPSHOT_INTERVAL_MS,
  VISIBILITY_TTL_MS,
  chunkForUser,
  type PlayerSnapshot,
  type PlayerStatsData,
  type RoleRank,
} from "@/lib/ow-stats-shared";

// ---------------------------------------------------------------------------
// Overwatch statistics — the server-only Commons half. Reads/writes the third
// D1 (ow-player-data) through getOwDb(), degrading to empty/no-op when the OW
// binding is absent. Best-effort throughout, in the spirit of lib/schedule.ts:
// a provider miss or a missing binding must never fail a Statistics render or
// the Battle.net connect flow.
//
// The Commons is one of two writers here (the other is the ow-stats-poller
// Worker's hourly cron). Both append snapshots and respect the same
// MIN_SNAPSHOT_INTERVAL_MS guard, so a connect + a page open + a cron tick in
// the same window still produce ONE row. See db/ow-schema.ts for the model.
// ---------------------------------------------------------------------------

function overfastBase(): string {
  const { env } = getCloudflareContext();
  return env.OVERFAST_API_URL || DEFAULT_OVERFAST_BASE;
}

/** Coerce anything OverFast hands us into a finite number, or null. */
function num(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Round a metric to an int for an integer column (elims, damage, …). */
function intOrNull(x: unknown): number | null {
  const n = num(x);
  return n == null ? null : Math.round(n);
}

function extractRank(rank: OverfastRank | null | undefined): RoleRank {
  return {
    division: rank?.division ?? null,
    tier: num(rank?.tier),
  };
}

/**
 * Which career platform to read. OverFast splits competitive by pc/console;
 * prefer pc (collegiate OW is PC-first) and fall back to console only when pc
 * is absent.
 */
function pickPlatform(summary: OverfastSummary | null): "pc" | "console" {
  return summary?.competitive?.pc ? "pc" : summary?.competitive?.console ? "console" : "pc";
}

/** Flatten a summary + stats/summary pair into the snapshot column values. */
function extractSnapshotColumns(
  summary: OverfastSummary | null,
  stats: OverfastStatsSummary | null,
) {
  const platform = pickPlatform(summary);
  const comp = summary?.competitive?.[platform] ?? null;
  const general = stats?.general ?? null;
  const total = general?.total ?? {};
  const average = general?.average ?? {};

  return {
    platform,
    endorsementLevel: num(summary?.endorsement?.level),
    title: summary?.title ?? null,
    avatarUrl: summary?.avatar ?? null,
    namecardUrl: summary?.namecard ?? null,
    compSeason: num(comp?.season),
    tankDivision: comp?.tank?.division ?? null,
    tankTier: num(comp?.tank?.tier),
    damageDivision: comp?.damage?.division ?? null,
    damageTier: num(comp?.damage?.tier),
    supportDivision: comp?.support?.division ?? null,
    supportTier: num(comp?.support?.tier),
    openDivision: comp?.open?.division ?? null,
    openTier: num(comp?.open?.tier),
    gamesPlayed: intOrNull(general?.games_played),
    gamesWon: intOrNull(general?.games_won),
    gamesLost: intOrNull(general?.games_lost),
    timePlayed: intOrNull(general?.time_played),
    winrate: num(general?.winrate),
    kda: num(general?.kda),
    totalEliminations: intOrNull(total?.eliminations),
    totalAssists: intOrNull(total?.assists),
    totalDeaths: intOrNull(total?.deaths),
    totalDamage: intOrNull(total?.damage),
    totalHealing: intOrNull(total?.healing),
    avgEliminations: num(average?.eliminations),
    avgAssists: num(average?.assists),
    avgDeaths: num(average?.deaths),
    avgDamage: num(average?.damage),
    avgHealing: num(average?.healing),
  };
}

/**
 * Guarantee a registry row exists for a member, so the poller can find them
 * even before the first successful snapshot. Upsert; never throws.
 */
export async function ensureOwPlayer(
  userId: string,
  battletag: string,
): Promise<void> {
  const db = getOwDb();
  if (!db) return;
  try {
    const now = new Date();
    const playerId = battletagToPlayerId(battletag);
    await db
      .insert(owPlayers)
      .values({
        userId,
        battletag,
        playerId,
        platform: "pc",
        pollChunk: chunkForUser(userId),
        firstConnectedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: owPlayers.userId,
        set: { battletag, playerId, updatedAt: now },
      });
  } catch (error) {
    console.error("ow ensurePlayer failed:", error);
  }
}

/**
 * Append one career snapshot and stamp the registry. Guarded by
 * MIN_SNAPSHOT_INTERVAL_MS (unless `force`) so the DB never rewrites itself and
 * near-simultaneous writers don't triple up. Never throws; a provider miss
 * simply writes nothing.
 */
export async function captureSnapshot(
  userId: string,
  battletag: string,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const db = getOwDb();
  if (!db) return;
  try {
    const existing = (
      await db
        .select({ lastSnapshotAt: owPlayers.lastSnapshotAt })
        .from(owPlayers)
        .where(eq(owPlayers.userId, userId))
        .limit(1)
    )[0];
    const last = existing?.lastSnapshotAt?.getTime() ?? 0;
    if (!force && last && Date.now() - last < MIN_SNAPSHOT_INTERVAL_MS) return;

    const base = overfastBase();
    const playerId = battletagToPlayerId(battletag);
    const [summary, stats] = await Promise.all([
      fetchOwSummary(base, playerId),
      fetchOwStatsSummary(base, playerId),
    ]);
    // Nothing came back (timeout / not found) — don't write an empty row or bump
    // the clock, so the next read retries rather than parking for 20 h.
    if (!summary && !stats) return;

    const now = new Date();
    const cols = extractSnapshotColumns(summary, stats);
    const insert = db.insert(owSnapshots).values({
      id: crypto.randomUUID(),
      userId,
      capturedAt: now,
      battletag,
      playerId,
      ...cols,
      summaryJson: summary ? JSON.stringify(summary) : null,
      statsJson: stats ? JSON.stringify(stats) : null,
    });
    const upsert = db
      .insert(owPlayers)
      .values({
        userId,
        battletag,
        playerId,
        platform: cols.platform,
        pollChunk: chunkForUser(userId),
        lastSnapshotAt: now,
        firstConnectedAt: now,
        visibility: "public",
        visibilityCheckedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: owPlayers.userId,
        set: {
          battletag,
          playerId,
          platform: cols.platform,
          lastSnapshotAt: now,
          visibility: "public",
          visibilityCheckedAt: now,
          updatedAt: now,
        },
      });
    // D1 has no interactive transactions; batch keeps both writes to one round
    // trip (see CLAUDE.md — use db.batch, never transaction()).
    await db.batch([insert, upsert]);
  } catch (error) {
    console.error("ow captureSnapshot failed:", error);
  }
}

/**
 * Public/private/not-found state of a member's Overwatch career, TTL-cached in
 * the registry (mirrors connectReachability in lib/integrations.ts). Ensures a
 * registry row exists as a side effect. Only a definitive answer is cached;
 * 'unknown' is left un-stamped so a transient failure is retried next visit.
 */
export async function getOwVisibility(
  userId: string,
  battletag: string,
  force = false,
): Promise<OwVisibility> {
  const db = getOwDb();
  const playerId = battletagToPlayerId(battletag);

  if (db && !force) {
    const row = (
      await db
        .select({
          visibility: owPlayers.visibility,
          checkedAt: owPlayers.visibilityCheckedAt,
        })
        .from(owPlayers)
        .where(eq(owPlayers.userId, userId))
        .limit(1)
    )[0];
    if (
      row?.visibility &&
      row.checkedAt &&
      Date.now() - row.checkedAt.getTime() < VISIBILITY_TTL_MS
    ) {
      return row.visibility as OwVisibility;
    }
  }

  const visibility = await checkOwVisibility(overfastBase(), playerId);

  if (db && visibility !== "unknown") {
    try {
      const now = new Date();
      await db
        .insert(owPlayers)
        .values({
          userId,
          battletag,
          playerId,
          platform: "pc",
          pollChunk: chunkForUser(userId),
          visibility,
          visibilityCheckedAt: now,
          firstConnectedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: owPlayers.userId,
          set: {
            battletag,
            playerId,
            visibility,
            visibilityCheckedAt: now,
            updatedAt: now,
          },
        });
    } catch (error) {
      console.error("ow visibility cache write failed:", error);
    }
  }

  return visibility;
}

function safeParse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Map a stored snapshot row to the client-facing PlayerSnapshot. */
function toSnapshot(row: {
  capturedAt: Date;
  battletag: string | null;
  platform: string | null;
  endorsementLevel: number | null;
  title: string | null;
  avatarUrl: string | null;
  namecardUrl: string | null;
  compSeason: number | null;
  tankDivision: string | null;
  tankTier: number | null;
  damageDivision: string | null;
  damageTier: number | null;
  supportDivision: string | null;
  supportTier: number | null;
  openDivision: string | null;
  openTier: number | null;
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
}): PlayerSnapshot {
  return {
    capturedAt: row.capturedAt.getTime(),
    battletag: row.battletag,
    platform: row.platform,
    endorsementLevel: row.endorsementLevel,
    title: row.title,
    avatarUrl: row.avatarUrl,
    namecardUrl: row.namecardUrl,
    compSeason: row.compSeason,
    ranks: {
      tank: { division: row.tankDivision, tier: row.tankTier },
      damage: { division: row.damageDivision, tier: row.damageTier },
      support: { division: row.supportDivision, tier: row.supportTier },
      open: { division: row.openDivision, tier: row.openTier },
    },
    gamesPlayed: row.gamesPlayed,
    gamesWon: row.gamesWon,
    gamesLost: row.gamesLost,
    timePlayed: row.timePlayed,
    winrate: row.winrate,
    kda: row.kda,
    totalEliminations: row.totalEliminations,
    totalAssists: row.totalAssists,
    totalDeaths: row.totalDeaths,
    totalDamage: row.totalDamage,
    totalHealing: row.totalHealing,
  };
}

/**
 * A member's whole Player Data payload: the latest snapshot, the metric history
 * for the charts, and the parsed detail blobs of the latest snapshot. Returns
 * null when there are no snapshots yet (the page shows a "collecting" state).
 */
export async function loadPlayerStats(
  userId: string,
): Promise<PlayerStatsData | null> {
  const db = getOwDb();
  if (!db) return null;

  const rows = await db
    .select({
      capturedAt: owSnapshots.capturedAt,
      battletag: owSnapshots.battletag,
      platform: owSnapshots.platform,
      endorsementLevel: owSnapshots.endorsementLevel,
      title: owSnapshots.title,
      avatarUrl: owSnapshots.avatarUrl,
      namecardUrl: owSnapshots.namecardUrl,
      compSeason: owSnapshots.compSeason,
      tankDivision: owSnapshots.tankDivision,
      tankTier: owSnapshots.tankTier,
      damageDivision: owSnapshots.damageDivision,
      damageTier: owSnapshots.damageTier,
      supportDivision: owSnapshots.supportDivision,
      supportTier: owSnapshots.supportTier,
      openDivision: owSnapshots.openDivision,
      openTier: owSnapshots.openTier,
      gamesPlayed: owSnapshots.gamesPlayed,
      gamesWon: owSnapshots.gamesWon,
      gamesLost: owSnapshots.gamesLost,
      timePlayed: owSnapshots.timePlayed,
      winrate: owSnapshots.winrate,
      kda: owSnapshots.kda,
      totalEliminations: owSnapshots.totalEliminations,
      totalAssists: owSnapshots.totalAssists,
      totalDeaths: owSnapshots.totalDeaths,
      totalDamage: owSnapshots.totalDamage,
      totalHealing: owSnapshots.totalHealing,
      summaryJson: owSnapshots.summaryJson,
      statsJson: owSnapshots.statsJson,
    })
    .from(owSnapshots)
    .where(eq(owSnapshots.userId, userId))
    .orderBy(asc(owSnapshots.capturedAt));

  if (rows.length === 0) return null;

  const latestRow = rows[rows.length - 1];
  const point = (t: number, value: number | null) => ({ t, value });

  return {
    latest: toSnapshot(latestRow),
    snapshotCount: rows.length,
    series: {
      gamesPlayed: rows.map((r) => point(r.capturedAt.getTime(), r.gamesPlayed)),
      winrate: rows.map((r) => point(r.capturedAt.getTime(), r.winrate)),
      kda: rows.map((r) => point(r.capturedAt.getTime(), r.kda)),
      timePlayed: rows.map((r) => point(r.capturedAt.getTime(), r.timePlayed)),
    },
    statsSummary: safeParse<OverfastStatsSummary>(latestRow.statsJson),
    summary: safeParse<OverfastSummary>(latestRow.summaryJson),
  };
}

/**
 * Snapshot a member the moment they connect Battle.net. Ensures the registry row
 * first (so the poller can pick them up even if this fetch fails), then takes the
 * initial snapshot. Best-effort; never throws into the OAuth link flow.
 */
export async function snapshotOnConnect(
  userId: string,
  battletag: string | null | undefined,
): Promise<void> {
  if (!battletag) return;
  try {
    await ensureOwPlayer(userId, battletag);
    await captureSnapshot(userId, battletag);
  } catch (error) {
    console.error("ow snapshotOnConnect failed:", error);
  }
}
