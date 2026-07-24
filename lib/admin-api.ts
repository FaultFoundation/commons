import { requireAdminUnlock } from "@/lib/admin-unlock";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";
import type { StaffCapability } from "@/lib/staff-shared";

// Shared auth for admin JSON endpoints (app/api/admin/*), which the dashboard
// polls instead of re-rendering the whole tab on Workers. Same gate as the
// server actions — session, staff capability, and a fresh 2FA unlock — but it
// returns a Response to send straight back on failure.

export type StaffApiResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function requireStaffApi(
  capability: StaffCapability,
): Promise<StaffApiResult> {
  const session = await getSessionCached();
  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, capability);
  if (!staff.ok) {
    return {
      ok: false,
      response: Response.json({ error: staff.error }, { status: 403 }),
    };
  }

  const unlock = await requireAdminUnlock(userId);
  if (!unlock.ok) {
    return {
      ok: false,
      response: Response.json({ error: unlock.error }, { status: 403 }),
    };
  }

  return { ok: true, userId };
}
