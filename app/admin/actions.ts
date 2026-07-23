"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { user } from "@/db/schema";
import { clearAdminUnlock, setAdminUnlock } from "@/lib/admin-unlock";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { requireStaffCapability } from "@/lib/staff";

// ---------------------------------------------------------------------------
// Admin session-unlock actions. Same contract as the other action files: the
// session is re-checked, authorization is re-derived from D1, and nothing
// throws across the boundary.
//
// The two-factor code is verified HERE, server-side, via Better Auth's own
// verify endpoints — a split "client verifies, server unlocks" would let a
// client set the unlock cookie without ever proving a code. Called on an
// already-authenticated session, verifyTOTP/verifyTwoFactorOTP take Better
// Auth's step-up branch: they check the code against the user's secret and
// return without disturbing the session (no trustDevice, so no new session).
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type UnlockMethod = "totp" | "otp";

export async function unlockAdmin(input: {
  code: string;
  method: UnlockMethod;
}): Promise<ActionResult> {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, "viewAdmin");
  if (!staff.ok) return { ok: false, error: staff.error };

  // Admin actions require a second factor; an un-enrolled account can't unlock.
  // Read from D1 (not the cookie-cached session) so a just-enrolled member isn't
  // told to enroll again.
  const rows = await getDb()
    .select({ enabled: user.twoFactorEnabled })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!rows[0]?.enabled) {
    return {
      ok: false,
      error:
        "Turn on two-factor authentication in Account before unlocking admin actions.",
    };
  }

  const code = input.code.trim();
  if (!code) return { ok: false, error: "Enter your code." };

  try {
    if (input.method === "totp") {
      await getAuth().api.verifyTOTP({ body: { code }, headers: requestHeaders });
    } else {
      await getAuth().api.verifyTwoFactorOTP({
        body: { code },
        headers: requestHeaders,
      });
    }
  } catch {
    return { ok: false, error: "That code didn't work. Try again." };
  }

  await setAdminUnlock(userId);
  return { ok: true };
}

export async function lockAdmin(): Promise<ActionResult> {
  await clearAdminUnlock();
  return { ok: true };
}
