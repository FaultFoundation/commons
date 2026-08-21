import { cache } from "react";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import {
  teams,
  teamMembers,
  tournamentBrackets,
  tournaments,
  tournamentParticipants,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import { requireStaffCapability, type StaffCheck } from "@/lib/staff";
import { fetchChallongeState } from "@/lib/challonge";
import {
  TOURNAMENT_ID_MAX,
  TOURNAMENT_ID_MIN,
  isRegistrationOpen,
  isRosterLocked,
  type SnapshotParticipant,
  type SnapshotPayload,
  type TournamentFormat,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

// ---------------------------------------------------------------------------
// D1 reads, lifecycle helpers, and the Challonge bracket-snapshot cache.
//
// Server-only counterpart to lib/tournaments-shared.ts. Everything here touches
// getDb() and must never be imported from a client component. Challonge is the
// system of record for the bracket itself (lib/challonge.ts); D1 holds our
// identity/lifecycle/registration rows plus a cached render of the bracket.
// ---------------------------------------------------------------------------

export type TournamentRow = {
  id: string;
  programId: string;
  gameId: string | null;
  source: string;
  externalId: string | null;
  externalUrl: string | null;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  rosterLockAt: Date | null;
  bestOf: number;
  swissRounds: number | null;
  thirdPlaceMatch: boolean;
  rulesUrl: string | null;
  version: number;
  bracketGeneratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ---------------------------------------------------------------------------
// Single-tournament reads
// ---------------------------------------------------------------------------

export const getTournament = cache(
  async (tournamentId: string): Promise<TournamentRow | null> => {
    const rows = await getDb()
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);
    return (rows[0] as TournamentRow) ?? null;
  },
);

/**
 * Reserve an unused 6-digit id. The space is 900k wide and the platform holds
 * hundreds of tournaments, not millions, so a re-roll on collision is cheaper
 * than any coordination scheme. The loop is bounded — the unique primary key is
 * the thing that actually guarantees correctness.
 */
export async function reserveTournamentId(): Promise<string | null> {
  const db = getDb();
  const span = TOURNAMENT_ID_MAX - TOURNAMENT_ID_MIN + 1;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const id = String(TOURNAMENT_ID_MIN + (buf[0] % span));

    const taken = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.id, id))
      .limit(1);
    if (!taken.length) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tournament list (admin and public)
// ---------------------------------------------------------------------------

export type TournamentListItem = {
  id: string;
  name: string;
  format: string;
  status: string;
  maxParticipants: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  entrantCount: number;
};

export async function listTournaments(opts?: {
  programId?: string;
  excludeDraft?: boolean;
}): Promise<TournamentListItem[]> {
  const db = getDb();
  const conditions = [];
  if (opts?.programId) conditions.push(eq(tournaments.programId, opts.programId));
  if (opts?.excludeDraft) conditions.push(ne(tournaments.status, "draft"));

  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      format: tournaments.format,
      status: tournaments.status,
      maxParticipants: tournaments.maxParticipants,
      startsAt: tournaments.startsAt,
      endsAt: tournaments.endsAt,
      createdAt: tournaments.createdAt,
      entrantCount:
        sql<number>`(SELECT count(*) FROM tournament_participants WHERE tournament_id = ${tournaments.id} AND withdrawn_at IS NULL)`.as(
          "entrant_count",
        ),
    })
    .from(tournaments)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(tournaments.createdAt));

  return rows as TournamentListItem[];
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export type ParticipantWithTeam = {
  id: string;
  challongeParticipantId: string | null;
  teamId: string | null;
  userId: string | null;
  seed: number | null;
  teamName: string | null;
  teamTag: string | null;
  createdAt: Date;
};

/** Team label used everywhere an entrant is shown: "Name [TAG]". */
export function entrantLabel(
  teamName: string | null,
  teamTag: string | null,
): string {
  if (!teamName) return "Solo entrant";
  return teamTag ? `${teamName} [${teamTag}]` : teamName;
}

export async function listParticipantsWithTeams(
  tournamentId: string,
): Promise<ParticipantWithTeam[]> {
  return getDb()
    .select({
      id: tournamentParticipants.id,
      challongeParticipantId: tournamentParticipants.challongeParticipantId,
      teamId: tournamentParticipants.teamId,
      userId: tournamentParticipants.userId,
      seed: tournamentParticipants.seed,
      teamName: teams.name,
      teamTag: teams.tag,
      createdAt: tournamentParticipants.createdAt,
    })
    .from(tournamentParticipants)
    .leftJoin(teams, eq(teams.id, tournamentParticipants.teamId))
    .where(
      and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        isNull(tournamentParticipants.withdrawnAt),
      ),
    )
    .orderBy(
      tournamentParticipants.seed,
      tournamentParticipants.createdAt,
    ) as Promise<ParticipantWithTeam[]>;
}

export async function getParticipantCount(
  tournamentId: string,
): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(tournamentParticipants)
    .where(
      and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        isNull(tournamentParticipants.withdrawnAt),
      ),
    );
  return rows[0]?.count ?? 0;
}

/** Tournaments the member's teams are entered in, for the schedule header. */
export async function listMyTournaments(userId: string) {
  return getDb()
    .selectDistinct({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      startsAt: tournaments.startsAt,
      endsAt: tournaments.endsAt,
      teamName: teams.name,
    })
    .from(tournamentParticipants)
    .innerJoin(
      tournaments,
      eq(tournaments.id, tournamentParticipants.tournamentId),
    )
    .innerJoin(teams, eq(teams.id, tournamentParticipants.teamId))
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, userId),
        eq(teamMembers.status, "active"),
      ),
    )
    .where(isNull(tournamentParticipants.withdrawnAt))
    .orderBy(tournaments.startsAt);
}

// ---------------------------------------------------------------------------
// Roster lock check — called from roster mutations to block changes after
// rosterLockAt or bracket generation.
// ---------------------------------------------------------------------------

export async function rosterLockedFor(teamId: string): Promise<string[]> {
  const entries = await getDb()
    .select({
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      rosterLockAt: tournaments.rosterLockAt,
    })
    .from(tournamentParticipants)
    .innerJoin(
      tournaments,
      eq(tournaments.id, tournamentParticipants.tournamentId),
    )
    .where(
      and(
        eq(tournamentParticipants.teamId, teamId),
        isNull(tournamentParticipants.withdrawnAt),
      ),
    );

  return entries
    .filter((e) =>
      isRosterLocked(
        e.tournamentStatus as TournamentStatus,
        e.rosterLockAt?.getTime() ?? null,
      ),
    )
    .map((e) => e.tournamentName);
}

// ---------------------------------------------------------------------------
// Registration window check (capacity + deadlines)
// ---------------------------------------------------------------------------

export type RegistrationCheck = { ok: true } | { ok: false; error: string };

export function checkRegistrationOpen(
  tournament: TournamentRow,
  currentCount: number,
): RegistrationCheck {
  if (
    !isRegistrationOpen(
      tournament.status,
      tournament.registrationOpensAt?.getTime() ?? null,
      tournament.registrationClosesAt?.getTime() ?? null,
    )
  ) {
    return { ok: false, error: "Registration is not open for this tournament." };
  }
  if (tournament.maxParticipants && currentCount >= tournament.maxParticipants) {
    return { ok: false, error: "This tournament is full." };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Authorization. Today: delegates to requireStaffCapability. The seam for
// future per-tournament organizer grants — replace this one function.
// ---------------------------------------------------------------------------

export async function requireTournamentCapability(
  userId: string,
  _tournamentId: string,
  _capability: "manageTournaments",
): Promise<StaffCheck> {
  return requireStaffCapability(userId, "manageTournaments");
}

// ---------------------------------------------------------------------------
// Optimistic concurrency + status transitions
// ---------------------------------------------------------------------------

export type CasResult =
  | { ok: true; newVersion: number }
  | { ok: false; error: string };

export async function versionCas(
  tournamentId: string,
  expectedVersion: number,
): Promise<CasResult> {
  const rows = await getDb()
    .update(tournaments)
    .set({ version: sql`${tournaments.version} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(tournaments.id, tournamentId),
        eq(tournaments.version, expectedVersion),
      ),
    )
    .returning({ version: tournaments.version });

  if (rows.length === 0) {
    return {
      ok: false,
      error: "Someone else changed this tournament. Refresh and try again.",
    };
  }
  return { ok: true, newVersion: rows[0].version };
}

export async function transitionStatus(
  tournamentId: string,
  from: TournamentStatus,
  to: TournamentStatus,
  extra?: Partial<{ bracketGeneratedAt: Date | null }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await getDb()
    .update(tournaments)
    .set({
      status: to,
      version: sql`${tournaments.version} + 1`,
      updatedAt: new Date(),
      ...(extra ?? {}),
    })
    .where(and(eq(tournaments.id, tournamentId), eq(tournaments.status, from)))
    .returning({ id: tournaments.id });

  if (rows.length === 0) {
    return { ok: false, error: `Tournament is no longer in "${from}" status.` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bracket snapshot cache
//
// The public bracket is pulled from Challonge and materialized as one JSON row
// in `tournament_brackets`. Workers has no cron, so it refreshes lazily on read
// past a status-dependent TTL — and immediately when the tournament's `version`
// has moved past the cached one (an admin mutation bumps version). Refresh is
// resilient: if Challonge is unreachable, a prior cache is served stale rather
// than wiped, and an uncached failure yields an empty (but renderable) bracket.
// ---------------------------------------------------------------------------

// TTLs are deliberately conservative because each refresh is two Challonge GETs
// and Challonge meters API usage (free tier ~500 calls/month). The primary
// freshness path is not this TTL but admin mutations, which call buildSnapshot
// directly — so a live bracket updates the instant staff enter a result, and
// this TTL is only the safety net for changes made straight on Challonge.
const SNAPSHOT_TTL_MS: Record<TournamentStatus, number> = {
  draft: 300_000,
  registration: 600_000,
  seeding: 120_000,
  active: 120_000,
  completed: 86_400_000,
  cancelled: 86_400_000,
};

export type LoadedSnapshot = {
  payload: SnapshotPayload;
  version: number;
  fetchedAt: number;
};

function emptyPayload(t: TournamentRow): SnapshotPayload {
  return {
    tournament: {
      id: t.id,
      name: t.name,
      format: t.format,
      status: t.status,
      challongeUrl: t.externalUrl,
    },
    participants: [],
    matches: [],
  };
}

/**
 * Rebuild the snapshot from Challonge and write it to the cache. Returns the
 * freshly built snapshot, or the previous cache (served stale) if Challonge
 * fails, or an empty payload if there's nothing to fall back to. Never throws.
 */
export async function buildSnapshot(
  tournamentId: string,
): Promise<LoadedSnapshot> {
  const db = getDb();
  const tournament = await getTournament(tournamentId);
  if (!tournament) {
    // Caller should have checked; give a harmless empty shell.
    return {
      payload: {
        tournament: {
          id: tournamentId,
          name: "Tournament",
          format: "single_elim",
          status: "draft",
          challongeUrl: null,
        },
        participants: [],
        matches: [],
      },
      version: 0,
      fetchedAt: Date.now(),
    };
  }

  const base = emptyPayload(tournament);

  // No Challonge tournament yet (still draft) — cache the shell so the page has
  // something and the poll route stops asking.
  if (!tournament.externalId) {
    return writeSnapshot(tournament, base);
  }

  const state = await fetchChallongeState(tournament.externalId);
  if (!state.ok) {
    const prior = await readSnapshot(tournamentId);
    if (prior) return prior; // serve stale rather than wipe
    return { payload: base, version: tournament.version, fetchedAt: Date.now() };
  }

  // Enrich Challonge participant labels with our current team names, keyed by
  // the stored challonge_participant_id. Falls back to the Challonge name.
  const ours = await listParticipantsWithTeams(tournamentId);
  const labelByChallongeId = new Map<string, string>();
  for (const p of ours) {
    if (p.challongeParticipantId) {
      labelByChallongeId.set(
        p.challongeParticipantId,
        entrantLabel(p.teamName, p.teamTag),
      );
    }
  }

  const participants: SnapshotParticipant[] = state.data.participants.map((p) => ({
    ...p,
    name: labelByChallongeId.get(p.id) ?? p.name,
  }));

  const payload: SnapshotPayload = {
    tournament: base.tournament,
    participants,
    matches: state.data.matches,
  };
  return writeSnapshot(tournament, payload);
}

async function writeSnapshot(
  tournament: TournamentRow,
  payload: SnapshotPayload,
): Promise<LoadedSnapshot> {
  const now = new Date();
  const serialized = JSON.stringify(payload);
  await getDb()
    .insert(tournamentBrackets)
    .values({
      tournamentId: tournament.id,
      payload: serialized,
      version: tournament.version,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: tournamentBrackets.tournamentId,
      set: { payload: serialized, version: tournament.version, fetchedAt: now },
    });
  return { payload, version: tournament.version, fetchedAt: now.getTime() };
}

async function readSnapshot(
  tournamentId: string,
): Promise<LoadedSnapshot | null> {
  const rows = await getDb()
    .select()
    .from(tournamentBrackets)
    .where(eq(tournamentBrackets.tournamentId, tournamentId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  try {
    return {
      payload: JSON.parse(row.payload) as SnapshotPayload,
      version: row.version,
      fetchedAt: row.fetchedAt.getTime(),
    };
  } catch {
    return null;
  }
}

/**
 * The read path for the public page and poll route: serve the cache, rebuilding
 * from Challonge when it is stale (past the status TTL) or behind the
 * tournament's version. Always returns something renderable.
 */
export async function getOrRefreshSnapshot(
  tournament: TournamentRow,
): Promise<LoadedSnapshot> {
  const cached = await readSnapshot(tournament.id);
  if (!cached) return buildSnapshot(tournament.id);

  const ttl = SNAPSHOT_TTL_MS[tournament.status] ?? 300_000;
  const stale = Date.now() - cached.fetchedAt > ttl;
  const behind = cached.version !== tournament.version;
  if (stale || behind) return buildSnapshot(tournament.id);
  return cached;
}
