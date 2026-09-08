import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getOwDb } from "@/lib/ow-db";
import {
  faceitMatchPlayers,
  faceitMatches,
  faceitPlayers,
} from "@/db/faceit-schema";
import {
  computeMapWinrates,
  computeSummary,
  type ScoutMatch,
  type ScoutMode,
  type ScoutPlayer,
  type ScoutResponse,
  type ScoutResult,
  type ScoutStatus,
} from "@/lib/faceit-scouting-shared";

// The Commons' side of FACEIT Scouting. Reads the search-driven `faceit_*` cache
// (owned/written by the ow-data Worker) DIRECTLY off the shared OW binding — the
// same "read the rows the Worker wrote" relationship the Statistics/Teams tabs
// have to pd_*. Writes (collecting a newly-searched player) belong to the Worker,
// so a search is TRIGGERED over HTTP (requestFaceitSearch → POST /faceit/search),
// never performed here. Everything degrades: no OW binding → not_configured; no
// Worker config → the read still serves whatever is already cached.

/** How many match rows we pull for display (the chart aggregates over these). */
const DEFAULT_MATCH_LIMIT = 150;
const MAX_MATCH_LIMIT = 300;

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
    };

    // The row's own status is authoritative; a searched-but-unfinished player is
    // still "collecting" even if some matches are already readable.
    const status: ScoutStatus =
      row.status === "not_found"
        ? "not_found"
        : row.status === "error"
          ? "error"
          : row.listDone && row.detailDone
            ? "ready"
            : "collecting";

    return {
      status,
      player,
      data: {
        summary: computeSummary(matches),
        mapWinrates: computeMapWinrates(matches),
        matches,
      },
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
