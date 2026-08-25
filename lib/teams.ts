import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { getDb } from "@/lib/db";
import {
  collegiateRegistrations,
  colleges,
  programMemberships,
  programs,
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
import { PROGRAM_COLLEGIATE_ID } from "@/lib/programs";
import { getRegistrationState } from "@/lib/registration";
import {
  TEAM_NAME_MAX,
  TEAM_ROLES,
  TEAM_TAG_MAX,
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
// Field validation
//
// Shared by the member-facing team actions (app/teams/actions.ts) and the
// staff-facing admin actions (app/admin/teams/actions.ts), so a name edited
// from either surface is cleaned and uniqueness-checked the same way.
// ---------------------------------------------------------------------------

export function cleanName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, TEAM_NAME_MAX);
}

export function cleanTag(input: string): string | null {
  const tag = input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, TEAM_TAG_MAX);
  return tag || null;
}

/** True when another live team in the program already uses this name. */
export async function nameTaken(
  name: string,
  excludeTeamId?: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.programId, PROGRAM_COLLEGIATE_ID),
        isNull(teams.disbandedAt),
        // Disbanding frees a name, so there's no unique index to lean on.
        sql`lower(${teams.name}) = ${name.toLowerCase()}`,
      ),
    );
  return rows.some((row) => row.id !== excludeTeamId);
}

/** Accepts only https URLs, so a pasted handle can't become a broken link.
    Returns null to clear the field, undefined when the input is unusable. */
export function cleanUrl(input: string): string | null | undefined {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return undefined;
    return url.toString().slice(0, 300);
  } catch {
    return undefined;
  }
}

/** Validates against the runtime's own zone database rather than a hardcoded
    list. Returns null to clear, undefined when the zone isn't recognized. */
export function cleanTimezone(input: string): string | null | undefined {
  const raw = input.trim();
  if (!raw) return null;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: raw });
    return raw.slice(0, 60);
  } catch {
    return undefined;
  }
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

/**
 * Emails allowed to bypass the one-team-per-tournament rule.
 *
 * TEST-ONLY escape hatch: a single account can flood a tournament with entries
 * to exercise the bracket, which a real member (limited to one team per
 * tournament) can't. Remove this before a public launch.
 */
const ENTRY_LIMIT_EXEMPT_EMAILS = new Set(["oscar.labit@fault.foundation"]);

export async function isEntryLimitExempt(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const email = rows[0]?.email?.toLowerCase();
  return email ? ENTRY_LIMIT_EXEMPT_EMAILS.has(email) : false;
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
  logoUrl: string | null;
  collegeName: string | null;
  /** Distinct schools across the ACTIVE roster — a team can span several. */
  schools: string[];
  role: TeamRole;
  memberCount: number;
  tournaments: string[];
  /** Only populated for roles that may hand out invites. */
  inviteToken: string | null;
};

/**
 * Distinct school names across each team's ACTIVE members, taken from every
 * member's own collegiate registration (not the team's single affiliation) —
 * players on one team can be from different places, so a team surfaces the whole
 * set. Members with no verified college contribute nothing. Returns a map keyed
 * by team id; a team with no verified members is simply absent.
 */
export async function memberSchoolsByTeam(
  teamIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!teamIds.length) return map;
  // A member's school lives on their collegiate registration, reached through
  // their program membership: team_members → program_memberships (by user) →
  // collegiate_registrations (by membership) → colleges. innerJoin on colleges
  // drops members with no college on file.
  const rows = await getDb()
    .select({ teamId: teamMembers.teamId, school: colleges.name })
    .from(teamMembers)
    .innerJoin(
      programMemberships,
      and(
        eq(programMemberships.userId, teamMembers.userId),
        eq(programMemberships.programId, PROGRAM_COLLEGIATE_ID),
      ),
    )
    .innerJoin(
      collegiateRegistrations,
      eq(collegiateRegistrations.membershipId, programMemberships.id),
    )
    .innerJoin(colleges, eq(colleges.id, collegiateRegistrations.collegeId))
    .where(
      and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.status, "active")),
    );
  for (const r of rows) {
    if (!r.school) continue;
    const list = map.get(r.teamId) ?? [];
    if (!list.includes(r.school)) list.push(r.school);
    map.set(r.teamId, list);
  }
  for (const [k, v] of map) map.set(k, v.sort((a, b) => a.localeCompare(b)));
  return map;
}

/**
 * Every live team the member is active on — the Teams tab's whole payload,
 * in the member's own order.
 *
 * `sort_order` is their drag-and-drop arrangement (reorderMyTeams); NULL means
 * "never dragged" and sorts after everything explicit, so a newly joined team
 * appears at the end rather than jumping into the middle of an arrangement
 * someone made on purpose. Alphabetical breaks the remaining ties.
 */
export async function listMyTeams(userId: string): Promise<MyTeam[]> {
  const db = getDb();
  const mine = await db
    .select({
      id: teams.id,
      name: teams.name,
      tag: teams.tag,
      logoUrl: teams.logoUrl,
      collegeName: colleges.name,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .where(and(activeMember(userId), isNull(teams.disbandedAt)))
    .orderBy(
      sql`${teamMembers.sortOrder} is null`,
      teamMembers.sortOrder,
      teams.name,
    );

  if (!mine.length) return [];
  const ids = mine.map((t) => t.id);

  const [counts, entries, invites, schoolsByTeam] = await Promise.all([
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
    memberSchoolsByTeam(ids),
  ]);

  return mine.map((team) => {
    const role = asTeamRole(team.role);
    return {
      id: team.id,
      name: team.name,
      tag: team.tag,
      logoUrl: team.logoUrl,
      collegeName: team.collegeName,
      schools: schoolsByTeam.get(team.id) ?? [],
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

export type AdminTeamRow = {
  id: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  collegeName: string | null;
  programName: string | null;
  memberCount: number;
  /** null = live; a timestamp = disbanded (soft-deleted). */
  disbandedAt: number | null;
  createdAt: number;
};

export type AdminTeamsPage = {
  teams: AdminTeamRow[];
  page: number;
  pageCount: number;
  total: number;
};

const ADMIN_TEAMS_PAGE_SIZE = 25;

/**
 * Every team, for the staff admin panel — the counterpart to `listMyTeams`
 * without the caller-membership filter. Paginated and optionally name/tag
 * searched; includes disbanded teams (a soft delete) so staff can review and
 * restore them.
 */
export async function listAllTeams(options?: {
  query?: string;
  includeDisbanded?: boolean;
  page?: number;
}): Promise<AdminTeamsPage> {
  const db = getDb();
  const q = (options?.query ?? "").trim().toLowerCase();

  const filters = [];
  if (!options?.includeDisbanded) filters.push(isNull(teams.disbandedAt));
  if (q) {
    const like = `%${q}%`;
    filters.push(
      sql`(lower(${teams.name}) like ${like} or lower(${teams.tag}) like ${like})`,
    );
  }
  const where = filters.length ? and(...filters) : undefined;

  const totalRows = await db
    .select({ count: sql<number>`count(*)`.as("count") })
    .from(teams)
    .where(where);
  const total = totalRows[0]?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_TEAMS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.trunc(options?.page ?? 1)), pageCount);

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      tag: teams.tag,
      logoUrl: teams.logoUrl,
      disbandedAt: teams.disbandedAt,
      createdAt: teams.createdAt,
      collegeName: colleges.name,
      programName: programs.name,
    })
    .from(teams)
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .leftJoin(programs, eq(programs.id, teams.programId))
    .where(where)
    .orderBy(teams.name)
    .limit(ADMIN_TEAMS_PAGE_SIZE)
    .offset((page - 1) * ADMIN_TEAMS_PAGE_SIZE);

  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await db
        .select({
          teamId: teamMembers.teamId,
          count: sql<number>`count(*)`.as("count"),
        })
        .from(teamMembers)
        .where(
          and(inArray(teamMembers.teamId, ids), eq(teamMembers.status, "active")),
        )
        .groupBy(teamMembers.teamId)
    : [];

  return {
    teams: rows.map((team) => ({
      id: team.id,
      name: team.name,
      tag: team.tag,
      logoUrl: team.logoUrl,
      collegeName: team.collegeName,
      programName: team.programName,
      memberCount: counts.find((c) => c.teamId === team.id)?.count ?? 0,
      disbandedAt: team.disbandedAt?.getTime() ?? null,
      createdAt: team.createdAt.getTime(),
    })),
    page,
    pageCount,
    total,
  };
}

export type RosterMember = {
  membershipId: string;
  userId: string;
  name: string;
  /** Profile picture, or null for the initials placeholder. */
  image: string | null;
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
  logoUrl: string | null;
  collegeName: string | null;
  programId: string;
  gameId: string | null;
  /** null for a live team; a timestamp for a disbanded one (only reachable
      with `includeDisbanded`, which the admin panel passes). */
  disbandedAt: number | null;
  /** Distinct schools across the active roster (members can be from several). */
  schools: string[];
  roster: RosterMember[];
  invites: TeamInviteView[];
  inviteLinkToken: string | null;
  entries: TeamTournamentEntry[];
  openTournaments: { id: string; name: string }[];
  deleteRequest: DeleteRequestView | null;
};

/**
 * Everything the team management page renders, in one call. Returns null for a
 * missing team, and for a disbanded one unless `includeDisbanded` is set — the
 * member page 404s on both, while the admin panel passes `includeDisbanded` so
 * staff can view (and restore) a disbanded team.
 */
export async function getTeamDetail(
  teamId: string,
  options?: { includeDisbanded?: boolean },
): Promise<TeamDetail | null> {
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
      logoUrl: teams.logoUrl,
      programId: teams.programId,
      gameId: teams.gameId,
      disbandedAt: teams.disbandedAt,
      collegeName: colleges.name,
    })
    .from(teams)
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .where(
      options?.includeDisbanded
        ? eq(teams.id, teamId)
        : and(eq(teams.id, teamId), isNull(teams.disbandedAt)),
    )
    .limit(1);
  const team = teamRows[0];
  if (!team) return null;

  const [rosterRows, inviteRows, entryRows, openRows, requestRows, schoolsMap] =
    await Promise.all([
      db
        .select({
          membershipId: teamMembers.id,
          userId: teamMembers.userId,
          name: user.name,
          image: user.image,
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
      memberSchoolsByTeam([teamId]),
    ]);

  const roster: RosterMember[] = rosterRows
    .map((r) => ({
      membershipId: r.membershipId,
      userId: r.userId,
      name: r.name,
      image: r.image,
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
    disbandedAt: team.disbandedAt?.getTime() ?? null,
    schools: schoolsMap.get(teamId) ?? [],
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

// Score reporting and the team's match schedule used to live here, reading the
// self-hosted `matches` / `match_games` tables. Those are gone — Challonge owns
// matches and scoring now — so there is no listReportableMatches: the bracket
// and results are read from the Challonge snapshot (lib/tournaments.ts) on the
// public page, and results are entered staff-side in the admin tournament view.
