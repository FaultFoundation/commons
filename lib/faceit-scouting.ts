import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getOwDb } from "@/lib/ow-db";
import {
  faceitMatchPlayers,
  faceitMatches,
  faceitPlayers,
} from "@/db/faceit-schema";
import {
  type MapWinrate,
  type ScoutMatch,
  type ScoutMatchDetail,
  type ScoutMode,
  type ScoutPlayer,
  type ScoutResponse,
  type ScoutResult,
  type ScoutRoundStats,
  type ScoutScoreboardPlayer,
  type ScoutScoreboardTeam,
  type ScoutStatus,
  type ScoutSummary,
} from "@/lib/faceit-scouting-shared";

// The Commons' side of FACEIT Scouting. Reads the search-driven `faceit_*` cache
// (owned/written by the ow-data Worker) DIRECTLY off the shared OW binding — the
// same "read the rows the Worker wrote" relationship the Statistics/Teams tabs
// have to pd_*. Writes (collecting a newly-searched player) belong to the Worker,
// so a search is TRIGGERED over HTTP (requestFaceitSearch → POST /faceit/search),
// never performed here. Everything degrades: no OW binding → not_configured; no
// Worker config → the read still serves whatever is already cached.

/** How many match rows we pull for the graphs + list window. The overall record
 *  and per-map win rates come from SQL aggregates over ALL matches (below), so
 *  this only bounds the trend graphs and the paginated match list. */
const DEFAULT_MATCH_LIMIT = 300;
const MAX_MATCH_LIMIT = 500;
/** A quick search is "ready" for display once this many recent matches carry a
 *  scoreboard (details land newest-first), so it doesn't wait on a full backfill. */
const QUICK_READY_MATCHES = 40;

type FaceitFactions = Record<
  string,
  { teamId?: string; nickname?: string; avatar?: string; score?: number | string } | undefined
>;

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Pull the scouted player's and their opponent's score + name out of the stored
 *  factions blob, from the player's own faction key. Defensive: a bad blob
 *  yields nulls rather than throwing. */
function readFactions(
  factionsJson: string | null,
  faction: string | null,
): { scoreFor: number | null; scoreAgainst: number | null; opponentName: string | null } {
  if (!factionsJson || !faction) {
    return { scoreFor: null, scoreAgainst: null, opponentName: null };
  }
  let parsed: FaceitFactions;
  try {
    parsed = JSON.parse(factionsJson) as FaceitFactions;
  } catch {
    return { scoreFor: null, scoreAgainst: null, opponentName: null };
  }
  const other = faction === "faction1" ? "faction2" : "faction1";
  return {
    scoreFor: toNum(parsed[faction]?.score),
    scoreAgainst: toNum(parsed[other]?.score),
    opponentName: parsed[other]?.nickname ?? null,
  };
}

const RESULTS = new Set(["win", "loss", "draw"]);
function asResult(v: string | null): ScoutResult | null {
  return v && RESULTS.has(v) ? (v as ScoutResult) : null;
}

/**
 * Read the cached scouting profile for a player (by resolved id, else nickname).
 * Returns a full ScoutResponse — identity + matches + the derived map win rates
 * and summary — or a degraded status when the cache has nothing (yet).
 */
export async function getScoutingData(
  query: { playerId?: string; nickname?: string },
  limit = DEFAULT_MATCH_LIMIT,
): Promise<ScoutResponse> {
  const db = getOwDb();
  if (!db) return { status: "not_configured", player: null, data: null };

  const key = query.playerId?.trim();
  const nick = query.nickname?.trim();
  if (!key && !nick) return { status: "idle", player: null, data: null };

  const take = Math.min(Math.max(1, limit), MAX_MATCH_LIMIT);

  try {
    const [row] = await db
      .select()
      .from(faceitPlayers)
      .where(
        key
          ? eq(faceitPlayers.playerId, key)
          : eq(sql`lower(${faceitPlayers.nickname})`, nick!.toLowerCase()),
      )
      .limit(1);

    // Never searched (or only seen as an opponent, no own history collected).
    if (!row || (!row.searchMode && row.matchCount === 0)) {
      return { status: "idle", player: null, data: null };
    }

    const rows = await db
      .select()
      .from(faceitMatchPlayers)
      .innerJoin(
        faceitMatches,
        eq(faceitMatchPlayers.matchId, faceitMatches.matchId),
      )
      .where(eq(faceitMatchPlayers.playerId, row.playerId))
      .orderBy(desc(faceitMatches.startedAt))
      .limit(take);

    const matches: ScoutMatch[] = rows.map((r) => {
      const me = r.faceit_match_players;
      const match = r.faceit_matches;
      const factions = readFactions(match.factionsJson, me.faction);
      return {
        matchId: match.matchId,
        competitionName: match.competitionName,
        competitionType: match.competitionType,
        mapName: match.mapName,
        mapMode: match.mapMode,
        serverName: match.serverName,
        bestOf: match.bestOf,
        startedAt: match.startedAt ? match.startedAt.getTime() : null,
        status: match.status,
        faceitUrl: match.faceitUrl,
        result: asResult(me.result),
        scoreFor: factions.scoreFor,
        scoreAgainst: factions.scoreAgainst,
        opponentName: factions.opponentName,
        role: me.role,
        eliminations: me.eliminations,
        deaths: me.deaths,
        assists: me.assists,
        kdRatio: me.kdRatio,
        damageDealt: me.damageDealt,
        healingDone: me.healingDone,
        damageMitigated: me.damageMitigated,
      };
    });

    // The overall record + per-map win rates come from SQL aggregates over EVERY
    // collected match (not just the ~300-row display window above), so a Deep
    // result is accurate no matter how deep the history runs. `detailed` (rows
    // with a synced scoreboard) also drives the deep progress bar.
    const [agg] = await db
      .select({
        total: sql<number>`count(*)`,
        wins: sql<number>`sum(case when ${faceitMatchPlayers.result} = 'win' then 1 else 0 end)`,
        losses: sql<number>`sum(case when ${faceitMatchPlayers.result} = 'loss' then 1 else 0 end)`,
        draws: sql<number>`sum(case when ${faceitMatchPlayers.result} = 'draw' then 1 else 0 end)`,
        detailed: sql<number>`sum(case when ${faceitMatchPlayers.statsSyncedAt} is not null then 1 else 0 end)`,
      })
      .from(faceitMatchPlayers)
      .where(eq(faceitMatchPlayers.playerId, row.playerId));

    const mapAgg = await db
      .select({
        map: faceitMatches.mapName,
        mode: faceitMatches.mapMode,
        wins: sql<number>`sum(case when ${faceitMatchPlayers.result} = 'win' then 1 else 0 end)`,
        losses: sql<number>`sum(case when ${faceitMatchPlayers.result} = 'loss' then 1 else 0 end)`,
        draws: sql<number>`sum(case when ${faceitMatchPlayers.result} = 'draw' then 1 else 0 end)`,
        total: sql<number>`count(*)`,
      })
      .from(faceitMatchPlayers)
      .innerJoin(
        faceitMatches,
        eq(faceitMatchPlayers.matchId, faceitMatches.matchId),
      )
      .where(
        and(
          eq(faceitMatchPlayers.playerId, row.playerId),
          isNotNull(faceitMatches.mapName),
        ),
      )
      .groupBy(faceitMatches.mapName, faceitMatches.mapMode);

    const total = Number(agg?.total ?? 0);
    const wins = Number(agg?.wins ?? 0);
    const losses = Number(agg?.losses ?? 0);
    const draws = Number(agg?.draws ?? 0);
    const detailed = Number(agg?.detailed ?? 0);
    const decidedAll = wins + losses;
    const withMap = mapAgg.reduce((s, r) => s + Number(r.total), 0);

    const summary: ScoutSummary = {
      total,
      wins,
      losses,
      draws,
      winrate: decidedAll > 0 ? wins / decidedAll : null,
      withMap,
    };

    const mapWinrates: MapWinrate[] = mapAgg
      .filter((r) => r.map)
      .map((r) => {
        const w = Number(r.wins);
        const l = Number(r.losses);
        const decided = w + l;
        return {
          map: r.map as string,
          mapMode: r.mode,
          wins: w,
          losses: l,
          draws: Number(r.draws),
          total: Number(r.total),
          winrate: decided > 0 ? w / decided : null,
        };
      })
      .sort((a, b) => b.total - a.total || (b.winrate ?? -1) - (a.winrate ?? -1));

    const player: ScoutPlayer = {
      playerId: row.playerId,
      nickname: row.nickname,
      avatarUrl: row.avatarUrl,
      country: row.country,
      skillLevel: row.skillLevel,
      faceitElo: row.faceitElo,
      region: row.region,
      faceitUrl: row.faceitUrl,
      gamePlayerName: row.gamePlayerName,
      matchCount: row.matchCount,
      listDone: row.listDone,
      detailDone: row.detailDone,
      searchMode: row.searchMode,
    };

    // Display readiness: a deep search is "ready" only when the whole history is
    // collected; a quick search is "ready" once its recent target window is
    // detailed (details land newest-first), so it doesn't sit in "collecting"
    // waiting on a full backfill it never asked for.
    const fullyReady = row.listDone && row.detailDone;
    const quickReady =
      row.searchMode === "quick" &&
      total > 0 &&
      detailed >= Math.min(total, QUICK_READY_MATCHES);
    const status: ScoutStatus =
      row.status === "not_found"
        ? "not_found"
        : row.status === "error"
          ? "error"
          : fullyReady || quickReady
            ? "ready"
            : "collecting";

    return {
      status,
      player,
      data: { summary, mapWinrates, matches },
      progress: { total, detailed },
    };
  } catch (error) {
    console.error("scouting: read failed", error);
    return { status: "error", player: null, data: null };
  }
}

// ---------------------------------------------------------------------------
// The search trigger. The collection engine lives ONLY in the ow-data Worker
// (faceit-collect.ts has no Commons twin), so a search is an authenticated
// server-to-server POST to that Worker, which resolves the player, does one
// list page synchronously and continues the backfill in the background. Mirrors
// lib/external-refresh.ts: best-effort, scheme-tolerant, bounded timeout.
// ---------------------------------------------------------------------------

const SEARCH_TIMEOUT_MS = 12000;

export type SearchTrigger = {
  ok: boolean;
  status: ScoutStatus;
  resolved?: { playerId: string; nickname: string };
};

export async function requestFaceitSearch(
  query: { nickname?: string; playerId?: string },
  mode: ScoutMode = "quick",
): Promise<SearchTrigger> {
  const { env } = getCloudflareContext();
  const rawBase = env.OW_DATA_URL?.trim();
  const secret = env.OW_POLLER_SECRET?.trim();
  if (!rawBase || !secret) return { ok: false, status: "not_configured" };
  if (!query.nickname && !query.playerId) return { ok: false, status: "error" };

  // Tolerate a scheme-less base ("ow-data.example.workers.dev"), the same trap
  // that silently no-op'd the external-tournament refresh.
  const base = (
    /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`
  ).replace(/\/$/, "");

  const params = new URLSearchParams({ mode });
  if (query.playerId) params.set("player_id", query.playerId);
  else if (query.nickname) params.set("nickname", query.nickname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/faceit/search?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    if (res.status === 404) return { ok: false, status: "not_found" };
    if (!res.ok) return { ok: false, status: "error" };
    const data = (await res.json().catch(() => ({}))) as {
      player?: { playerId?: string; nickname?: string };
      status?: string;
    };
    const resolved =
      data.player?.playerId && data.player?.nickname
        ? { playerId: data.player.playerId, nickname: data.player.nickname }
        : undefined;
    return {
      ok: true,
      status: data.status === "ready" ? "ready" : "collecting",
      resolved,
    };
  } catch {
    return { ok: false, status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Deep-search drive-to-completion. A quick search finishes on its own (recent
// window). A deep search asks the Commons to keep advancing the Worker's bounded,
// resumable collection until the whole history is in — so the Commons loops this
// (POST /faceit/advance) behind a load screen, reading the returned progress
// counts, until listDone && undetailed === 0 (or a client safety cap). No profile
// resolution here (the trigger already registered the player), so a deep loop
// costs no extra FACEIT search calls. Best-effort like the trigger.
// ---------------------------------------------------------------------------

/** A single advance chunk can page + detail dozens of matches, so it needs more
 *  headroom than the trigger's timeout. */
const ADVANCE_TIMEOUT_MS = 30000;

export type AdvanceResult = {
  ok: boolean;
  status: ScoutStatus;
  matchCount?: number;
  undetailed?: number;
  listDone?: boolean;
  detailDone?: boolean;
};

export async function advanceFaceitSearch(
  playerId: string,
  mode: ScoutMode = "deep",
): Promise<AdvanceResult> {
  const { env } = getCloudflareContext();
  const rawBase = env.OW_DATA_URL?.trim();
  const secret = env.OW_POLLER_SECRET?.trim();
  if (!rawBase || !secret) return { ok: false, status: "not_configured" };
  if (!playerId) return { ok: false, status: "error" };

  const base = (
    /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`
  ).replace(/\/$/, "");
  const params = new URLSearchParams({ mode, player_id: playerId });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADVANCE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/faceit/advance?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    if (res.status === 404) return { ok: false, status: "not_found" };
    if (!res.ok) return { ok: false, status: "error" };
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      matchCount?: number;
      undetailed?: number;
      listDone?: boolean;
      detailDone?: boolean;
    };
    return {
      ok: true,
      status: data.status === "ready" ? "ready" : "collecting",
      matchCount: data.matchCount,
      undetailed: data.undetailed,
      listDone: data.listDone,
      detailDone: data.detailDone,
    };
  } catch {
    return { ok: false, status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// On-demand match detail (the expandable match dropdown). Every participant's
// scoreboard is already collected during the DETAIL phase, so this is a pure read
// of both teams' rows plus the match overview — fetched only when a row expands,
// so the heavy per-player payload never rides in the main list.
// ---------------------------------------------------------------------------

/** Parse a stat map value to a number, else null. */
function statNum(raw: Record<string, string>, key: string): number | null {
  const v = raw[key];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundFrom(raw: Record<string, string>, index: number | null): ScoutRoundStats {
  return {
    round: index,
    eliminations: statNum(raw, "Eliminations"),
    deaths: statNum(raw, "Deaths"),
    assists: statNum(raw, "Assists"),
    kdRatio: statNum(raw, "K/D Ratio"),
    damageDealt: statNum(raw, "Damage Dealt"),
    healingDone: statNum(raw, "Healing Done"),
    damageMitigated: statNum(raw, "Damage Mitigated"),
    raw,
  };
}

/** stats_json is a single round map (Bo1) or an array of them (multi-round). */
function parseRounds(statsJson: string | null): ScoutRoundStats[] {
  if (!statsJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(statsJson);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) {
    return parsed
      .filter((r): r is Record<string, string> => !!r && typeof r === "object")
      .map((r, i) => roundFrom(r, i + 1));
  }
  if (parsed && typeof parsed === "object") {
    return [roundFrom(parsed as Record<string, string>, 1)];
  }
  return [];
}

function parseFactionSummaries(
  json: string | null,
): Record<string, { name: string | null; score: number | null }> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as FaceitFactions;
    const out: Record<string, { name: string | null; score: number | null }> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = { name: v?.nickname ?? null, score: toNum(v?.score) };
    }
    return out;
  } catch {
    return {};
  }
}

function parseStringArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** Hero bans are stored as [{ guid, name }] — pull the display names. */
function parseHeroBans(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((b) =>
        b && typeof b === "object"
          ? ((b as { name?: string }).name ?? null)
          : typeof b === "string"
            ? b
            : null,
      )
      .filter((x): x is string => !!x);
  } catch {
    return [];
  }
}

/**
 * The fully-expanded detail for one match: overview + both teams' scoreboards,
 * with each participant's per-round breakdown parsed from stats_json. Degrades to
 * null (no OW binding, no such match). `scoutedPlayerId` (when passed) highlights
 * the searched player and orders their team first.
 */
export async function getScoutMatchDetail(
  matchId: string,
  scoutedPlayerId?: string,
): Promise<ScoutMatchDetail | null> {
  const db = getOwDb();
  if (!db) return null;
  const id = matchId.trim();
  if (!id) return null;

  try {
    const [match] = await db
      .select()
      .from(faceitMatches)
      .where(eq(faceitMatches.matchId, id))
      .limit(1);
    if (!match) return null;

    const players = await db
      .select()
      .from(faceitMatchPlayers)
      .where(eq(faceitMatchPlayers.matchId, id));

    const factions = parseFactionSummaries(match.factionsJson);

    const sbPlayers: ScoutScoreboardPlayer[] = players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      faction: p.faction,
      result: asResult(p.result),
      role: p.role,
      isScouted: scoutedPlayerId ? p.playerId === scoutedPlayerId : false,
      eliminations: p.eliminations,
      deaths: p.deaths,
      assists: p.assists,
      kdRatio: p.kdRatio,
      damageDealt: p.damageDealt,
      healingDone: p.healingDone,
      damageMitigated: p.damageMitigated,
      finalBlows: p.finalBlows,
      soloKills: p.soloKills,
      rounds: parseRounds(p.statsJson),
    }));

    const roundCount = sbPlayers.reduce(
      (max, p) => Math.max(max, p.rounds.length),
      0,
    );

    const scoutedFaction = scoutedPlayerId
      ? (sbPlayers.find((p) => p.playerId === scoutedPlayerId)?.faction ?? null)
      : null;
    const factionKeys = [
      ...new Set(sbPlayers.map((p) => p.faction ?? "faction1")),
    ].sort((a, b) => {
      if (a === scoutedFaction) return -1;
      if (b === scoutedFaction) return 1;
      return a.localeCompare(b);
    });

    const teams: ScoutScoreboardTeam[] = factionKeys.map((fk) => {
      const teamPlayers = sbPlayers
        .filter((p) => (p.faction ?? "faction1") === fk)
        .sort(
          (a, b) =>
            (b.isScouted ? 1 : 0) - (a.isScouted ? 1 : 0) ||
            (b.eliminations ?? 0) - (a.eliminations ?? 0),
        );
      const summary = factions[fk];
      const result = teamPlayers.find((p) => p.result)?.result ?? null;
      return {
        faction: fk,
        name: summary?.name ?? null,
        score: summary?.score ?? null,
        result,
        players: teamPlayers,
      };
    });

    return {
      matchId: match.matchId,
      competitionName: match.competitionName,
      competitionType: match.competitionType,
      serverName: match.serverName,
      mapName: match.mapName,
      mapMode: match.mapMode,
      round: match.round,
      groupNum: match.groupNum,
      bestOf: match.bestOf,
      status: match.status,
      startedAt: match.startedAt ? match.startedAt.getTime() : null,
      faceitUrl: match.faceitUrl,
      replayCodes: parseStringArray(match.replayCodesJson),
      heroBans: parseHeroBans(match.heroBansJson),
      teams,
      roundCount,
      detailed: match.statsSyncedAt != null,
    };
  } catch (error) {
    console.error("scouting: match detail read failed", error);
    return null;
  }
}
