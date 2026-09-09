import "server-only";

import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { getOwDb } from "@/lib/ow-db";
import {
  faceitMatchPlayers,
  faceitMatchRounds,
  faceitMatches,
  faceitPlayers,
} from "@/db/faceit-schema";
import {
  DEFAULT_GAME_MODE,
  type MapWinrate,
  type ScoutGameMode,
  type ScoutMapRound,
  type ScoutMatch,
  type ScoutMatchDetail,
  type ScoutMode,
  type ScoutPlayer,
  type ScoutRecord,
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

// A note on UNITS, because two of them are in play and mixing them up is what
// made this page disagree with faceit.com: a FACEIT Overwatch match is a Bo3/Bo5
// SERIES, and the maps inside it are its ROUNDS. `faceit_matches.map_name` is
// only the series' first veto pick, so every map aggregate below reads
// `faceit_match_rounds` instead, attributing each map to the player by comparing
// its winning team id with the player's own. FACEIT's profile counts maps; our
// match list counts series; the summary carries both, labelled.

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
 *
 * `gameMode` filters EVERY displayed number to one team-size format, the way
 * FACEIT segments its own stats. Collection state is deliberately NOT filtered:
 * `progress` and the ready/collecting status describe the backfill of the whole
 * history, so a 5v5 view of a player mid-collection still reports honest
 * progress instead of looking finished because their 5v5 slice happens to be.
 */
export async function getScoutingData(
  query: { playerId?: string; nickname?: string },
  gameMode: ScoutGameMode = DEFAULT_GAME_MODE,
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
      .where(
        and(
          eq(faceitMatchPlayers.playerId, row.playerId),
          eq(faceitMatches.gameMode, gameMode),
        ),
      )
      .orderBy(desc(faceitMatches.startedAt))
      .limit(take);

    // The maps each of those matches was played on: one query for the whole
    // window rather than one per row. The window is re-expressed as a SUBQUERY
    // rather than a list of the ids just fetched, because `take` runs to 500 and
    // D1 caps a statement at 100 bound parameters — the same reason the external
    // tournament reader keys its children off a subquery.
    const windowMatchIds = db
      .select({ matchId: faceitMatches.matchId })
      .from(faceitMatchPlayers)
      .innerJoin(
        faceitMatches,
        eq(faceitMatchPlayers.matchId, faceitMatches.matchId),
      )
      .where(
        and(
          eq(faceitMatchPlayers.playerId, row.playerId),
          eq(faceitMatches.gameMode, gameMode),
        ),
      )
      .orderBy(desc(faceitMatches.startedAt))
      .limit(take);
    const roundRows = rows.length
      ? await db
          .select({
            matchId: faceitMatchRounds.matchId,
            mapName: faceitMatchRounds.mapName,
          })
          .from(faceitMatchRounds)
          .where(
            and(
              inArray(faceitMatchRounds.matchId, windowMatchIds),
              isNotNull(faceitMatchRounds.mapName),
            ),
          )
          .orderBy(asc(faceitMatchRounds.matchId), asc(faceitMatchRounds.roundIndex))
      : [];
    const mapsByMatch = new Map<string, string[]>();
    for (const r of roundRows) {
      const list = mapsByMatch.get(r.matchId);
      if (list) list.push(r.mapName as string);
      else mapsByMatch.set(r.matchId, [r.mapName as string]);
    }

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
        maps: mapsByMatch.get(match.matchId) ?? [],
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

    // Both records come from SQL aggregates over EVERY collected match (not just
    // the ~300-row display window above), so a Deep result is accurate no matter
    // how deep the history runs. `detailed` (rows with a synced scoreboard) also
    // drives the deep progress bar.
    //
    // SERIES record: one row per FACEIT match. `result` is written from the
    // match overview's winner during DETAIL — the history listing reports only
    // the first map's winner, which is why it is not read here.
    //
    // One pass yields both populations: the `*All` columns count the player's
    // WHOLE collected history (collection progress + readiness), the rest count
    // only the selected format (everything shown). Splitting this into two
    // queries would double a read that runs on every keystroke-free refresh.
    const inMode = sql`${faceitMatches.gameMode} = ${gameMode}`;
    const [agg] = await db
      .select({
        totalAll: sql<number>`count(*)`,
        detailedAll: sql<number>`sum(case when ${faceitMatchPlayers.statsSyncedAt} is not null then 1 else 0 end)`,
        total: sql<number>`sum(case when ${inMode} then 1 else 0 end)`,
        wins: sql<number>`sum(case when ${inMode} and ${faceitMatchPlayers.result} = 'win' then 1 else 0 end)`,
        losses: sql<number>`sum(case when ${inMode} and ${faceitMatchPlayers.result} = 'loss' then 1 else 0 end)`,
        draws: sql<number>`sum(case when ${inMode} and ${faceitMatchPlayers.result} = 'draw' then 1 else 0 end)`,
        withMaps: sql<number>`sum(case when ${inMode} and ${faceitMatches.roundsSyncedAt} is not null then 1 else 0 end)`,
      })
      .from(faceitMatchPlayers)
      .innerJoin(
        faceitMatches,
        eq(faceitMatchPlayers.matchId, faceitMatches.matchId),
      )
      .where(eq(faceitMatchPlayers.playerId, row.playerId));

    // MAP record, grouped by map NAME only. The mode is a property of the map
    // (Ilios is always Control), so it rides along as max() rather than being
    // part of the key — grouping on it used to split one map into two bars
    // whenever a match's veto shipped no mode tag. A map is won when its own
    // winning team is the player's team; a map with no winner counts as a draw.
    const mapWon = sql`${faceitMatchRounds.winnerTeamId} is not null and ${faceitMatchRounds.winnerTeamId} = ${faceitMatchPlayers.teamId}`;
    const mapLost = sql`${faceitMatchRounds.winnerTeamId} is not null and ${faceitMatchRounds.winnerTeamId} <> ${faceitMatchPlayers.teamId}`;
    const mapAgg = await db
      .select({
        map: faceitMatchRounds.mapName,
        mode: sql<string | null>`max(${faceitMatchRounds.mapMode})`,
        wins: sql<number>`sum(case when ${mapWon} then 1 else 0 end)`,
        losses: sql<number>`sum(case when ${mapLost} then 1 else 0 end)`,
        draws: sql<number>`sum(case when ${faceitMatchRounds.winnerTeamId} is null then 1 else 0 end)`,
        total: sql<number>`count(*)`,
      })
      .from(faceitMatchPlayers)
      .innerJoin(
        faceitMatchRounds,
        eq(faceitMatchPlayers.matchId, faceitMatchRounds.matchId),
      )
      .innerJoin(
        faceitMatches,
        eq(faceitMatchRounds.matchId, faceitMatches.matchId),
      )
      .where(
        and(
          eq(faceitMatchPlayers.playerId, row.playerId),
          eq(faceitMatches.gameMode, gameMode),
          isNotNull(faceitMatchRounds.mapName),
        ),
      )
      .groupBy(faceitMatchRounds.mapName);

    const total = Number(agg?.total ?? 0);
    const wins = Number(agg?.wins ?? 0);
    const losses = Number(agg?.losses ?? 0);
    const draws = Number(agg?.draws ?? 0);
    const totalAll = Number(agg?.totalAll ?? 0);
    const detailedAll = Number(agg?.detailedAll ?? 0);
    const decidedAll = wins + losses;

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

    // The map-level totals are the sum of the same rows the chart draws, so the
    // headline and the bars can never disagree.
    const maps = mapWinrates.reduce<ScoutRecord>(
      (acc, m) => ({
        total: acc.total + m.total,
        wins: acc.wins + m.wins,
        losses: acc.losses + m.losses,
        draws: acc.draws + m.draws,
        winrate: null,
      }),
      { total: 0, wins: 0, losses: 0, draws: 0, winrate: null },
    );
    const decidedMaps = maps.wins + maps.losses;
    maps.winrate = decidedMaps > 0 ? maps.wins / decidedMaps : null;

    const summary: ScoutSummary = {
      total,
      wins,
      losses,
      draws,
      winrate: decidedAll > 0 ? wins / decidedAll : null,
      maps,
      matchesWithMaps: Number(agg?.withMaps ?? 0),
    };

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
    // waiting on a full backfill it never asked for. Both read the UNFILTERED
    // counts — readiness is a property of the collection, not of the format the
    // viewer happens to be looking at.
    const fullyReady = row.listDone && row.detailDone;
    const quickReady =
      row.searchMode === "quick" &&
      totalAll > 0 &&
      detailedAll >= Math.min(totalAll, QUICK_READY_MATCHES);
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
      data: { summary, mapWinrates, matches, gameMode },
      progress: { total: totalAll, detailed: detailedAll },
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

    // The maps of the series, so the round tabs can be named. A match collected
    // before rounds existed simply has none and the tabs stay "Round N".
    const roundRows = await db
      .select()
      .from(faceitMatchRounds)
      .where(eq(faceitMatchRounds.matchId, id))
      .orderBy(asc(faceitMatchRounds.roundIndex));

    const scoutedTeamId = scoutedPlayerId
      ? (players.find((p) => p.playerId === scoutedPlayerId)?.teamId ?? null)
      : null;
    const rounds: ScoutMapRound[] = roundRows.map((r) => ({
      round: r.roundIndex,
      mapName: r.mapName,
      mapMode: r.mapMode,
      scoreSummary: r.scoreSummary,
      result:
        !r.winnerTeamId || !scoutedTeamId
          ? null
          : r.winnerTeamId === scoutedTeamId
            ? "win"
            : "loss",
    }));

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
      rounds.length,
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
      rounds,
      detailed: match.statsSyncedAt != null,
    };
  } catch (error) {
    console.error("scouting: match detail read failed", error);
    return null;
  }
}
