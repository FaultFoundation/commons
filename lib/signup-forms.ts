import { cache } from "react";
import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";

import {
  signupFormItems,
  signupForms,
  signupResponseValues,
  signupResponses,
  user,
} from "@/db/schema";
import { getAccountLinks, getAccountLinksCached } from "@/lib/account-links";
import {
  battlenetAuthEnabled,
  challongeAuthEnabled,
  discordAuthEnabled,
  faceitAuthEnabled,
  startggAuthEnabled,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkDiscordGuild } from "@/lib/integrations";
import type { LinkableProvider } from "@/lib/integrations-shared";
import { withNext } from "@/lib/next-path";
import {
  getCachedOwState,
  refreshOwState,
  type OwSignupState,
} from "@/lib/ow-stats";
import { formatRank } from "@/lib/ow-stats-shared";
import {
  getPlatformIdentities,
  getPlatformIdentitiesCached,
} from "@/lib/platform-identities";
import {
  getRegistrationState,
  getRegistrationStateCached,
} from "@/lib/registration";
import {
  QUESTION_KINDS,
  REQUIREMENTS,
  academicConfig,
  discordServerConfig,
  emailOnDomains,
  formPath,
  parseItemConfig,
  type ExportResponse,
  type FormItem,
  type RequirementEvidence,
  type RequirementKind,
  type StoredValue,
} from "@/lib/signup-forms-shared";

// ---------------------------------------------------------------------------
// Sign-up forms — the server half. Form reads, the requirement checks, and the
// owner's response export. Writes live in the server actions
// (app/(dashboard)/forms/actions.ts for owners, app/f/[id]/actions.ts for
// members); every one of them re-derives ownership or the session first.
//
// Requirements are checked against the PERSON's existing verification (the
// collegiate registration, linked accounts, the OW registry), never re-asked
// per form. A page render runs them `live: false` — cached state only, so no
// render waits on OverFast. A submit runs them `live: true` and snapshots the
// evidence it found.
// ---------------------------------------------------------------------------

export type SignupForm = typeof signupForms.$inferSelect;

const FORM_ID_RE = /^[A-Za-z0-9]{10}$/;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Ten unbiased base62 characters (~59 bits): the form's key and public id. */
export function newFormId(): string {
  let out = "";
  while (out.length < 10) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      // 248 = 62 * 4: rejecting the tail keeps every character equally likely.
      if (b < 248 && out.length < 10) out += BASE62[b % 62];
    }
  }
  return out;
}

export async function getForm(id: string): Promise<SignupForm | null> {
  if (!FORM_ID_RE.test(id)) return null;
  const rows = await getDb()
    .select()
    .from(signupForms)
    .where(eq(signupForms.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export const getFormCached = cache(getForm);

export async function listFormItems(formId: string): Promise<FormItem[]> {
  const rows = await getDb()
    .select()
    .from(signupFormItems)
    .where(eq(signupFormItems.formId, formId))
    .orderBy(asc(signupFormItems.position), asc(signupFormItems.createdAt));
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    position: row.position,
    label: row.label,
    help: row.help,
    required: row.required,
    config: parseItemConfig(row.config),
  }));
}

export const listFormItemsCached = cache(listFormItems);

/** Only an open form before its close time takes submissions. */
export function formAcceptsResponses(form: SignupForm, now = Date.now()): boolean {
  if (form.status !== "open") return false;
  return !form.closesAt || form.closesAt.getTime() > now;
}

/** The form, only when `userId` owns it. */
export async function getOwnedForm(
  userId: string,
  formId: string,
): Promise<SignupForm | null> {
  const form = await getFormCached(formId);
  return form && form.ownerUserId === userId ? form : null;
}

export type MyFormRow = {
  id: string;
  title: string;
  status: string;
  closesAt: Date | null;
  updatedAt: Date;
  responses: number;
};

export async function listMyForms(userId: string): Promise<MyFormRow[]> {
  const rows = await getDb()
    .select({
      id: signupForms.id,
      title: signupForms.title,
      status: signupForms.status,
      closesAt: signupForms.closesAt,
      updatedAt: signupForms.updatedAt,
      responses: count(signupResponses.id),
    })
    .from(signupForms)
    .leftJoin(
      signupResponses,
      and(
        eq(signupResponses.formId, signupForms.id),
        eq(signupResponses.status, "submitted"),
      ),
    )
    .where(eq(signupForms.ownerUserId, userId))
    .groupBy(signupForms.id)
    .orderBy(desc(signupForms.createdAt));
  return rows;
}

/** The caller's other forms that have questions to import, newest first. */
export async function listImportSources(
  userId: string,
  excludeFormId: string,
): Promise<{ id: string; title: string; questions: number }[]> {
  const rows = await getDb()
    .select({
      id: signupForms.id,
      title: signupForms.title,
      questions: count(signupFormItems.id),
    })
    .from(signupForms)
    .innerJoin(
      signupFormItems,
      and(
        eq(signupFormItems.formId, signupForms.id),
        inArray(signupFormItems.kind, [...QUESTION_KINDS]),
      ),
    )
    .where(and(eq(signupForms.ownerUserId, userId), ne(signupForms.id, excludeFormId)))
    .groupBy(signupForms.id)
    .orderBy(desc(signupForms.createdAt));
  return rows;
}

export async function countOwnedForms(userId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: count() })
    .from(signupForms)
    .where(eq(signupForms.ownerUserId, userId));
  return rows[0]?.n ?? 0;
}

export async function countResponses(formId: string): Promise<number> {
  const rows = await getDb()
    .select({ n: count() })
    .from(signupResponses)
    .where(
      and(eq(signupResponses.formId, formId), eq(signupResponses.status, "submitted")),
    );
  return rows[0]?.n ?? 0;
}

function parseValue(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export type MyResponse = {
  id: string;
  status: string;
  submittedAt: Date;
  updatedAt: Date;
  values: Record<string, StoredValue>;
};

export async function getMyResponse(
  formId: string,
  userId: string,
): Promise<MyResponse | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(signupResponses)
    .where(
      and(eq(signupResponses.formId, formId), eq(signupResponses.userId, userId)),
    )
    .limit(1);
  const response = rows[0];
  if (!response) return null;
  const values = await db
    .select()
    .from(signupResponseValues)
    .where(eq(signupResponseValues.responseId, response.id));
  return {
    id: response.id,
    status: response.status,
    submittedAt: response.submittedAt,
    updatedAt: response.updatedAt,
    values: Object.fromEntries(
      values.map((v) => [v.itemId, { value: parseValue(v.value), met: v.met }]),
    ),
  };
}

/**
 * Every submitted response with its snapshot values, oldest first — the one
 * read behind the Responses table, the CSV and the printable report. Values are
 * joined through the response rows rather than an IN (...) list, which would
 * hit D1's bind limit on a large form.
 */
export async function listResponsesForExport(
  formId: string,
): Promise<ExportResponse[]> {
  const db = getDb();
  const [responses, values] = await Promise.all([
    db
      .select({
        id: signupResponses.id,
        status: signupResponses.status,
        submittedAt: signupResponses.submittedAt,
        updatedAt: signupResponses.updatedAt,
        name: user.name,
      })
      .from(signupResponses)
      .innerJoin(user, eq(user.id, signupResponses.userId))
      .where(
        and(
          eq(signupResponses.formId, formId),
          eq(signupResponses.status, "submitted"),
        ),
      )
      .orderBy(asc(signupResponses.submittedAt)),
    db
      .select({
        responseId: signupResponseValues.responseId,
        itemId: signupResponseValues.itemId,
        value: signupResponseValues.value,
        met: signupResponseValues.met,
      })
      .from(signupResponseValues)
      .innerJoin(
        signupResponses,
        eq(signupResponses.id, signupResponseValues.responseId),
      )
      .where(
        and(
          eq(signupResponses.formId, formId),
          eq(signupResponses.status, "submitted"),
        ),
      ),
  ]);

  const byResponse = new Map<string, Record<string, StoredValue>>();
  for (const v of values) {
    const bucket = byResponse.get(v.responseId) ?? {};
    bucket[v.itemId] = { value: parseValue(v.value), met: v.met };
    byResponse.set(v.responseId, bucket);
  }
  return responses.map((r) => ({
    name: r.name,
    status: r.status,
    submittedAt: r.submittedAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
    values: byResponse.get(r.id) ?? {},
  }));
}

// ---------------------------------------------------------------------------
// Requirement checks.
// ---------------------------------------------------------------------------

export type RequirementAction =
  | { type: "link"; provider: LinkableProvider; label: string; enabled: boolean }
  | { type: "href"; href: string; label: string; external?: boolean }
  | { type: "verify_email"; email: string }
  | { type: "recheck_ow" }
  | { type: "refresh" };

export type RequirementCheck = {
  itemId: string;
  kind: RequirementKind;
  label: string;
  required: boolean;
  /** true met / false not met / null couldn't tell (never counts as met). */
  met: boolean | null;
  status: string;
  note?: string;
  /** What the organizer receives — only present when met. */
  evidence: RequirementEvidence[RequirementKind] | null;
  action: RequirementAction | null;
};

export type CheckSubject = {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

const LINK_PROVIDERS: Record<
  "discord" | "battlenet" | "faceit" | "startgg" | "challonge",
  { label: string; enabled: () => boolean }
> = {
  discord: { label: "Link Discord", enabled: discordAuthEnabled },
  battlenet: { label: "Link Blizzard", enabled: battlenetAuthEnabled },
  faceit: { label: "Connect FACEIT", enabled: faceitAuthEnabled },
  startgg: { label: "Connect start.gg", enabled: startggAuthEnabled },
  challonge: { label: "Connect Challonge", enabled: challongeAuthEnabled },
};

function linkAction(provider: keyof typeof LINK_PROVIDERS): RequirementAction {
  const p = LINK_PROVIDERS[provider];
  return { type: "link", provider, label: p.label, enabled: p.enabled() };
}

const OW_PRIVATE_NOTE =
  "In Overwatch: Options → Social → Career Profile Visibility → Everyone. A change can take up to an hour to show here.";

/**
 * Check every requirement on a form for one member, in registry order.
 * `live: false` reads cached state only (page renders); `live: true` re-reads
 * fresh state and calls OverFast when its caches are due (submit, "check
 * again"). Discord server membership is one call to Discord either way — the
 * Integrations step already pays that on render.
 */
export async function checkRequirements({
  subject,
  formId,
  items,
  headers,
  live,
  forceOw = false,
}: {
  subject: CheckSubject;
  formId: string;
  items: FormItem[];
  headers: Headers;
  live: boolean;
  forceOw?: boolean;
}): Promise<RequirementCheck[]> {
  const kinds = new Set(items.map((i) => i.kind));
  const has = (...ks: RequirementKind[]) => ks.some((k) => kinds.has(k));
  const { userId } = subject;
  const back = formPath(formId);

  const needsLinks = has(
    "discord",
    "discord_server",
    "battlenet",
    "ow_public",
    "ow_rank",
    "faceit",
    "startgg",
    "challonge",
  );
  const [reg, links, identities] = await Promise.all([
    has("academic")
      ? live
        ? getRegistrationState(userId)
        : getRegistrationStateCached(userId)
      : Promise.resolve(null),
    needsLinks
      ? live
        ? getAccountLinks(userId)
        : getAccountLinksCached(userId)
      : Promise.resolve([]),
    needsLinks
      ? live
        ? getPlatformIdentities(userId)
        : getPlatformIdentitiesCached(userId)
      : Promise.resolve([]),
  ]);
  const linked = new Set(links.map((l) => l.providerId));
  const identity = (provider: string) =>
    identities.find((i) => i.provider === provider) ?? null;

  const battletag = identity("battlenet")?.handle ?? null;
  let ow: OwSignupState | null = null;
  if (has("ow_public", "ow_rank") && linked.has("battlenet") && battletag) {
    ow = live
      ? await refreshOwState(userId, battletag, { force: forceOw })
      : await getCachedOwState(userId);
  }

  const checks: RequirementCheck[] = [];
  for (const def of REQUIREMENTS) {
    const item = items.find((i) => i.kind === def.kind);
    if (!item) continue;
    const base = {
      itemId: item.id,
      kind: def.kind,
      label: def.label,
      required: item.required,
    };
    const unmet = (
      status: string,
      action: RequirementAction | null = null,
      note?: string,
      met: false | null = false,
    ): RequirementCheck => ({ ...base, met, status, note, action, evidence: null });

    switch (def.kind) {
      case "account_email": {
        checks.push(
          subject.emailVerified
            ? {
                ...base,
                met: true,
                status: `Verified · ${subject.email}`,
                action: null,
                evidence: { email: subject.email },
              }
            : unmet(`${subject.email} isn't verified yet`, {
                type: "verify_email",
                email: subject.email,
              }),
        );
        break;
      }

      case "academic": {
        const { domains } = academicConfig(item.config);
        const status = reg?.status ?? null;
        const verify = (path: string, label: string): RequirementAction => ({
          type: "href",
          href: withNext(path, back),
          label,
        });
        if (status === "VERIFIED" && reg?.userType !== "None of the above") {
          if (domains.length && !emailOnDomains(reg?.schoolEmail ?? null, domains)) {
            checks.push(
              unmet(
                "Verified, but not with a school email this form accepts",
                null,
                `Accepted school emails: ${domains.join(", ")}. Schools can only be changed by a support member.`,
              ),
            );
            break;
          }
          const at = reg?.schoolEmail?.lastIndexOf("@") ?? -1;
          checks.push({
            ...base,
            met: true,
            status: `Verified · ${reg?.schoolName ?? "School on file"}`,
            action: null,
            evidence: {
              school: reg?.schoolName ?? null,
              memberType: reg?.userType ?? null,
              emailDomain:
                reg?.schoolEmail && at >= 0 ? reg.schoolEmail.slice(at + 1) : null,
            },
          });
        } else if (status === "VERIFIED") {
          checks.push(
            unmet(
              "Your membership isn't tied to a school",
              null,
              "You joined without a school. Contact support@fault.foundation to add one.",
            ),
          );
        } else if (status === "EMAIL_SENT") {
          checks.push(
            unmet(
              `Code sent to ${reg?.schoolEmail ?? "your school email"}`,
              verify("/verify/code/", "Enter Code"),
            ),
          );
        } else if (status === "CONSENT_PENDING") {
          checks.push(
            unmet(
              "Waiting for your parent or guardian",
              null,
              "They need to open the link we emailed them.",
            ),
          );
        } else if (status === "MANUAL_REVIEW") {
          checks.push(
            unmet("In staff review", null, "We've opened a ticket in Discord and will follow up there."),
          );
        } else if (status === null) {
          checks.push(
            unmet(
              "Not verified",
              verify("/verify/academic/", "Verify"),
              domains.length ? `Accepted school emails: ${domains.join(", ")}.` : undefined,
            ),
          );
        } else {
          checks.push(
            unmet("On hold", null, "Reach out to staff on Discord or email support@fault.foundation."),
          );
        }
        break;
      }

      case "discord":
      case "battlenet":
      case "faceit":
      case "startgg":
      case "challonge": {
        if (!linked.has(def.kind)) {
          checks.push(unmet("Not linked", linkAction(def.kind)));
          break;
        }
        const id = identity(def.kind);
        const handle = id?.handle ?? null;
        checks.push({
          ...base,
          met: true,
          status: handle ? `Linked · ${handle}` : "Linked",
          action: null,
          evidence:
            def.kind === "battlenet"
              ? { battletag: handle }
              : { handle, id: id?.externalId ?? null },
        });
        break;
      }

      case "discord_server": {
        const cfg = discordServerConfig(item.config);
        if (!cfg) {
          checks.push(unmet("This form's server isn't set up", null, "Let the organizer know.", null));
          break;
        }
        const serverName = cfg.serverName ?? "the organizer's server";
        const joinAction: RequirementAction | null = cfg.inviteUrl
          ? { type: "href", href: cfg.inviteUrl, label: "Join Server", external: true }
          : null;
        const guild = await checkDiscordGuild(userId, cfg.guildId, headers);
        if (guild.state === "not_linked") {
          checks.push(unmet("Link Discord first", linkAction("discord")));
        } else if (guild.state === "no_scope") {
          checks.push(
            unmet(
              "We can't see your servers yet",
              { type: "href", href: "/account/", label: "Settings" },
              "Your Discord link predates server checks. Unlink Discord in Settings and link it again.",
              null,
            ),
          );
        } else if (guild.inGuild === true) {
          checks.push({
            ...base,
            met: true,
            status: `In ${serverName}`,
            action: null,
            evidence: { server: cfg.serverName, inServer: true },
          });
        } else if (guild.inGuild === false) {
          checks.push(
            unmet(
              `Not in ${serverName}`,
              joinAction ?? { type: "refresh" },
              joinAction ? "Join, then check again." : "Ask the organizer for an invite, then check again.",
            ),
          );
        } else {
          checks.push(unmet("Couldn't reach Discord", { type: "refresh" }, undefined, null));
        }
        break;
      }

      case "ow_public":
      case "ow_rank": {
        if (!linked.has("battlenet") || !battletag) {
          checks.push(unmet("Link Blizzard first", linkAction("battlenet")));
          break;
        }
        const visibility = ow?.visibility ?? null;
        if (visibility === "private") {
          checks.push(unmet("Your career profile is private", { type: "recheck_ow" }, OW_PRIVATE_NOTE));
          break;
        }
        if (visibility === "not_found") {
          checks.push(
            unmet(`Blizzard has no career profile for ${battletag}`, { type: "recheck_ow" }),
          );
          break;
        }
        if (visibility !== "public") {
          checks.push(unmet("Not checked yet", { type: "recheck_ow" }, undefined, null));
          break;
        }
        if (def.kind === "ow_public") {
          checks.push({
            ...base,
            met: true,
            status: "Public",
            action: null,
            evidence: { public: true },
          });
          break;
        }
        const latest = ow?.latest ?? null;
        if (!latest) {
          checks.push(unmet("Rank not pulled yet", { type: "recheck_ow" }, undefined, null));
          break;
        }
        const ranks = {
          tank: formatRank(latest.tank),
          damage: formatRank(latest.damage),
          support: formatRank(latest.support),
          open: formatRank(latest.open),
        };
        checks.push({
          ...base,
          met: true,
          status: `Tank ${ranks.tank} · Damage ${ranks.damage} · Support ${ranks.support}`,
          note: `As of ${new Date(latest.capturedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}.`,
          action: null,
          evidence: { season: latest.season, ...ranks, capturedAt: latest.capturedAt },
        });
        break;
      }
    }
  }
  return checks;
}

/** A required requirement that isn't met (or couldn't be confirmed) blocks a submit. */
export function blockingChecks(checks: RequirementCheck[]): RequirementCheck[] {
  return checks.filter((c) => c.required && c.met !== true);
}
