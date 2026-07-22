"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getAuth } from "@/lib/auth";
import { deleteAvatarByUrl, keyFromUrl, putAvatar } from "@/lib/avatars";
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

// ---------------------------------------------------------------------------
// Profile picture
//
// Split in two on purpose. Only the R2 write lives here — `user.image` itself
// is set by the *client* through authClient.updateUser (see AvatarRow), which
// is both the rule in docs/dashboard-guide.md and the only way the site header
// repaints: Better Auth refreshes its cached session when the client calls
// /update-user, and a server-side auth.api.updateUser fires no such signal, so
// the header kept showing the old silhouette until the next full page load.
//
// Ordering matters. Upload writes the new object and touches nothing else, the
// client then moves the pointer, and only afterwards is the old object
// discarded — so a failure anywhere leaves a stale 2 KB blob rather than a user
// row pointing at bytes that no longer exist.
// ---------------------------------------------------------------------------

export async function uploadAvatar(
  form: FormData,
): Promise<ActionResult<{ url: string }>> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Sign in to change this." };

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image to upload." };
  }

  return putAvatar("user", session.user.id, await file.arrayBuffer());
}

/**
 * Drop a picture the caller has stopped using.
 *
 * The ownership check is the point: without it any signed-in member could pass
 * somebody else's key and delete their picture. Keys embed the owner's id
 * (lib/avatars.ts), so "is this yours" is a prefix comparison.
 */
export async function discardAvatar(url: string): Promise<ActionResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Sign in to change this." };

  const key = keyFromUrl(url);
  if (!key?.startsWith(`user/${session.user.id}/`)) {
    // Nothing to do — either not ours to delete, or not one of our URLs at all
    // (an old Discord CDN avatar takes this path too).
    return { ok: true };
  }

  await deleteAvatarByUrl(url);
  revalidatePath("/", "layout");
  return { ok: true };
}
