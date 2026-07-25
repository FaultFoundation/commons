"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireAdminUnlock } from "@/lib/admin-unlock";
import { getAuth } from "@/lib/auth";
import { syncRoleConnection } from "@/lib/integrations";
import { ensureCollegiateMembership } from "@/lib/registration";
import { requireStaffCapability } from "@/lib/staff";

// ---------------------------------------------------------------------------
// Staff verification actions. Resolves the MANUAL_REVIEW queue (chiefly alumni
// without a school email) with off-platform judgment — no documents stored.
// Same gate contract as the other admin actions: session + capability + unlock.
// ---------------------------------------------------------------------------

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireActor(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, "verifyMembers");
  if (!staff.ok) return { ok: false, error: staff.error };

  const unlock = await requireAdminUnlock(userId);
  if (!unlock.ok) return { ok: false, error: unlock.error };

  return { ok: true, userId };
}

function revalidate() {
  revalidatePath("/admin/verification/");
  revalidatePath("/home/", "layout");
  revalidatePath("/account/", "layout");
}

export async function markVerified(targetUserId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  await ensureCollegiateMembership(targetUserId, {
    status: "VERIFIED",
    verifiedAt: new Date(),
  });
  // Best-effort Discord role push.
  await syncRoleConnection(targetUserId, await headers());
  revalidate();
  return { ok: true };
}

export async function markIneligible(
  targetUserId: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  await ensureCollegiateMembership(targetUserId, {
    status: "INELIGIBLE",
    verifiedAt: null,
  });
  await syncRoleConnection(targetUserId, await headers());
  revalidate();
  return { ok: true };
}
