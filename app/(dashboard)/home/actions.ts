"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getAuth } from "@/lib/auth";
import { asHomeLayout } from "@/lib/home-shared";
import { ensureProfile } from "@/lib/registration";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Persist the member's Home board arrangement — the ordered list of widget ids
 * they've enabled and reordered. Purely presentational (like density): there's
 * no capability to check, and the client's list is only a hint — asHomeLayout
 * drops any unknown id, so a tampered payload can at worst hide/show the
 * member's own widgets. Stored as JSON on profiles.home_layout; `[]` is a valid
 * "empty board" and is stored verbatim.
 */
export async function setHomeLayout(ids: string[]): Promise<ActionResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Sign in to change this." };

  const clean = asHomeLayout(Array.isArray(ids) ? ids : []);
  await ensureProfile(session.user.id, { homeLayout: JSON.stringify(clean) });

  revalidatePath("/home/", "layout");
  return { ok: true };
}
