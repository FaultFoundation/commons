"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, gte, isNull } from "drizzle-orm";

import {
  teamDeleteRequests,
  teamInvites,
  teamListings,
  teamMembers,
  teams,
} from "@/db/schema";
import { requireAdminUnlock } from "@/lib/admin-unlock";
import { getAuth } from "@/lib/auth";
import { deleteAvatarByUrl, putAvatar } from "@/lib/avatars";
import { getDb } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff";
import {
  cleanName,
  cleanTag,
  cleanTimezone,
  cleanUrl,
  getManagerUserIds,
  nameTaken,
} from "@/lib/teams";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_ROLES,
  asTeamRole,
  type TeamRole,
} from "@/lib/teams-shared";

// ---------------------------------------------------------------------------
// Staff-facing team actions (the admin Teams panel). The member-facing actions
// in app/teams/actions.ts hard-gate on team membership (requireTeamCapability),
// so staff who aren't on a team can't use them — these are the parallel set,
// gated on the `manageTeams` staff capability plus a fresh 2FA unlock, and they
// reuse the same validators/avatar helpers so edits behave identically.
//
// These are a deliberate staff override: disband/restore skip the member
// unanimous-consent vote, and role changes aren't bound by the actor's own team
// rank (a staff member need not be on the team at all).
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function requireActor(): Promise<ActionResult<{ userId: string }>> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, "manageTeams");
  if (!staff.ok) return { ok: false, error: staff.error };

  const unlock = await requireAdminUnlock(userId);
  if (!unlock.ok) return { ok: false, error: unlock.error };

  return { ok: true, userId };
}

/** Refresh the admin team surfaces and the member-facing ones the edit touches. */
function revalidateAdminTeam(teamId: string) {
  revalidatePath("/admin/teams/", "layout");
  revalidatePath(`/admin/teams/${teamId}/`, "layout");
  revalidatePath("/teams/", "layout");
  revalidatePath(`/teams/${teamId}/`, "layout");
  revalidatePath("/home/", "layout");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function adminUpdateTeamSettings(
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
  const gate = await requireActor();
  if (!gate.ok) return gate;

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

  revalidateAdminTeam(teamId);
  return { ok: true };
}

export async function adminSetTeamLogo(
  teamId: string,
  form: FormData,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image to upload." };
  }

  const db = getDb();
  const [current] = await db
    .select({ logoUrl: teams.logoUrl })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  const stored = await putAvatar("team", teamId, await file.arrayBuffer());
  if (!stored.ok) return stored;

  await db
    .update(teams)
    .set({ logoUrl: stored.url, updatedAt: new Date() })
    .where(eq(teams.id, teamId));

  // Content-addressed keys: only delete the previous object when it differs.
  if (current?.logoUrl && current.logoUrl !== stored.url) {
    await deleteAvatarByUrl(current.logoUrl);
  }

  revalidateAdminTeam(teamId);
  return { ok: true };
}

export async function adminRemoveTeamLogo(
  teamId: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const db = getDb();
  const [current] = await db
    .select({ logoUrl: teams.logoUrl })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  await db
    .update(teams)
    .set({ logoUrl: null, updatedAt: new Date() })
    .where(eq(teams.id, teamId));

  await deleteAvatarByUrl(current?.logoUrl);

  revalidateAdminTeam(teamId);
  return { ok: true };
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
  return rows[0] ?? null;
}

export async function adminChangeMemberRole(
  teamId: string,
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  if (!(TEAM_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Unknown role." };
  }
  const nextRole = role as TeamRole;

  const target = await getMembership(teamId, membershipId);
  if (!target || target.status !== "active") {
    return { ok: false, error: "That member isn't on the team." };
  }
  if (asTeamRole(target.role) === nextRole) return { ok: true };
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

  revalidateAdminTeam(teamId);
  return { ok: true };
}

export async function adminRemoveMember(
  teamId: string,
  membershipId: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const target = await getMembership(teamId, membershipId);
  if (!target || target.status !== "active") {
    return { ok: false, error: "That member isn't on the team." };
  }
  if (await isLastManager(teamId, target.userId)) {
    return {
      ok: false,
      error: "A team needs at least one manager — disband the team instead.",
    };
  }

  await getDb()
    .update(teamMembers)
    .set({ status: "inactive", leftAt: new Date() })
    .where(eq(teamMembers.id, membershipId));

  revalidateAdminTeam(teamId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Disband / restore (staff override — no member vote)
// ---------------------------------------------------------------------------

export async function adminDisbandTeam(teamId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const db = getDb();
  const [team] = await db
    .select({ disbandedAt: teams.disbandedAt })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { ok: false, error: "That team no longer exists." };
  if (team.disbandedAt) {
    return { ok: false, error: "That team is already disbanded." };
  }

  const now = new Date();
  // Mirrors app/teams/actions.ts disbandTeam: hide the team, deactivate its
  // roster, revoke invites, close listings, and resolve any open delete vote.
  // Tournament entries and match history survive — that's why it's a soft delete.
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
      .where(and(eq(teamInvites.teamId, teamId), isNull(teamInvites.revokedAt))),
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

  revalidateAdminTeam(teamId);
  return { ok: true };
}

export async function adminRestoreTeam(teamId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const db = getDb();
  const [team] = await db
    .select({ name: teams.name, disbandedAt: teams.disbandedAt })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { ok: false, error: "That team no longer exists." };
  if (!team.disbandedAt) {
    return { ok: false, error: "That team isn't disbanded." };
  }
  // Disbanding frees the name, so another team may have taken it since.
  if (await nameTaken(team.name, teamId)) {
    return {
      ok: false,
      error: "Another team now uses that name. Rename one before restoring.",
    };
  }

  const disbandedAt = team.disbandedAt;
  const now = new Date();
  await db.batch([
    db
      .update(teams)
      .set({ disbandedAt: null, updatedAt: now })
      .where(eq(teams.id, teamId)),
    // Bring back exactly the members the disband deactivated (leftAt at/after
    // the disband), so a restored team keeps its roster — managers included —
    // without reviving people who had already left beforehand.
    db
      .update(teamMembers)
      .set({ status: "active", leftAt: null })
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.status, "inactive"),
          gte(teamMembers.leftAt, disbandedAt),
        ),
      ),
  ]);

  revalidateAdminTeam(teamId);
  return { ok: true };
}
