"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getAuth } from "@/lib/auth";
import {
  DENSITY_COOKIE,
  DENSITY_COOKIE_MAX_AGE,
  asDensity,
} from "@/lib/density";
import { ensureProfile } from "@/lib/registration";

// ---------------------------------------------------------------------------
// Account-tab server actions. Same contract as the teams and registration
// actions: re-check the session, never trust the client's value, and return a
// plain serializable result rather than throwing across the boundary.
//
// Account *mutations* (name/email/password/unlink/delete) stay Better Auth
// client calls — this file is only for preferences Better Auth doesn't own.
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Store the member's bubble density. Writes D1 (the source of truth) and the
 * cookie the shell actually reads, so the cache can't lag the row — a server
 * action is the one server context allowed to set a cookie.
 */
export async function setDensity(value: string): Promise<ActionResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Sign in to change this." };

  // Normalizes rather than rejects: an unknown value means a stale client, and
  // landing on the default is a better outcome than an error toast.
  const density = asDensity(value);

  await ensureProfile(session.user.id, { density });

  (await cookies()).set(DENSITY_COOKIE, density, {
    path: "/",
    maxAge: DENSITY_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  // Every tab's shell renders the attribute, so refresh the whole portal.
  revalidatePath("/", "layout");
  return { ok: true };
}
