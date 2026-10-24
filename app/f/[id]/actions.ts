"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import {
  signupResponseValues,
  signupResponses,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPlatformIdentities } from "@/lib/platform-identities";
import { refreshOwState } from "@/lib/ow-stats";
import {
  blockingChecks,
  checkRequirements,
  formAcceptsResponses,
  getForm,
  listFormItems,
} from "@/lib/signup-forms";
import {
  formPath,
  isQuestionKind,
  normalizeAnswer,
} from "@/lib/signup-forms-shared";

// ---------------------------------------------------------------------------
// Member actions for a sign-up form. Every requirement is re-checked LIVE here
// (fresh D1 reads, OverFast when its caches are due) — the page's checklist is
// presentation only. What a check found is snapshotted as the response's
// evidence, so the organizer's export reflects the moment of signing up.
// ---------------------------------------------------------------------------

export type SignupResult =
  | { ok: true }
  | { ok: false; error: string; blocking?: string[] };

async function sessionUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function submitSignup(
  formId: string,
  answers: Record<string, unknown>,
): Promise<SignupResult> {
  const me = await sessionUser();
  if (!me) return { ok: false, error: "Sign in to sign up." };
  const form = await getForm(String(formId ?? ""));
  if (!form) return { ok: false, error: "That form doesn't exist." };
  if (!formAcceptsResponses(form)) {
    return { ok: false, error: "This form isn't taking sign-ups right now." };
  }

  const items = await listFormItems(form.id);
  const values: { itemId: string; value: string | null; met: boolean | null }[] = [];

  for (const item of items.filter((i) => isQuestionKind(i.kind))) {
    const answer = normalizeAnswer(item, answers?.[item.id]);
    if (!answer.ok) return { ok: false, error: answer.error };
    if (answer.value !== null) {
      values.push({ itemId: item.id, value: JSON.stringify(answer.value), met: null });
    }
  }

  const checks = await checkRequirements({
    subject: {
      userId: me.id,
      name: me.name,
      email: me.email,
      emailVerified: Boolean(me.emailVerified),
    },
    formId: form.id,
    items,
    headers: await headers(),
    live: true,
  });
  const blocking = blockingChecks(checks);
  if (blocking.length) {
    return {
      ok: false,
      error: "A few requirements still need doing.",
      blocking: blocking.map((c) => c.label),
    };
  }
  for (const check of checks) {
    const met = check.met === true;
    values.push({
      itemId: check.itemId,
      value: met && check.evidence ? JSON.stringify(check.evidence) : null,
      met,
    });
  }

  const db = getDb();
  const now = new Date();
  const existing = (
    await db
      .select({ id: signupResponses.id })
      .from(signupResponses)
      .where(
        and(eq(signupResponses.formId, form.id), eq(signupResponses.userId, me.id)),
      )
      .limit(1)
  )[0];
  const responseId = existing?.id ?? crypto.randomUUID();

  // One atomic write: the response row and a full replacement of its values,
  // so a re-submit never leaves a half-old snapshot behind.
  const writes = [
    existing
      ? db
          .update(signupResponses)
          .set({ status: "submitted", updatedAt: now })
          .where(eq(signupResponses.id, responseId))
      : db.insert(signupResponses).values({
          id: responseId,
          formId: form.id,
          userId: me.id,
          status: "submitted",
          submittedAt: now,
          updatedAt: now,
        }),
    db
      .delete(signupResponseValues)
      .where(eq(signupResponseValues.responseId, responseId)),
    ...values.map((v) =>
      db.insert(signupResponseValues).values({
        id: crypto.randomUUID(),
        responseId,
        ...v,
      }),
    ),
  ];
  try {
    await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  } catch (error) {
    // Two first submits racing on the (form, user) unique index.
    console.error("signup submit failed:", error);
    return { ok: false, error: "That didn't save — try again." };
  }

  revalidatePath(formPath(form.id));
  revalidatePath("/forms/", "layout");
  return { ok: true };
}

/** Takes the member off the form's list. Their answers stay for a re-submit. */
export async function withdrawSignup(formId: string): Promise<SignupResult> {
  const me = await sessionUser();
  if (!me) return { ok: false, error: "You need to be signed in." };
  await getDb()
    .update(signupResponses)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(
      and(eq(signupResponses.formId, String(formId)), eq(signupResponses.userId, me.id)),
    );
  revalidatePath(formPath(String(formId)));
  revalidatePath("/forms/", "layout");
  return { ok: true };
}

/**
 * "Check again" for the Overwatch requirements: re-reads profile visibility
 * past its cache and takes a snapshot when one is due. The page renders from
 * cache only, so this is what a member clicks after making their profile
 * public. The button is disabled while it runs.
 */
export async function recheckOverwatch(): Promise<SignupResult> {
  const me = await sessionUser();
  if (!me) return { ok: false, error: "You need to be signed in." };
  const battlenet = (await getPlatformIdentities(me.id)).find(
    (i) => i.provider === "battlenet",
  );
  if (!battlenet?.handle) return { ok: false, error: "Link Blizzard first." };
  const state = await refreshOwState(me.id, battlenet.handle, { force: true });
  if (!state.visibility) {
    return { ok: false, error: "Couldn't reach Overwatch's profile service — try again in a minute." };
  }
  return { ok: true };
}
