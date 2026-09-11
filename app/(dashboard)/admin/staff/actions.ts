"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";

import { staffRoles } from "@/db/schema";
import { requireAdminUnlock } from "@/lib/admin-unlock";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  DISCORD_GRANT,
  getUserByEmail,
  requireStaffCapability,
} from "@/lib/staff";
import {
  asStaffRole,
  assignableStaffRoles,
  type StaffRole,
} from "@/lib/staff-shared";

// ---------------------------------------------------------------------------
// Staff-management actions (the admin Staff panel). Same contract as the other
// admin action files: re-check the session, re-derive authorization from D1
// (manageStaff capability AND a fresh 2FA unlock), mutate D1, then revalidate.
// Nothing throws across the boundary.
//
// Grants are always site-wide and manual (granted_via = "manual"), so the
// Discord sync (lib/staff.ts syncManagedStaffRoles) never touches them — it
// only reconciles its own "discord" rows.
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type Actor = { userId: string; userName: string; roles: StaffRole[] };

async function requireActor(): Promise<ActionResult<{ actor: Actor }>> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, "manageStaff");
  if (!staff.ok) return { ok: false, error: staff.error };

  const unlock = await requireAdminUnlock(userId);
  if (!unlock.ok) return { ok: false, error: unlock.error };

  return {
    ok: true,
    actor: { userId, userName: session.user.name, roles: staff.roles },
  };
}

/** The roles this actor may grant or revoke — the union across every role they
    hold. An admin can only touch moderator/tournament_admin; an owner, all. */
function actorAssignable(roles: StaffRole[]): Set<StaffRole> {
  return new Set(roles.flatMap((role) => assignableStaffRoles(role)));
}

/** Grant a staff role to the account behind an email. */
export async function addStaffRole(input: {
  email: string;
  role: string;
}): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const role = asStaffRole(input.role);
  if (!role) return { ok: false, error: "Unknown role." };
  if (!actorAssignable(gate.actor.roles).has(role)) {
    return { ok: false, error: `You can't grant the ${role} role.` };
  }

  const target = await getUserByEmail(input.email);
  if (!target) {
    return {
      ok: false,
      error: "No account with that email. They need to sign in once first.",
    };
  }

  const db = getDb();
  // SQLite treats a NULL program_id as distinct, so the unique index wouldn't
  // stop a duplicate site-wide grant — guard it by hand, exactly like the
  // Discord sync does.
  const existing = await db
    .select({ id: staffRoles.id })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.userId, target.id),
        eq(staffRoles.role, role),
        isNull(staffRoles.programId),
      ),
    )
    .limit(1);
  if (existing.length) {
    return { ok: false, error: `${target.name} already has the ${role} role.` };
  }

  await db.insert(staffRoles).values({
    id: crypto.randomUUID(),
    userId: target.id,
    role,
    programId: null,
    grantedBy: gate.actor.userId,
    grantedVia: "manual",
    grantedAt: new Date(),
  });

  revalidatePath("/admin/staff/");
  return { ok: true };
}

/** Revoke one role from a staff member. */
export async function removeStaffRole(input: {
  userId: string;
  role: string;
}): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const role = asStaffRole(input.role);
  if (!role) return { ok: false, error: "Unknown role." };
  if (!actorAssignable(gate.actor.roles).has(role)) {
    return { ok: false, error: `You can't revoke the ${role} role.` };
  }

  const db = getDb();
  const rows = await db
    .select({ id: staffRoles.id, grantedVia: staffRoles.grantedVia })
    .from(staffRoles)
    .where(
      and(
        eq(staffRoles.userId, input.userId),
        eq(staffRoles.role, role),
        isNull(staffRoles.programId),
      ),
    )
    .limit(1);
  const grant = rows[0];
  if (!grant) return { ok: false, error: "They don't have that role." };

  // A Discord-synced grant would just be re-added on the next reconcile, so
  // removing it here is misleading — send them to the source instead.
  if (grant.grantedVia === DISCORD_GRANT) {
    return {
      ok: false,
      error:
        "That role is synced from Discord — remove the Discord role instead, or it will be re-added.",
    };
  }

  // The site must keep at least one owner, or nobody can ever grant owners.
  if (role === "owner") {
    const owners = await db
      .select({ id: staffRoles.id })
      .from(staffRoles)
      .where(and(eq(staffRoles.role, "owner"), isNull(staffRoles.programId)));
    if (owners.length <= 1) {
      return { ok: false, error: "You can't remove the last owner." };
    }
  }

  await db.delete(staffRoles).where(eq(staffRoles.id, grant.id));

  revalidatePath("/admin/staff/");
  return { ok: true };
}
