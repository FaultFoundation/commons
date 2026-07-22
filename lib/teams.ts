import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { getDb } from "@/lib/db";
import {
  colleges,
  matchGames,
  matches,
  teamDeleteRequests,
  teamDeleteVotes,
  teamInvites,
  teamMembers,
  teams,
  tournamentParticipants,
  tournaments,
  user,
  platformIdentities,
} from "@/db/schema";
import { getRegistrationState } from "@/lib/registration";
import {
  TEAM_ROLES,
  asTeamRole,
  can,
  type TeamCapability,
  type TeamRole,
} from "@/lib/teams-shared";

// ---------------------------------------------------------------------------
// Team reads + the rules that don't belong in any single action.
//
// Permissions are always re-derived from D1 here (never trusted from the
// client), and every query filters out disbanded teams, inactive memberships,
// and withdrawn tournament entries — those three predicates are what make a
// soft delete actually behave like a delete.
// ---------------------------------------------------------------------------

/** Only active memberships of live teams count for anything. */
const activeMember = (userId: string) =>
  and(eq(teamMembers.userId, userId), eq(teamMembers.status, "active"));

// ---------------------------------------------------------------------------
// Invite tokens
// ---------------------------------------------------------------------------

// URL-safe and unambiguous when read aloud or retyped: no 0/O/1/I/l.
const TOKEN_ALPHABET =
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 22;

/**
 * ~131 bits of entropy — invite links are bearer credentials with no rate
 * limit in front of them, so they're sized to be unguessable rather than
 * hand-typed (that's what the verification code in lib/registration.ts is).
 * Same rejection-sampling shape as `generateCode` there, to avoid modulo bias.
 */
export function generateInviteToken(): string {
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  let token = "";
  while (token.length < TOKEN_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH * 2));
    for (const b of bytes) {
      if (b < limit && token.length < TOKEN_LENGTH) {
        token += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
      }
    }
  }
  return token;
}

export type InviteProblem = "revoked" | "expired" | "exhausted";

/** Why an invite can't be redeemed right now, or null when it's good. */
export function inviteProblem(
  invite: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
  },
  now: number = Date.now(),
): InviteProblem | null {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt.getTime() <= now) return "expired";
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    return "exhausted";
  }
  return null;
}

export const INVITE_PROBLEM_MESSAGES: Record<InviteProblem, string> = {
  revoked: "That invite has been revoked. Ask the team for a fresh link.",
  expired: "That invite has expired. Ask the team for a fresh link.",
  exhausted: "That invite has been used up. Ask the team for a fresh link.",
};

/** The team's current shareable link (newest usable `kind = "link"` row). */
export async function getActiveInviteLink(teamId: string) {
  const rows = await getDb()
    .select()
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.teamId, teamId),
        eq(teamInvites.kind, "link"),
        isNull(teamInvites.revokedAt),
      ),
    )
    .orderBy(sql`${teamInvites.createdAt} desc`);
  return rows.find((row) => !inviteProblem(row)) ?? null;
}

export async function getInviteByToken(token: string) {
  const rows = await getDb()
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.token, token))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Membership + capability checks
// ---------------------------------------------------------------------------

/** The viewer's active membership on a live team, or null. */
export async function getTeamMembership(userId: string, teamId: string) {
  const rows = await getDb()
    .select({
      id: teamMembers.id,
      role: teamMembers.role,
      position: teamMembers.position,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        activeMember(userId),
        isNull(teams.disbandedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? { ...row, role: asTeamRole(row.role) } : null;
}

export type CapabilityCheck =
  | { ok: true; role: TeamRole; membershipId: string }
  | { ok: false; error: string };

/**
 * The gate every mutating team action opens with. Deliberately answers
 * "not on this team" and "not allowed to do this" with different messages —
 * the first is usually a stale tab, the second is a real permission problem.
 */
export async function requireTeamCapability(
  userId: string,
  teamId: string,
  capability: TeamCapability,
): Promise<CapabilityCheck> {
  const membership = await getTeamMembership(userId, teamId);
  if (!membership) {
    return { ok: false, error: "You're not on this team." };
  }
  if (!can(membership.role, capability)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, role: membership.role, membershipId: membership.id };
}

/** Active managers of a team — the electorate for a delete request. */
export async function getManagerUserIds(teamId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.status, "active"),
        eq(teamMembers.role, "manager"),
      ),
    );
  return rows.map((r) => r.userId);
}

/** Creating and joining teams is members-only (see the plan's eligibility). */
export async function isVerifiedMember(userId: string): Promise<boolean> {
  const reg = await getRegistrationState(userId);
  return reg?.status === "VERIFIED";
}

/**
 * A human region label for a college — "California, United States", or just
 * the country when the directory has no state for it. Used to prefill a new
 * team's region: the school is the one location fact we've already verified,
 * so nobody has to be asked for it again.
 */
export async function getCollegeRegion(
  collegeId: string | null | undefined,
): Promise<string | null> {
  if (!collegeId) return null;
  const rows = await getDb()
    .select({
      country: colleges.country,
      stateProvince: colleges.stateProvince,
    })
    .from(colleges)
    .where(eq(colleges.id, collegeId))
    .limit(1);
  const college = rows[0];
  if (!college?.country) return college?.stateProvince ?? null;
  return college.stateProvince
    ? `${college.stateProvince}, ${college.country}`
    : college.country;
}

// ---------------------------------------------------------------------------
// The one-team-per-tournament rule
//
// A member may sit on any number of rosters, but never on two teams entered in
// the same tournament. Both directions of that check live here so the join
// flow and the tournament-entry flow can't drift apart.
// ---------------------------------------------------------------------------

export type TournamentConflict = { tournamentName: string; teamName: string };

/**
 * Tournaments that would end up with `userId` on two rosters if they joined
 * `teamId`. Empty means the join is clean.
 */
export async function joinConflicts(
  userId: string,
  teamId: string,
): Promise<TournamentConflict[]> {
  const otherEntry = alias(tournamentParticipants, "other_entry");
  const otherTeam = alias(teams, "other_team");
  const otherMembership = alias(teamMembers, "other_membership");

  return getDb()
    .select({
      tournamentName: tournaments.name,
      teamName: otherTeam.name,
    })
    .from(tournamentParticipants)
    .innerJoin(
      tournaments,
      eq(tournaments.id, tournamentParticipants.tournamentId),
    )
    .innerJoin(
      otherEntry,
      and(
        eq(otherEntry.tournamentId, tournamentParticipants.tournamentId),
        isNull(otherEntry.withdrawnAt),
        ne(otherEntry.teamId, teamId),
      ),
    )
    .innerJoin(otherTeam, eq(otherTeam.id, otherEntry.teamId))
    .innerJoin(
      otherMembership,
      and(
        eq(otherMembership.teamId, otherEntry.teamId),
        eq(otherMembership.userId, userId),
        eq(otherMembership.status, "active"),
      ),
    )
    .where(
      and(
        eq(tournamentParticipants.teamId, teamId),
        isNull(tournamentParticipants.withdrawnAt),
        isNull(otherTeam.disbandedAt),
      ),
    );
}

export type EntryConflict = { playerName: string; teamName: string };

/**
 * Rostered players who are already entered in `tournamentId` on another team.
 * Returned with names so the UI can say exactly who is blocking the entry
 * instead of a bare "conflict".
 */
export async function entryConflicts(
  teamId: string,
  tournamentId: string,
): Promise<EntryConflict[]> {
  const otherMembership = alias(teamMembers, "other_membership");
  const otherTeam = alias(teams, "other_team");
  const otherEntry = alias(tournamentParticipants, "other_entry");

  return getDb()
    .select({ playerName: user.name, teamName: otherTeam.name })
    .from(teamMembers)
    .innerJoin(user, eq(user.id, teamMembers.userId))
    .innerJoin(
      otherMembership,
      and(
        eq(otherMembership.userId, teamMembers.userId),
        eq(otherMembership.status, "active"),
        ne(otherMembership.teamId, teamId),
      ),
    )
    .innerJoin(
      otherTeam,
      and(eq(otherTeam.id, otherMembership.teamId), isNull(otherTeam.disbandedAt)),
    )
    .innerJoin(
      otherEntry,
      and(
        eq(otherEntry.teamId, otherMembership.teamId),
        eq(otherEntry.tournamentId, tournamentId),
        isNull(otherEntry.withdrawnAt),
      ),
    )
    .where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "active")),
    );
}

// ---------------------------------------------------------------------------
// Page reads
// ---------------------------------------------------------------------------

export type MyTeam = {
  id: string;
  name: string;
  tag: string | null;
  collegeName: string | null;
  role: TeamRole;
  memberCount: number;
  tournaments: string[];
  /** Only populated for roles that may hand out invites. */
  inviteToken: string | null;
};

/** Every live team the member is active on — the Teams tab's whole payload. */
export async function listMyTeams(userId: string): Promise<MyTeam[]> {
  const db = getDb();
  const mine = await db
    .select({
      id: teams.id,
      name: teams.name,
      tag: teams.tag,
      collegeName: colleges.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .where(and(activeMember(userId), isNull(teams.disbandedAt)))
    .orderBy(teams.name);

  if (!mine.length) return [];
  const ids = mine.map((t) => t.id);

  const [counts, entries, invites] = await Promise.all([
    db
      .select({
        teamId: teamMembers.teamId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(teamMembers)
      .where(
        and(inArray(teamMembers.teamId, ids), eq(teamMembers.status, "active")),
      )
      .groupBy(teamMembers.teamId),
    db
      .select({
        teamId: tournamentParticipants.teamId,
        name: tournaments.name,
      })
      .from(tournamentParticipants)
      .innerJoin(
        tournaments,
        eq(tournaments.id, tournamentParticipants.tournamentId),
      )
      .where(
        and(
          inArray(tournamentParticipants.teamId, ids),
          isNull(tournamentParticipants.withdrawnAt),
        ),
      ),
    db
      .select({
        teamId: teamInvites.teamId,
        token: teamInvites.token,
        revokedAt: teamInvites.revokedAt,
        expiresAt: teamInvites.expiresAt,
        maxUses: teamInvites.maxUses,
        useCount: teamInvites.useCount,
        createdAt: teamInvites.createdAt,
      })
      .from(teamInvites)
      .where(
        and(
          inArray(teamInvites.teamId, ids),
          eq(teamInvites.kind, "link"),
          isNull(teamInvites.revokedAt),
        ),
      )
      .orderBy(sql`${teamInvites.createdAt} desc`),
  ]);

  return mine.map((team) => {
    const role = asTeamRole(team.role);
    return {
      id: team.id,
      name: team.name,
      tag: team.tag,
      collegeName: team.collegeName,
      role,
      memberCount: counts.find((c) => c.teamId === team.id)?.count ?? 0,
      tournaments: entries
        .filter((e) => e.teamId === team.id)
        .map((e) => e.name),
      inviteToken: can(role, "manageInvites")
        ? (invites.find((i) => i.teamId === team.id && !inviteProblem(i))
            ?.token ?? null)
        : null,
    };
  });
}

export type RosterMember = {
  membershipId: string;
  userId: string;
  name: string;
  role: TeamRole;
  position: string | null;
  discordHandle: string | null;
  joinedAt: number;
};

export type TeamInviteView = {
  id: string;
  token: string;
  kind: string;
  role: TeamRole;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: number | null;
};

export type TeamTournamentEntry = {
  participantId: string;
  tournamentId: string;
  tournamentName: string;
  status: string;
  wins: number;
  losses: number;
  mapDiff: number;
  points: number;
};

export type DeleteRequestView = {
  id: string;
  reason: string | null;
  requestedByName: string | null;
  createdAt: number;
  expiresAt: number | null;
  votes: { userId: string; name: string; decision: string }[];
  /** Managers who haven't voted yet. */
  pending: { userId: string; name: string }[];
};

export type TeamDetail = {
  id: string;
  name: string;
  tag: string | null;
  description: string | null;
  region: string | null;
  timezone: string | null;
  discordInviteUrl: string | null;
  collegeName: string | null;
  programId: string;
  gameId: string | null;
  roster: RosterMember[];
  invites: TeamInviteView[];
  inviteLinkToken: string | null;
  entries: TeamTournamentEntry[];
  openTournaments: { id: string; name: string }[];
  deleteRequest: DeleteRequestView | null;
};

/**
 * Everything the team management page renders, in one call. Returns null for
 * a missing or disbanded team; the page 404s on that and on non-membership.
 */
export async function getTeamDetail(teamId: string): Promise<TeamDetail | null> {
  const db = getDb();
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      tag: teams.tag,
      description: teams.description,
      region: teams.region,
      timezone: teams.timezone,
      discordInviteUrl: teams.discordInviteUrl,
      programId: teams.programId,
      gameId: teams.gameId,
      collegeName: colleges.name,
    })
    .from(teams)
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .where(and(eq(teams.id, teamId), isNull(teams.disbandedAt)))
    .limit(1);
  const team = teamRows[0];
  if (!team) return null;

  const [rosterRows, inviteRows, entryRows, openRows, requestRows] =
    await Promise.all([
      db
        .select({
          membershipId: teamMembers.id,
          userId: teamMembers.userId,
          name: user.name,
          role: teamMembers.role,
          position: teamMembers.position,
          joinedAt: teamMembers.joinedAt,
          discordHandle: platformIdentities.handle,
        })
        .from(teamMembers)
        .innerJoin(user, eq(user.id, teamMembers.userId))
        // The mirrored Discord handle (lib/platform-identities.ts) — the roster
        // is where teammates actually go looking for each other.
        .leftJoin(
          platformIdentities,
          and(
            eq(platformIdentities.userId, teamMembers.userId),
            eq(platformIdentities.provider, "discord"),
          ),
        )
        .where(
          and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "active")),
        ),
      db
        .select()
        .from(teamInvites)
        .where(
          and(eq(teamInvites.teamId, teamId), isNull(teamInvites.revokedAt)),
        )
        .orderBy(sql`${teamInvites.createdAt} desc`),
      db
        .select({
          participantId: tournamentParticipants.id,
          tournamentId: tournaments.id,
          tournamentName: tournaments.name,
          status: tournaments.status,
          wins: tournamentParticipants.wins,
          losses: tournamentParticipants.losses,
          mapDiff: tournamentParticipants.mapDiff,
          points: tournamentParticipants.points,
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
        ),
      db
        .select({ id: tournaments.id, name: tournaments.name })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.programId, team.programId),
            eq(tournaments.status, "registration"),
          ),
        ),
      db
        .select({
          id: teamDeleteRequests.id,
          reason: teamDeleteRequests.reason,
          createdAt: teamDeleteRequests.createdAt,
          expiresAt: teamDeleteRequests.expiresAt,
          requestedByName: user.name,
        })
        .from(teamDeleteRequests)
        .leftJoin(user, eq(user.id, teamDeleteRequests.requestedByUserId))
        .where(
          and(
            eq(teamDeleteRequests.teamId, teamId),
            eq(teamDeleteRequests.status, "open"),
          ),
        )
        .limit(1),
    ]);

  const roster: RosterMember[] = rosterRows
    .map((r) => ({
      membershipId: r.membershipId,
      userId: r.userId,
      name: r.name,
      role: asTeamRole(r.role),
      position: r.position,
      discordHandle: r.discordHandle,
      joinedAt: r.joinedAt.getTime(),
    }))
    // Most privileged first, then alphabetical — cheaper and clearer than a
    // CASE expression in SQL.
    .sort(
      (a, b) =>
        TEAM_ROLES.indexOf(a.role) - TEAM_ROLES.indexOf(b.role) ||
        a.name.localeCompare(b.name),
    );

  const usableInvites = inviteRows.filter((row) => !inviteProblem(row));
  const enteredIds = new Set(entryRows.map((e) => e.tournamentId));

  let deleteRequest: DeleteRequestView | null = null;
  const request = requestRows[0];
  if (request) {
    const [voteRows, managerIds] = await Promise.all([
      db
        .select({
          userId: teamDeleteVotes.userId,
          decision: teamDeleteVotes.decision,
          name: user.name,
        })
        .from(teamDeleteVotes)
        .innerJoin(user, eq(user.id, teamDeleteVotes.userId))
        .where(eq(teamDeleteVotes.requestId, request.id)),
      getManagerUserIds(teamId),
    ]);
    const voted = new Set(voteRows.map((v) => v.userId));
    deleteRequest = {
      id: request.id,
      reason: request.reason,
      requestedByName: request.requestedByName,
      createdAt: request.createdAt.getTime(),
      expiresAt: request.expiresAt?.getTime() ?? null,
      votes: voteRows,
      pending: managerIds
        .filter((id) => !voted.has(id))
        .map((id) => ({
          userId: id,
          name: roster.find((m) => m.userId === id)?.name ?? "A manager",
        })),
    };
  }

  return {
    ...team,
    roster,
    invites: usableInvites.map((i) => ({
      id: i.id,
      token: i.token,
      kind: i.kind,
      role: asTeamRole(i.role),
      note: i.note,
      maxUses: i.maxUses,
      useCount: i.useCount,
      expiresAt: i.expiresAt?.getTime() ?? null,
    })),
    inviteLinkToken:
      usableInvites.find((i) => i.kind === "link")?.token ?? null,
    entries: entryRows,
    openTournaments: openRows.filter((t) => !enteredIds.has(t.id)),
    deleteRequest,
  };
}

// ---------------------------------------------------------------------------
// Matches a team can report on
// ---------------------------------------------------------------------------

export type ReportableGame = {
  gameNumber: number;
  mapName: string | null;
  aScore: number;
  bScore: number;
  replayCode: string | null;
};

export type ReportableMatch = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  round: number | null;
  bestOf: number;
  status: string;
  /** Always this team's side of the match, so the form can label the inputs. */
  ourParticipantId: string;
  opponentName: string;
  /** True when this team is participant A (score column order). */
  weAreA: boolean;
  games: ReportableGame[];
};

/**
 * Every match this team is in, with any scores already on record. The score
 * reporter is a client component that switches tournament → match without a
 * round trip, so it gets the whole (small) set up front.
 */
export async function listReportableMatches(
  teamId: string,
): Promise<ReportableMatch[]> {
  const db = getDb();
  const ourEntries = await db
    .select({ id: tournamentParticipants.id })
    .from(tournamentParticipants)
    .where(
      and(
        eq(tournamentParticipants.teamId, teamId),
        isNull(tournamentParticipants.withdrawnAt),
      ),
    );
  if (!ourEntries.length) return [];
  const ourIds = ourEntries.map((e) => e.id);

  const pa = alias(tournamentParticipants, "pa");
  const pb = alias(tournamentParticipants, "pb");
  const ta = alias(teams, "ta");
  const tb = alias(teams, "tb");

  const rows = await db
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      tournamentName: tournaments.name,
      round: matches.round,
      bestOf: matches.bestOf,
      status: matches.status,
      participantAId: matches.participantAId,
      participantBId: matches.participantBId,
      aName: ta.name,
      bName: tb.name,
    })
    .from(matches)
    .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
    .leftJoin(pa, eq(pa.id, matches.participantAId))
    .leftJoin(pb, eq(pb.id, matches.participantBId))
    .leftJoin(ta, eq(ta.id, pa.teamId))
    .leftJoin(tb, eq(tb.id, pb.teamId))
    .where(
      or(
        inArray(matches.participantAId, ourIds),
        inArray(matches.participantBId, ourIds),
      ),
    )
    .orderBy(matches.round);

  if (!rows.length) return [];

  const gameRows = await db
    .select()
    .from(matchGames)
    .where(
      inArray(
        matchGames.matchId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(matchGames.gameNumber);

  return rows.map((row) => {
    const weAreA = row.participantAId != null && ourIds.includes(row.participantAId);
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      tournamentName: row.tournamentName,
      round: row.round,
      bestOf: row.bestOf,
      status: row.status,
      ourParticipantId: (weAreA ? row.participantAId : row.participantBId) ?? "",
      opponentName: (weAreA ? row.bName : row.aName) ?? "TBD",
      weAreA,
      games: gameRows
        .filter((g) => g.matchId === row.id)
        .map((g) => ({
          gameNumber: g.gameNumber,
          mapName: g.mapName,
          aScore: g.participantAScore,
          bScore: g.participantBScore,
          replayCode: g.replayCode,
        })),
    };
  });
}
