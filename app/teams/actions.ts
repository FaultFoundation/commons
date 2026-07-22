"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  teamDeleteRequests,
  teamDeleteVotes,
  teamInvites,
  teamListings,
  teamMembers,
  teams,
  tournamentParticipants,
  tournaments,
} from "@/db/schema";
import { GAME_OVERWATCH_ID, PROGRAM_COLLEGIATE_ID } from "@/lib/programs";
import { getRegistrationState } from "@/lib/registration";
import { reportMatchScore, type GameScoreInput } from "@/lib/scoring";
import {
  INVITE_PROBLEM_MESSAGES,
  entryConflicts,
  generateInviteToken,
  getCollegeRegion,
  getInviteByToken,
  getManagerUserIds,
  getTeamMembership,
  inviteProblem,
  isVerifiedMember,
  joinConflicts,
  requireTeamCapability,
} from "@/lib/teams";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
  asTeamRole,
  assignableRoles,
  outranks,
  type TeamRole,
} from "@/lib/teams-shared";

// ---------------------------------------------------------------------------
// Server actions for teams. Same contract as the registration actions: every
// action re-checks the session, re-derives permissions from D1 (client state is
// presentation only), and returns a plain serializable result — nothing throws
// across the boundary.
//
// Multi-statement writes go through `db.batch`; D1 rejects the raw BEGIN that
// drizzle's `transaction()` emits.
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const DELETE_REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function requireUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** Portal pages are force-dynamic, but the banner and tab reads are cached
    per layout — refresh both after anything that changes team state. */
function revalidateTeams(teamId?: string) {
  revalidatePath("/teams/", "layout");
  revalidatePath("/home/", "layout");
  if (teamId) revalidatePath(`/teams/${teamId}/`, "layout");
}

// ---------------------------------------------------------------------------
// Field validation
// ---------------------------------------------------------------------------

function cleanName(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, TEAM_NAME_MAX);
}

function cleanTag(input: string): string | null {
  const tag = input.trim().toUpperCase().replace(/\s+/g, "").slice(0, TEAM_TAG_MAX);
  return tag || null;
}

/** True when another live team in the program already uses this name. */
async function nameTaken(name: string, excludeTeamId?: string): Promise<boolean> {
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

/** Accepts only https URLs, so a pasted handle can't become a broken link. */
function cleanUrl(input: string): string | null | undefined {
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

/** Validates against the runtime's own zone database rather than a hardcoded list. */
function cleanTimezone(input: string): string | null | undefined {
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
// Create / settings
// ---------------------------------------------------------------------------

export async function createTeam(input: {
  name: string;
  tag?: string;
  /** The browser's own IANA zone — the only reliable read on where the
      creator actually plays. Validated here like any other input. */
  timezone?: string;
}): Promise<ActionResult<{ teamId: string; token: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };
  if (!(await isVerifiedMember(userId))) {
    return {
      ok: false,
      error: "Verify your academic email before creating a team.",
    };
  }

  const name = cleanName(input.name ?? "");
  if (name.length < 2) return { ok: false, error: "Enter a team name." };
  if (await nameTaken(name)) {
    return { ok: false, error: "A team with that name already exists." };
  }

  const db = getDb();
  const now = new Date();
  const teamId = crypto.randomUUID();
  const token = generateInviteToken();
  // The creator's verified school affiliates the team and names its region;
  // the browser supplies the timezone. Both are prefills, editable after.
  const reg = await getRegistrationState(userId);
  const region = await getCollegeRegion(reg?.collegeId);
  const timezone = cleanTimezone(input.timezone ?? "");

  await db.batch([
    db.insert(teams).values({
      id: teamId,
      programId: PROGRAM_COLLEGIATE_ID,
      gameId: GAME_OVERWATCH_ID,
      collegeId: reg?.collegeId ?? null,
      name,
      tag: cleanTag(input.tag ?? ""),
      region,
      // `undefined` means the browser sent something unusable — store nothing
      // rather than failing the creation over a cosmetic field.
      timezone: timezone ?? null,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId,
      role: "manager",
      status: "active",
      joinedAt: now,
    }),
    // The invite link exists from the first moment, so "create a team" and
    // "invite your players" really is two clicks.
    db.insert(teamInvites).values({
      id: crypto.randomUUID(),
      teamId,
      token,
      kind: "link",
      role: "player",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  revalidateTeams(teamId);
  return { ok: true, teamId, token };
}

export async function updateTeamSettings(
  teamId: string,
  patch: {
    name?: string;
    tag?: string;
    description?: string;
    region?: string;
    timezone?: string;
    discordInviteUrl?: string;
  },
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "editSettings");
  if (!check.ok) return check;

  const fields: Record<string, string | null> = {};

  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (name.length < 2) return { ok: false, error: "Enter a team name." };
    if (await nameTaken(name, teamId)) {
      return { ok: false, error: "A team with that name already exists." };
    }
    fields.name = name;
  }
  if (patch.tag !== undefined) fields.tag = cleanTag(patch.tag);
  if (patch.description !== undefined) {
    fields.description =
      patch.description.trim().slice(0, TEAM_DESCRIPTION_MAX) || null;
  }
  if (patch.region !== undefined) {
    fields.region = patch.region.trim().slice(0, 40) || null;
  }
  if (patch.timezone !== undefined) {
    const timezone = cleanTimezone(patch.timezone);
    if (timezone === undefined) {
      return { ok: false, error: "That isn't a timezone we recognize." };
    }
    fields.timezone = timezone;
  }
  if (patch.discordInviteUrl !== undefined) {
    const url = cleanUrl(patch.discordInviteUrl);
    if (url === undefined) {
      return { ok: false, error: "Enter a full https:// Discord invite link." };
    }
    fields.discordInviteUrl = url;
  }

  if (!Object.keys(fields).length) return { ok: true };

  await getDb()
    .update(teams)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(teams.id, teamId));

  revalidateTeams(teamId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

/** Revokes the current shareable link and mints a replacement. */
export async function rotateInviteLink(
  teamId: string,
): Promise<ActionResult<{ token: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "manageInvites");
  if (!check.ok) return check;

  const db = getDb();
  const now = new Date();
  const token = generateInviteToken();

  await db.batch([
    db
      .update(teamInvites)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(teamInvites.teamId, teamId),
          eq(teamInvites.kind, "link"),
          isNull(teamInvites.revokedAt),
        ),
      ),
    db.insert(teamInvites).values({
      id: crypto.randomUUID(),
      teamId,
      token,
      kind: "link",
      role: "player",
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  revalidateTeams(teamId);
  return { ok: true, token };
}

export async function createTargetedInvite(
  teamId: string,
  input: { role: string; note?: string; expiresInDays?: number },
): Promise<ActionResult<{ token: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "manageInvites");
  if (!check.ok) return check;

  const role = asTeamRole(input.role);
  if (!assignableRoles(check.role).includes(role)) {
    return { ok: false, error: `You can't invite someone as a ${role}.` };
  }

  const days = Math.trunc(input.expiresInDays ?? 7);
  const token = generateInviteToken();
  await getDb()
    .insert(teamInvites)
    .values({
      id: crypto.randomUUID(),
      teamId,
      token,
      kind: "targeted",
      role,
      note: (input.note ?? "").trim().slice(0, 80) || null,
      createdByUserId: userId,
      // Single-use by design: a targeted invite carries a role, so it must not
      // become a second, quietly privileged shareable link.
      maxUses: 1,
      expiresAt:
        days > 0 && days <= 90
          ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
          : null,
    });

  revalidateTeams(teamId);
  return { ok: true, token };
}

export async function revokeInvite(
  teamId: string,
  inviteId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "manageInvites");
  if (!check.ok) return check;

  const now = new Date();
  await getDb()
    .update(teamInvites)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(teamInvites.id, inviteId), eq(teamInvites.teamId, teamId)))
    .returning({ id: teamInvites.id });

  revalidateTeams(teamId);
  return { ok: true };
}

/**
 * Joins the team behind an invite token. Also the rejoin path: a member who
 * left has an inactive row, which the team/user unique index means we must
 * reactivate rather than insert alongside.
 */
export async function redeemInvite(
  token: string,
): Promise<ActionResult<{ teamId: string; alreadyMember?: boolean }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };
  if (!(await isVerifiedMember(userId))) {
    return {
      ok: false,
      error: "Verify your academic email before joining a team.",
    };
  }

  const invite = await getInviteByToken((token ?? "").trim());
  if (!invite) return { ok: false, error: "That invite link isn't valid." };

  const problem = inviteProblem(invite);
  if (problem) return { ok: false, error: INVITE_PROBLEM_MESSAGES[problem] };

  const db = getDb();
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(and(eq(teams.id, invite.teamId), isNull(teams.disbandedAt)))
    .limit(1);
  const team = teamRows[0];
  if (!team) return { ok: false, error: "That team no longer exists." };

  const existing = (
    await db
      .select({ id: teamMembers.id, status: teamMembers.status })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, userId)),
      )
      .limit(1)
  )[0];
  if (existing?.status === "active") {
    return { ok: true, teamId: team.id, alreadyMember: true };
  }

  // One team per tournament: joining can't put someone on two entered rosters.
  const conflicts = await joinConflicts(userId, team.id);
  if (conflicts.length) {
    const first = conflicts[0];
    return {
      ok: false,
      error: `You're already entered in ${first.tournamentName} with ${first.teamName}. Leave that team first.`,
    };
  }

  const now = new Date();
  const role = asTeamRole(invite.role);
  await db.batch([
    existing
      ? db
          .update(teamMembers)
          .set({ role, status: "active", joinedAt: now, leftAt: null })
          .where(eq(teamMembers.id, existing.id))
      : db.insert(teamMembers).values({
          id: crypto.randomUUID(),
          teamId: team.id,
          userId,
          role,
          status: "active",
          joinedAt: now,
        }),
    db
      .update(teamInvites)
      .set({ useCount: sql`${teamInvites.useCount} + 1`, updatedAt: now })
      .where(eq(teamInvites.id, invite.id)),
  ]);

  revalidateTeams(team.id);
  return { ok: true, teamId: team.id };
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

/** The team's own manager count — the last one can't be demoted or removed. */
async function isLastManager(teamId: string, userId: string): Promise<boolean> {
  const managers = await getManagerUserIds(teamId);
  return managers.length === 1 && managers[0] === userId;
}

async function getMembership(teamId: string, membershipId: string) {
  const rows = await getDb()
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      status: teamMembers.status,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, membershipId), eq(teamMembers.teamId, teamId)))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, role: asTeamRole(row.role) } : null;
}

export async function changeMemberRole(
  teamId: string,
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "manageRoster");
  if (!check.ok) return check;

  const nextRole: TeamRole = asTeamRole(role);
  if (!assignableRoles(check.role).includes(nextRole)) {
    return { ok: false, error: `You can't make someone a ${nextRole}.` };
  }

  const target = await getMembership(teamId, membershipId);
  if (!target || target.status !== "active") {
    return { ok: false, error: "That member isn't on the team." };
  }
  if (outranks(target.role, check.role)) {
    return { ok: false, error: "You can't change a manager's role." };
  }
  if (target.role === nextRole) return { ok: true };
  if (nextRole !== "manager" && (await isLastManager(teamId, target.userId))) {
    return {
      ok: false,
      error: "Promote another manager first — a team needs at least one.",
    };
  }

  await getDb()
    .update(teamMembers)
    .set({ role: nextRole })
    .where(eq(teamMembers.id, membershipId));

  revalidateTeams(teamId);
  return { ok: true };
}

export async function removeMember(
  teamId: string,
  membershipId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "manageRoster");
  if (!check.ok) return check;

  const target = await getMembership(teamId, membershipId);
  if (!target || target.status !== "active") {
    return { ok: false, error: "That member isn't on the team." };
  }
  if (target.userId === userId) {
    return { ok: false, error: "Use Leave Team to remove yourself." };
  }
  if (outranks(target.role, check.role)) {
    return { ok: false, error: "You can't remove a manager." };
  }
  if (await isLastManager(teamId, target.userId)) {
    return { ok: false, error: "A team needs at least one manager." };
  }

  // Leaving keeps the row so history (and a later rejoin) survives.
  await getDb()
    .update(teamMembers)
    .set({ status: "inactive", leftAt: new Date() })
    .where(eq(teamMembers.id, membershipId));

  revalidateTeams(teamId);
  return { ok: true };
}

export async function leaveTeam(teamId: string): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const membership = await getTeamMembership(userId, teamId);
  if (!membership) return { ok: false, error: "You're not on this team." };

  const db = getDb();
  const activeCount = (
    await db
      .select({ count: sql<number>`count(*)`.as("count") })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "active")),
      )
  )[0].count;

  if (await isLastManager(teamId, userId)) {
    // Sole manager of a team with other people on it: someone has to be left
    // holding the keys. Alone, leaving is just disbanding.
    if (activeCount > 1) {
      return {
        ok: false,
        error: "Promote another manager before you leave, or delete the team.",
      };
    }
    await disbandTeam(teamId);
    revalidateTeams(teamId);
    return { ok: true };
  }

  await db
    .update(teamMembers)
    .set({ status: "inactive", leftAt: new Date() })
    .where(eq(teamMembers.id, membership.id));

  revalidateTeams(teamId);
  return { ok: true };
}

/**
 * Store the member's own arrangement of their team cards (drag-and-drop, or the
 * Move up / Move down buttons — same path either way).
 *
 * Purely presentational, so there's no capability to check: `sort_order` lives
 * on the caller's own membership rows and can't affect what anyone else sees.
 * The client's list is still only a *hint* — ids are intersected with the
 * memberships actually read back from D1, so a tampered payload can at worst
 * reorder teams the caller is already on.
 */
export async function reorderMyTeams(teamIds: string[]): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const db = getDb();
  const mine = await db
    .select({ id: teamMembers.id, teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.status, "active")));

  const membershipByTeam = new Map(mine.map((row) => [row.teamId, row.id]));
  const ordered = teamIds
    .map((teamId) => membershipByTeam.get(teamId))
    .filter((id): id is string => Boolean(id));

  if (!ordered.length) return { ok: true };

  const [first, ...rest] = ordered.map((membershipId, index) =>
    db
      .update(teamMembers)
      .set({ sortOrder: index })
      .where(eq(teamMembers.id, membershipId)),
  );

  // One batch, not transaction(): D1 rejects the raw BEGIN drizzle emits.
  // Destructured rather than passed as an array — batch() wants a non-empty
  // tuple, which a .map() result can't prove it is.
  await db.batch([first, ...rest]);

  revalidateTeams();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tournament entry
// ---------------------------------------------------------------------------

export async function enterTournament(
  teamId: string,
  tournamentId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "enterTournaments");
  if (!check.ok) return check;

  const db = getDb();
  const teamRows = await db
    .select({ programId: teams.programId })
    .from(teams)
    .where(and(eq(teams.id, teamId), isNull(teams.disbandedAt)))
    .limit(1);
  if (!teamRows[0]) return { ok: false, error: "That team no longer exists." };

  const tournamentRows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      programId: tournaments.programId,
    })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);
  const tournament = tournamentRows[0];
  if (!tournament || tournament.programId !== teamRows[0].programId) {
    return { ok: false, error: "That tournament isn't open to this team." };
  }
  if (tournament.status !== "registration") {
    return { ok: false, error: `${tournament.name} isn't taking entries.` };
  }

  const conflicts = await entryConflicts(teamId, tournamentId);
  if (conflicts.length) {
    const names = conflicts.map((c) => `${c.playerName} (${c.teamName})`);
    return {
      ok: false,
      error: `Already entered with another team: ${names.join(", ")}. A player can only enter a tournament once.`,
    };
  }

  const existing = (
    await db
      .select({ id: tournamentParticipants.id })
      .from(tournamentParticipants)
      .where(
        and(
          eq(tournamentParticipants.teamId, teamId),
          eq(tournamentParticipants.tournamentId, tournamentId),
        ),
      )
      .limit(1)
  )[0];

  if (existing) {
    // Re-entering after a withdrawal reuses the row, keeping its standings.
    await db
      .update(tournamentParticipants)
      .set({ withdrawnAt: null, updatedAt: new Date() })
      .where(eq(tournamentParticipants.id, existing.id));
  } else {
    await db.insert(tournamentParticipants).values({
      id: crypto.randomUUID(),
      tournamentId,
      teamId,
      registeredByUserId: userId,
    });
  }

  revalidateTeams(teamId);
  revalidatePath("/tournaments/", "layout");
  return { ok: true };
}

export async function withdrawFromTournament(
  teamId: string,
  tournamentId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "enterTournaments");
  if (!check.ok) return check;

  await getDb()
    .update(tournamentParticipants)
    .set({ withdrawnAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tournamentParticipants.teamId, teamId),
        eq(tournamentParticipants.tournamentId, tournamentId),
      ),
    );

  revalidateTeams(teamId);
  revalidatePath("/tournaments/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Deletion (unanimous among managers)
// ---------------------------------------------------------------------------

/** Soft-deletes a team and everything hanging off it that should go quiet. */
async function disbandTeam(teamId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.batch([
    db
      .update(teams)
      .set({ disbandedAt: now, updatedAt: now })
      .where(eq(teams.id, teamId)),
    db
      .update(teamMembers)
      .set({ status: "inactive", leftAt: now })
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.status, "active")),
      ),
    db
      .update(teamInvites)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(eq(teamInvites.teamId, teamId), isNull(teamInvites.revokedAt)),
      ),
    db
      .update(teamListings)
      .set({ status: "closed", updatedAt: now })
      .where(
        and(eq(teamListings.teamId, teamId), eq(teamListings.status, "open")),
      ),
    db
      .update(teamDeleteRequests)
      .set({ status: "approved", resolvedAt: now, updatedAt: now })
      .where(
        and(
          eq(teamDeleteRequests.teamId, teamId),
          eq(teamDeleteRequests.status, "open"),
        ),
      ),
  ]);
  // Tournament entries and match history deliberately survive — that's the
  // whole reason disbanding is a soft delete.
}

export async function requestTeamDelete(
  teamId: string,
  reason?: string,
): Promise<ActionResult<{ disbanded: boolean }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const check = await requireTeamCapability(userId, teamId, "deleteTeam");
  if (!check.ok) return check;

  const managers = await getManagerUserIds(teamId);
  if (managers.length <= 1) {
    await disbandTeam(teamId);
    revalidateTeams(teamId);
    return { ok: true, disbanded: true };
  }

  const db = getDb();
  const open = (
    await db
      .select({ id: teamDeleteRequests.id })
      .from(teamDeleteRequests)
      .where(
        and(
          eq(teamDeleteRequests.teamId, teamId),
          eq(teamDeleteRequests.status, "open"),
        ),
      )
      .limit(1)
  )[0];
  if (open) {
    return { ok: false, error: "There's already a deletion vote open." };
  }

  const requestId = crypto.randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(teamDeleteRequests).values({
      id: requestId,
      teamId,
      requestedByUserId: userId,
      reason: (reason ?? "").trim().slice(0, 300) || null,
      status: "open",
      expiresAt: new Date(now.getTime() + DELETE_REQUEST_TTL_MS),
      createdAt: now,
      updatedAt: now,
    }),
    // Asking to delete is a vote to delete.
    db.insert(teamDeleteVotes).values({
      id: crypto.randomUUID(),
      requestId,
      userId,
      decision: "approve",
      createdAt: now,
    }),
  ]);

  revalidateTeams(teamId);
  return { ok: true, disbanded: false };
}

export async function voteTeamDelete(
  requestId: string,
  decision: "approve" | "decline",
): Promise<ActionResult<{ disbanded: boolean }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };
  if (decision !== "approve" && decision !== "decline") {
    return { ok: false, error: "Pick approve or decline." };
  }

  const db = getDb();
  const request = (
    await db
      .select({
        id: teamDeleteRequests.id,
        teamId: teamDeleteRequests.teamId,
        expiresAt: teamDeleteRequests.expiresAt,
      })
      .from(teamDeleteRequests)
      .where(
        and(
          eq(teamDeleteRequests.id, requestId),
          eq(teamDeleteRequests.status, "open"),
        ),
      )
      .limit(1)
  )[0];
  if (!request) return { ok: false, error: "That vote is already closed." };

  const check = await requireTeamCapability(userId, request.teamId, "deleteTeam");
  if (!check.ok) return check;

  const now = new Date();
  if (request.expiresAt && request.expiresAt.getTime() <= now.getTime()) {
    await db
      .update(teamDeleteRequests)
      .set({ status: "expired", resolvedAt: now, updatedAt: now })
      .where(eq(teamDeleteRequests.id, request.id));
    revalidateTeams(request.teamId);
    return { ok: false, error: "That vote expired. Start a new one if you still want to delete." };
  }

  // A single "no" ends it — deletion has to be unanimous.
  if (decision === "decline") {
    await db.batch([
      db
        .insert(teamDeleteVotes)
        .values({
          id: crypto.randomUUID(),
          requestId: request.id,
          userId,
          decision,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [teamDeleteVotes.requestId, teamDeleteVotes.userId],
          set: { decision },
        }),
      db
        .update(teamDeleteRequests)
        .set({ status: "declined", resolvedAt: now, updatedAt: now })
        .where(eq(teamDeleteRequests.id, request.id)),
    ]);
    revalidateTeams(request.teamId);
    return { ok: true, disbanded: false };
  }

  await db
    .insert(teamDeleteVotes)
    .values({
      id: crypto.randomUUID(),
      requestId: request.id,
      userId,
      decision,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [teamDeleteVotes.requestId, teamDeleteVotes.userId],
      set: { decision },
    });

  // Unanimity is judged against the CURRENT manager set, so a manager promoted
  // mid-vote re-blocks the delete until they've weighed in too.
  const [managers, votes] = await Promise.all([
    getManagerUserIds(request.teamId),
    db
      .select({
        userId: teamDeleteVotes.userId,
        decision: teamDeleteVotes.decision,
      })
      .from(teamDeleteVotes)
      .where(eq(teamDeleteVotes.requestId, request.id)),
  ]);
  const approvals = new Set(
    votes.filter((v) => v.decision === "approve").map((v) => v.userId),
  );
  const unanimous = managers.every((id) => approvals.has(id));

  if (unanimous) {
    await disbandTeam(request.teamId);
    revalidateTeams(request.teamId);
    return { ok: true, disbanded: true };
  }

  revalidateTeams(request.teamId);
  return { ok: true, disbanded: false };
}

export async function cancelTeamDelete(
  requestId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const db = getDb();
  const request = (
    await db
      .select({
        id: teamDeleteRequests.id,
        teamId: teamDeleteRequests.teamId,
      })
      .from(teamDeleteRequests)
      .where(
        and(
          eq(teamDeleteRequests.id, requestId),
          eq(teamDeleteRequests.status, "open"),
        ),
      )
      .limit(1)
  )[0];
  if (!request) return { ok: false, error: "That vote is already closed." };

  const check = await requireTeamCapability(userId, request.teamId, "deleteTeam");
  if (!check.ok) return check;

  const now = new Date();
  await db
    .update(teamDeleteRequests)
    .set({ status: "cancelled", resolvedAt: now, updatedAt: now })
    .where(eq(teamDeleteRequests.id, request.id));

  revalidateTeams(request.teamId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Score reporting
// ---------------------------------------------------------------------------

export async function reportScore(input: {
  teamId: string;
  matchId: string;
  games: GameScoreInput[];
}): Promise<ActionResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  // Authorization is re-derived from the match's own participants inside
  // reportMatchScore — teamId here only steers revalidation.
  const result = await reportMatchScore({
    matchId: input.matchId,
    userId,
    games: input.games,
  });
  if (!result.ok) return result;

  revalidateTeams(input.teamId);
  revalidatePath("/tournaments/", "layout");
  return { ok: true };
}
