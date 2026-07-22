import { and, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  matchGames,
  matches,
  tournamentParticipants,
} from "@/db/schema";
import { requireTeamCapability } from "@/lib/teams";

// ---------------------------------------------------------------------------
// Score reporting.
//
// Whoever reports wins: a report from either side applies immediately and
// standings move with it — there is no opponent-confirmation step. Staff
// correct mistakes afterwards, and a correction is just another report, which
// is why `recomputeStandings` rebuilds totals from scratch instead of applying
// deltas. Re-reporting the same match twice must not double-count.
//
// D1 has no interactive transactions (drizzle's `transaction()` emits a raw
// BEGIN, which D1 rejects), so multi-statement writes go through `db.batch`.
// ---------------------------------------------------------------------------

/** Round-robin points per series win. Per-tournament overrides can land on
    `tournaments` later without touching the recompute logic. */
export const POINTS_PER_WIN = 3;

export type GameScoreInput = {
  gameNumber: number;
  mapName?: string | null;
  /** Scores are always in participant-A-then-B order, whichever side reports. */
  participantAScore: number;
  participantBScore: number;
  replayCode?: string | null;
};

export type ReportResult = { ok: true } | { ok: false; error: string };

const MAP_NAME_MAX = 60;
const REPLAY_CODE_MAX = 12;

function cleanInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const int = Math.trunc(value);
  return int >= 0 && int <= 99 ? int : null;
}

/**
 * Records the result of a match. Authorization comes from the reporter's
 * membership on either side — both teams may report, and the later report is
 * the one that stands.
 */
export async function reportMatchScore(input: {
  matchId: string;
  userId: string;
  games: GameScoreInput[];
}): Promise<ReportResult> {
  const db = getDb();
  const now = new Date();

  const matchRows = await db
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      bestOf: matches.bestOf,
      participantAId: matches.participantAId,
      participantBId: matches.participantBId,
    })
    .from(matches)
    .where(eq(matches.id, input.matchId))
    .limit(1);
  const match = matchRows[0];
  if (!match) return { ok: false, error: "That match no longer exists." };
  if (!match.participantAId || !match.participantBId) {
    return { ok: false, error: "That match doesn't have two teams yet." };
  }

  const participants = await db
    .select({
      id: tournamentParticipants.id,
      teamId: tournamentParticipants.teamId,
    })
    .from(tournamentParticipants)
    .where(
      inArray(tournamentParticipants.id, [
        match.participantAId,
        match.participantBId,
      ]),
    );

  // Either side may report; the first team the reporter has the capability on
  // authorizes the write.
  let authorized = false;
  for (const participant of participants) {
    if (!participant.teamId) continue;
    const check = await requireTeamCapability(
      input.userId,
      participant.teamId,
      "reportScores",
    );
    if (check.ok) {
      authorized = true;
      break;
    }
  }
  if (!authorized) {
    return {
      ok: false,
      error: "Only a manager or captain of one of these teams can report this match.",
    };
  }

  // --- Validate the submitted games ------------------------------------
  const seen = new Set<number>();
  const games: Required<GameScoreInput>[] = [];
  for (const game of input.games ?? []) {
    const number = cleanInt(game.gameNumber);
    const a = cleanInt(game.participantAScore);
    const b = cleanInt(game.participantBScore);
    if (number == null || number < 1 || number > match.bestOf) {
      return { ok: false, error: "That match doesn't have that many games." };
    }
    if (seen.has(number)) {
      return { ok: false, error: "Each game can only be reported once." };
    }
    if (a == null || b == null) {
      return { ok: false, error: "Scores must be whole numbers." };
    }
    if (a === b) {
      return { ok: false, error: `Game ${number} can't end in a tie.` };
    }
    seen.add(number);
    games.push({
      gameNumber: number,
      mapName: (game.mapName ?? "").trim().slice(0, MAP_NAME_MAX) || null,
      participantAScore: a,
      participantBScore: b,
      replayCode:
        (game.replayCode ?? "").trim().toUpperCase().slice(0, REPLAY_CODE_MAX) ||
        null,
    });
  }
  if (!games.length) {
    return { ok: false, error: "Enter the score for at least one game." };
  }

  const aWins = games.filter(
    (g) => g.participantAScore > g.participantBScore,
  ).length;
  const bWins = games.length - aWins;
  if (aWins === bWins) {
    return {
      ok: false,
      error: "The games are split evenly — report the deciding game too.",
    };
  }
  const winnerParticipantId =
    aWins > bWins ? match.participantAId : match.participantBId;

  // Games are replaced wholesale so a correction that drops a game (a Bo3
  // reported as 2-1, then fixed to 2-0) doesn't leave the extra row behind.
  await db.batch([
    db.delete(matchGames).where(eq(matchGames.matchId, match.id)),
    ...games.map((game) =>
      db.insert(matchGames).values({
        id: crypto.randomUUID(),
        matchId: match.id,
        gameNumber: game.gameNumber,
        mapName: game.mapName,
        participantAScore: game.participantAScore,
        participantBScore: game.participantBScore,
        winnerParticipantId:
          game.participantAScore > game.participantBScore
            ? match.participantAId
            : match.participantBId,
        replayCode: game.replayCode,
        createdAt: now,
        updatedAt: now,
      }),
    ),
    db
      .update(matches)
      .set({
        status: "confirmed",
        winnerParticipantId,
        playedAt: now,
        reportedByUserId: input.userId,
        reportedAt: now,
        updatedAt: now,
      })
      .where(eq(matches.id, match.id)),
  ] as const);

  await recomputeStandings(match.tournamentId);
  return { ok: true };
}

/**
 * Rebuilds wins/losses/map differential/points for a tournament's participants
 * from its confirmed matches. Recomputing (rather than adding deltas at report
 * time) is what makes re-reporting a corrected score safe.
 */
export async function recomputeStandings(tournamentId: string): Promise<void> {
  const db = getDb();

  const [entries, confirmed] = await Promise.all([
    db
      .select({ id: tournamentParticipants.id })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.tournamentId, tournamentId),
          isNull(tournamentParticipants.withdrawnAt),
        ),
      ),
    db
      .select({
        id: matches.id,
        participantAId: matches.participantAId,
        participantBId: matches.participantBId,
        winnerParticipantId: matches.winnerParticipantId,
      })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.status, "confirmed"),
        ),
      ),
  ]);
  if (!entries.length) return;

  const gameRows = confirmed.length
    ? await db
        .select({
          matchId: matchGames.matchId,
          winnerParticipantId: matchGames.winnerParticipantId,
        })
        .from(matchGames)
        .where(
          inArray(
            matchGames.matchId,
            confirmed.map((m) => m.id),
          ),
        )
    : [];

  const totals = new Map(
    entries.map((e) => [e.id, { wins: 0, losses: 0, mapDiff: 0 }]),
  );

  for (const match of confirmed) {
    const { participantAId: a, participantBId: b } = match;
    if (!a || !b) continue; // bye
    const rowA = totals.get(a);
    const rowB = totals.get(b);

    // Map differential counts games won minus games lost, not raw round score.
    const games = gameRows.filter((g) => g.matchId === match.id);
    const aMaps = games.filter((g) => g.winnerParticipantId === a).length;
    const bMaps = games.filter((g) => g.winnerParticipantId === b).length;
    if (rowA) rowA.mapDiff += aMaps - bMaps;
    if (rowB) rowB.mapDiff += bMaps - aMaps;

    if (match.winnerParticipantId === a) {
      if (rowA) rowA.wins += 1;
      if (rowB) rowB.losses += 1;
    } else if (match.winnerParticipantId === b) {
      if (rowB) rowB.wins += 1;
      if (rowA) rowA.losses += 1;
    }
  }

  const updates = [...totals.entries()].map(([id, t]) =>
    db
      .update(tournamentParticipants)
      .set({
        wins: t.wins,
        losses: t.losses,
        mapDiff: t.mapDiff,
        points: t.wins * POINTS_PER_WIN,
        updatedAt: new Date(),
      })
      .where(eq(tournamentParticipants.id, id)),
  );
  if (updates.length) {
    await db.batch(updates as [(typeof updates)[number], ...typeof updates]);
  }
}
