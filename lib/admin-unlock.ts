import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// ---------------------------------------------------------------------------
// Admin "session unlock" — a short-lived, signed cookie proving the staff
// member re-verified with two-factor *recently*, gating every privileged admin
// action on top of the staff-role check (lib/staff.ts).
//
// Deliberately separate from the Better Auth session: we don't want to churn or
// shorten the real session, only to require a fresh proof before changes are
// pushed. The cookie is HMAC-signed with BETTER_AUTH_SECRET and bound to the
// user id, so it can't be forged and a stolen cookie can't be replayed under a
// different account (the signature covers the user id, which is re-derived from
// the session on every check).
// ---------------------------------------------------------------------------

const UNLOCK_COOKIE = "ff_admin_unlock";
export const ADMIN_UNLOCK_TTL_MS = 15 * 60 * 1000; // 15 minutes

function authSecret(): string {
  return getCloudflareContext().env.BETTER_AUTH_SECRET;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return toBase64Url(new Uint8Array(signature));
}

/** Length-independent string compare, to keep signature checks constant-time. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Set the unlock cookie for a user. Only ever called after a two-factor code
 * verified server-side in app/admin/actions.ts — never trust a client claim.
 */
export async function setAdminUnlock(userId: string): Promise<void> {
  const exp = Date.now() + ADMIN_UNLOCK_TTL_MS;
  const signature = await sign(`${userId}.${exp}`);
  (await cookies()).set(UNLOCK_COOKIE, `${exp}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_UNLOCK_TTL_MS / 1000),
  });
}

/** Drop the unlock — the "lock admin" control and sign-out cleanup. */
export async function clearAdminUnlock(): Promise<void> {
  (await cookies()).delete(UNLOCK_COOKIE);
}

/** Whether this user currently holds a valid, unexpired unlock cookie. */
export async function isAdminUnlocked(userId: string): Promise<boolean> {
  const raw = (await cookies()).get(UNLOCK_COOKIE)?.value;
  if (!raw) return false;

  const separator = raw.indexOf(".");
  if (separator <= 0) return false;
  const exp = Number(raw.slice(0, separator));
  const signature = raw.slice(separator + 1);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;

  const expected = await sign(`${userId}.${exp}`);
  return safeEqual(signature, expected);
}

export type UnlockCheck = { ok: true } | { ok: false; error: string };

/**
 * The second gate every privileged admin action opens with, after
 * requireStaffCapability. Kept as its own check so the error can prompt the
 * "verify to continue" flow rather than reading as a permission failure.
 */
export async function requireAdminUnlock(userId: string): Promise<UnlockCheck> {
  return (await isAdminUnlocked(userId))
    ? { ok: true }
    : {
        ok: false,
        error: "Verify with two-factor to make changes.",
      };
}
