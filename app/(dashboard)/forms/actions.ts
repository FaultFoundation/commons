"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, max } from "drizzle-orm";

import { signupFormItems, signupForms } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  countOwnedForms,
  getForm,
  listFormItems,
  newFormId,
  type SignupForm,
} from "@/lib/signup-forms";
import {
  DESCRIPTION_MAX,
  FORM_STATUSES,
  HELP_MAX,
  HOST_MAX,
  LABEL_MAX,
  MAX_FORMS_PER_OWNER,
  MAX_QUESTIONS,
  TITLE_MAX,
  asEventPlatform,
  choiceConfig,
  discordServerConfig,
  formPath,
  isChoiceKind,
  isQuestionKind,
  isRequirementKind,
  normalizeDomains,
  normalizeHttpUrl,
  requirementDef,
  type FormStatus,
  type RequirementKind,
} from "@/lib/signup-forms-shared";

// ---------------------------------------------------------------------------
// Owner actions for sign-up forms. Any signed-in member may build forms (there
// is no organizer role yet, by decision); every action re-reads the form from
// D1 and checks the caller owns it before writing, and returns a plain
// serializable result — nothing throws across the boundary.
// ---------------------------------------------------------------------------

export type FormActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function requireUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** The caller's form, or the error to return. Fresh read, never the cache. */
async function ownForm(
  formId: string,
): Promise<{ error: string } | { form: SignupForm; userId: string }> {
  const userId = await requireUserId();
  if (!userId) return { error: "You need to be signed in." };
  const form = await getForm(String(formId ?? ""));
  if (!form || form.ownerUserId !== userId) {
    return { error: "That form doesn't exist or isn't yours." };
  }
  return { form, userId };
}

function revalidateForm(formId: string) {
  revalidatePath("/forms/", "layout");
  revalidatePath(formPath(formId));
}

async function touch(formId: string) {
  await getDb()
    .update(signupForms)
    .set({ updatedAt: new Date() })
    .where(eq(signupForms.id, formId));
}

function clean(value: unknown, maxLength: number): string | null {
  const text = String(value ?? "").trim().slice(0, maxLength);
  return text || null;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

/** A fresh draft with the two buckets nearly every form starts from. */
export async function createForm(): Promise<FormActionResult<{ id: string }>> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };
  if ((await countOwnedForms(userId)) >= MAX_FORMS_PER_OWNER) {
    return {
      ok: false,
      error: `You can have up to ${MAX_FORMS_PER_OWNER} forms. Delete an old one first.`,
    };
  }

  const id = newFormId();
  const now = new Date();
  const db = getDb();
  await db.batch([
    db.insert(signupForms).values({
      id,
      ownerUserId: userId,
      title: "Untitled Sign-Up",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(signupFormItems).values([
      { id: crypto.randomUUID(), formId: id, kind: "account_email", createdAt: now },
      { id: crypto.randomUUID(), formId: id, kind: "discord", createdAt: now },
    ]),
  ]);
  revalidatePath("/forms/", "layout");
  return { ok: true, id };
}

export type FormDetailsInput = {
  title: string;
  hostName: string;
  description: string;
  eventUrl: string;
  eventPlatform: string;
  /** ISO string from a datetime-local field, or "" for no automatic close. */
  closesAt: string;
};

export async function updateFormDetails(
  formId: string,
  input: FormDetailsInput,
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };

  const title = clean(input.title, TITLE_MAX);
  if (!title) return { ok: false, error: "Give the form a title." };
  const eventUrlRaw = String(input.eventUrl ?? "").trim();
  const eventUrl = normalizeHttpUrl(eventUrlRaw);
  if (eventUrlRaw && !eventUrl) {
    return { ok: false, error: "The event link must start with https://." };
  }
  let closesAt: Date | null = null;
  if (String(input.closesAt ?? "").trim()) {
    const ms = Date.parse(input.closesAt);
    if (!Number.isFinite(ms)) return { ok: false, error: "That close date isn't valid." };
    closesAt = new Date(ms);
  }

  await getDb()
    .update(signupForms)
    .set({
      title,
      hostName: clean(input.hostName, HOST_MAX),
      description: clean(input.description, DESCRIPTION_MAX),
      eventUrl,
      eventPlatform: asEventPlatform(input.eventPlatform),
      closesAt,
      updatedAt: new Date(),
    })
    .where(eq(signupForms.id, owned.form.id));
  revalidateForm(owned.form.id);
  return { ok: true };
}

export async function setFormStatus(
  formId: string,
  status: FormStatus,
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  if (!FORM_STATUSES.includes(status)) return { ok: false, error: "Unknown status." };

  if (status === "open") {
    // An unconfigured server check would block every submit, so refuse to open
    // until it's fixed rather than let members find out.
    const items = await listFormItems(owned.form.id);
    const server = items.find((i) => i.kind === "discord_server");
    if (server && !discordServerConfig(server.config)) {
      return { ok: false, error: "Add your Discord server ID before opening the form." };
    }
    const emptyChoice = items.find(
      (i) => isChoiceKind(i.kind) && choiceConfig(i.config).options.length === 0,
    );
    if (emptyChoice) {
      return {
        ok: false,
        error: `"${emptyChoice.label ?? "A question"}" needs at least one choice.`,
      };
    }
  }

  await getDb()
    .update(signupForms)
    .set({ status, updatedAt: new Date() })
    .where(eq(signupForms.id, owned.form.id));
  revalidateForm(owned.form.id);
  return { ok: true };
}

/** Deletes the form and, by cascade, every response to it. */
export async function deleteForm(formId: string): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  await getDb().delete(signupForms).where(eq(signupForms.id, owned.form.id));
  revalidatePath("/forms/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Requirements — one row per kind, switched on and off.
// ---------------------------------------------------------------------------

export type RequirementInput = {
  enabled: boolean;
  required: boolean;
  /** academic: { domains: string } · discord_server: { guildId, inviteUrl, serverName } */
  config?: Record<string, unknown>;
};

function requirementConfig(
  kind: RequirementKind,
  config: Record<string, unknown> | undefined,
): { ok: true; json: string | null } | { ok: false; error: string } {
  if (kind === "academic") {
    const domains = normalizeDomains(config?.domains ?? []);
    const typed = String(config?.domains ?? "").trim();
    if (typed && !domains.length) {
      return { ok: false, error: "Those don't look like email domains (e.g. uic.edu)." };
    }
    return { ok: true, json: JSON.stringify({ domains }) };
  }
  if (kind === "discord_server") {
    const raw = {
      guildId: String(config?.guildId ?? "").trim(),
      inviteUrl: String(config?.inviteUrl ?? "").trim(),
      serverName: String(config?.serverName ?? "").trim(),
    };
    const cfg = discordServerConfig(raw);
    if (!cfg) {
      return {
        ok: false,
        error:
          "Paste your server ID — Server Settings → Widget, or right-click the server with Developer Mode on → Copy Server ID.",
      };
    }
    if (raw.inviteUrl && !cfg.inviteUrl) {
      return { ok: false, error: "The invite must be a discord.gg or discord.com/invite link." };
    }
    return { ok: true, json: JSON.stringify(cfg) };
  }
  return { ok: true, json: null };
}

/**
 * Switch a requirement bucket on (with its settings) or off. Switching one on
 * also switches on what it can't be met without (registry `implies`) — a rank
 * check with no Blizzard link could never pass.
 */
export async function setRequirement(
  formId: string,
  kind: string,
  input: RequirementInput,
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  if (!isRequirementKind(kind)) return { ok: false, error: "Unknown requirement." };

  const db = getDb();
  const items = await listFormItems(owned.form.id);
  const existing = items.find((i) => i.kind === kind);

  if (!input.enabled) {
    const dependent = items
      .map((i) => requirementDef(i.kind))
      .find((def) => def?.implies?.includes(kind));
    if (dependent) {
      return { ok: false, error: `${dependent.label} needs this. Turn that off first.` };
    }
    if (existing) {
      await db.delete(signupFormItems).where(eq(signupFormItems.id, existing.id));
    }
    await touch(owned.form.id);
    revalidateForm(owned.form.id);
    return { ok: true };
  }

  const config = requirementConfig(kind, input.config ?? existing?.config);
  if (!config.ok) return { ok: false, error: config.error };

  const now = new Date();
  const writes = [];
  if (existing) {
    writes.push(
      db
        .update(signupFormItems)
        .set({ required: input.required !== false, config: config.json })
        .where(eq(signupFormItems.id, existing.id)),
    );
  } else {
    writes.push(
      db.insert(signupFormItems).values({
        id: crypto.randomUUID(),
        formId: owned.form.id,
        kind,
        required: input.required !== false,
        config: config.json,
        createdAt: now,
      }),
    );
  }
  for (const implied of requirementDef(kind)?.implies ?? []) {
    if (items.some((i) => i.kind === implied)) continue;
    writes.push(
      db.insert(signupFormItems).values({
        id: crypto.randomUUID(),
        formId: owned.form.id,
        kind: implied,
        // Same weight as the requirement that needs it: a required rank check
        // can't pass without the Blizzard link anyway.
        required: input.required !== false,
        createdAt: now,
      }),
    );
  }
  writes.push(
    db.update(signupForms).set({ updatedAt: now }).where(eq(signupForms.id, owned.form.id)),
  );
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  revalidateForm(owned.form.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Questions — free-form, ordered by position.
// ---------------------------------------------------------------------------

export type QuestionInput = {
  kind: string;
  label: string;
  help: string;
  required: boolean;
  /** One choice per line, for the choice kinds. */
  options: string;
};

function questionFields(input: QuestionInput):
  | { ok: true; kind: string; label: string; help: string | null; required: boolean; config: string | null }
  | { ok: false; error: string } {
  if (!isQuestionKind(String(input.kind))) return { ok: false, error: "Pick a question type." };
  const label = clean(input.label, LABEL_MAX);
  if (!label) return { ok: false, error: "Write the question." };
  let config: string | null = null;
  if (isChoiceKind(input.kind)) {
    const { options } = choiceConfig({ options: String(input.options ?? "").split("\n") });
    if (!options.length) return { ok: false, error: "Add at least one choice, one per line." };
    config = JSON.stringify({ options });
  }
  return {
    ok: true,
    kind: input.kind,
    label,
    help: clean(input.help, HELP_MAX),
    required: input.required === true,
    config,
  };
}

export async function addQuestion(
  formId: string,
  input: QuestionInput,
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const fields = questionFields(input);
  if (!fields.ok) return fields;

  const items = await listFormItems(owned.form.id);
  if (items.filter((i) => isQuestionKind(i.kind)).length >= MAX_QUESTIONS) {
    return { ok: false, error: `A form can hold up to ${MAX_QUESTIONS} questions.` };
  }
  const db = getDb();
  const top = await db
    .select({ n: max(signupFormItems.position) })
    .from(signupFormItems)
    .where(eq(signupFormItems.formId, owned.form.id));
  const { ok: _ok, ...values } = fields;
  await db.insert(signupFormItems).values({
    id: crypto.randomUUID(),
    formId: owned.form.id,
    position: (top[0]?.n ?? 0) + 1,
    createdAt: new Date(),
    ...values,
  });
  await touch(owned.form.id);
  revalidateForm(owned.form.id);
  return { ok: true };
}

export async function updateQuestion(
  formId: string,
  itemId: string,
  input: QuestionInput,
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const fields = questionFields(input);
  if (!fields.ok) return fields;
  const { ok: _ok, ...values } = fields;
  await getDb()
    .update(signupFormItems)
    .set(values)
    .where(
      and(eq(signupFormItems.id, itemId), eq(signupFormItems.formId, owned.form.id)),
    );
  await touch(owned.form.id);
  revalidateForm(owned.form.id);
  return { ok: true };
}

/** Removes the question and, by cascade, every answer to it. */
export async function removeQuestion(
  formId: string,
  itemId: string,
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  await getDb()
    .delete(signupFormItems)
    .where(
      and(eq(signupFormItems.id, itemId), eq(signupFormItems.formId, owned.form.id)),
    );
  await touch(owned.form.id);
  revalidateForm(owned.form.id);
  return { ok: true };
}

/** Swap a question with its neighbour. Positions are rewritten densely. */
export async function moveQuestion(
  formId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<FormActionResult> {
  const owned = await ownForm(formId);
  if ("error" in owned) return { ok: false, error: owned.error };
  const questions = (await listFormItems(owned.form.id)).filter((i) =>
    isQuestionKind(i.kind),
  );
  const from = questions.findIndex((q) => q.id === itemId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= questions.length) return { ok: true };
  [questions[from], questions[to]] = [questions[to], questions[from]];

  const db = getDb();
  const writes = questions.map((q, index) =>
    db
      .update(signupFormItems)
      .set({ position: index + 1 })
      .where(eq(signupFormItems.id, q.id)),
  );
  await db.batch(writes as [(typeof writes)[number], ...typeof writes]);
  await touch(owned.form.id);
  revalidateForm(owned.form.id);
  return { ok: true };
}
