import { cache } from "react";
import { eq, inArray } from "drizzle-orm";

import { staffRoles, user } from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  asStaffRole,
  canAny,
  isStaffRole,
  type StaffCapability,
  type StaffRole,
} from "@/lib/staff-shared";

/** granted_via value marking a row as reconciled against a linked Discord role. */
export const DISCORD_GRANT = "discord";

// ---------------------------------------------------------------------------
// Staff reads + the site-wide admin gate.
//
// Permissions are always re-derived from D1 here (never trusted from the
// client), exactly like lib/teams.ts `requireTeamCapability`. Every admin page
// redirects on a failed check and every admin action re-checks — a client that
// forges its way to seeing the tab still cannot read or mutate anything.
//
// program_id is ignored for now: the foundation gates on site-wide access, and
// every seeded/synced grant is site-wide (program_id NULL). Per-program scoping
// can layer on later without changing callers.
// ---------------------------------------------------------------------------

/** Every staff role the user holds, unknown/legacy values dropped. Memoized per
    request: isStaff (shell) and requireStaffCapability (gate) both call it. */
export const getStaffRoles = cache(
  async (userId: string): Promise<StaffRole[]> => {
    const rows = await getDb()
      .select({ role: staffRoles.role })
      .from(staffRoles)
      .where(eq(staffRoles.userId, userId));
    return rows
      .map((row) => asStaffRole(row.role))
      .filter((role): role is StaffRole => role !== null);
  },
);

/** Whether the user has any staff access at all (drives tab visibility). */
export async function isStaff(userId: string): Promise<boolean> {
  return (await getStaffRoles(userId)).length > 0;
}

/** Everyone who holds any staff role — the ticket assignee picker. One row per
    person, even if they hold several roles. */
export async function listStaffMembers(): Promise<
  { userId: string; name: string }[]
> {
  return getDb()
    .selectDistinct({ userId: staffRoles.userId, name: user.name })
    .from(staffRoles)
    .innerJoin(user, eq(user.id, staffRoles.userId))
    .orderBy(user.name);
}

export type StaffCheck =
  | { ok: true; roles: StaffRole[] }
  | { ok: false; error: string };

/**
 * The gate every admin page and mutating admin action opens with. Answers "no
 * staff access" and "not allowed to do this" with different messages — the
 * first is usually a revoked/stale session, the second a real permission gap.
 */
export async function requireStaffCapability(
  userId: string,
  capability: StaffCapability,
): Promise<StaffCheck> {
  const roles = await getStaffRoles(userId);
  if (roles.length === 0) {
    return { ok: false, error: "You don't have staff access." };
  }
  if (!canAny(roles, capability)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, roles };
}

/**
 * Reconcile the user's Discord-sourced (granted_via = "discord"), site-wide
 * staff roles to exactly `desired`. Rows granted any other way (manual grants,
 * legacy NULLs) are never touched — the dashboard owns those. Program-scoped
 * rows are ignored entirely.
 *
 * `desired` is what the Discord role map currently resolves the member to; the
 * orchestration in lib/integrations.ts only calls this when it got a definitive
 * role list back from Discord, so an unknown/failed lookup never revokes access.
 *
 * Inserts run before deletes so a concurrent capability check never sees fewer
 * roles than the union of old and new. Idempotent: re-running fixes any partial
 * write from an earlier interrupted call.
 */
export async function syncManagedStaffRoles(
  userId: string,
  desired: readonly StaffRole[],
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      id: staffRoles.id,
      role: staffRoles.role,
      programId: staffRoles.programId,
      grantedVia: staffRoles.grantedVia,
    })
    .from(staffRoles)
    .where(eq(staffRoles.userId, userId));

  // Only site-wide grants take part in the Discord sync.
  const siteWide = rows.filter((row) => row.programId == null);
  const desiredSet = new Set(desired);
  const presentRoles = new Set(siteWide.map((row) => row.role));

  // Never insert a role that already exists site-wide (a manual grant of the
  // same tier wins and must not be duplicated — SQLite treats NULL program_id
  // as distinct, so the unique index would not catch it).
  const toAdd = desired.filter((role) => !presentRoles.has(role));
  const toDelete = siteWide
    .filter(
      (row) =>
        row.grantedVia === DISCORD_GRANT &&
        isStaffRole(row.role) &&
        !desiredSet.has(row.role),
    )
    .map((row) => row.id);

  const now = new Date();
  for (const role of toAdd) {
    await db.insert(staffRoles).values({
      id: crypto.randomUUID(),
      userId,
      role,
      programId: null,
      grantedBy: null,
      grantedVia: DISCORD_GRANT,
      grantedAt: now,
    });
  }
  if (toDelete.length > 0) {
    await db.delete(staffRoles).where(inArray(staffRoles.id, toDelete));
  }
}
