import { cache } from "react";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  profiles,
  colleges,
  programMemberships,
  collegiateRegistrations,
  schools,
  teamMembers,
  teams,
  user,
} from "@/db/schema";
import {
  getAccountLinks,
  getAccountLinksCached,
} from "@/lib/account-links";
import { PROGRAM_COLLEGIATE_ID } from "@/lib/programs";
import { CODE_LENGTH } from "@/lib/registration-shared";

// ---------------------------------------------------------------------------
// Registration constants (mirroring the legacy sheet/Apps Script flow).
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 5;
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 5; // per CODE_TTL_MS window

export {
  AGE_RANGES,
  CODE_LENGTH,
  USER_TYPES,
  type RegistrationStatus,
  type UserType,
} from "@/lib/registration-shared";

// ---------------------------------------------------------------------------
// Verification codes. Plaintext is never stored: only sha256(userId:CODE),
// so a D1 leak doesn't expose usable codes. 31^6 ≈ 8.9e8 is plenty for a
// 24h-TTL code capped at 5 online guesses.
// ---------------------------------------------------------------------------

// Uppercase letters + digits only (no symbols), minus 0/O/1/I/L so hand-typed
// codes are unambiguous. CODE_LENGTH is re-exported above from the
// client-safe module — the entry field needs it too.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(): string {
  const limit = 256 - (256 % CODE_ALPHABET.length); // rejection sampling
  let code = "";
  while (code.length < CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2));
    for (const b of bytes) {
      if (b < limit && code.length < CODE_LENGTH) {
        code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      }
    }
  }
  return code;
}

/** Codes are typed as shown; spaces and stray dashes from a paste are dropped. */
export function normalizeCodeInput(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export async function hashCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time equality for the two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// School-email domain validation (port of the bot's domain_validator +
// Apps Script logic). The email's domain must be, or be a subdomain of, a
// domain the school is known by.
// ---------------------------------------------------------------------------

// Consumer mailboxes can never stand in for a school domain on the
// manual-entry paths.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
]);

export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase();
}

export function isFreeEmailDomain(domain: string): boolean {
  return FREE_EMAIL_DOMAINS.has(domain);
}

/** Hostname (sans www.) of a URL or bare-domain string, or null. */
export function hostnameOf(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** True when `domain` equals or is a subdomain of `base`. */
function domainMatches(domain: string, base: string): boolean {
  const b = base.toLowerCase().replace(/^www\./, "");
  return domain === b || domain.endsWith(`.${b}`);
}

/**
 * Whether the email's domain matches any of the school's known domains.
 * `candidates` holds dataset domains[] entries, dataset web_pages[]
 * hostnames, and/or the user-entered website hostname (manual paths only).
 */
export function schoolEmailMatches(email: string, candidates: string[]): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return candidates.some((c) => c && domainMatches(domain, c));
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Countries the school directory actually covers, for the country selects
 * that gate a school search (registration) or label a team's region. Read
 * from D1 rather than a hardcoded list so it can never drift from the seed.
 */
export async function listSchoolCountries(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ country: schools.country })
    .from(schools)
    .orderBy(schools.country);
  return rows.map((r) => r.country);
}

/** Slim cross-program person row (country / age range / dm pref), or null. */
export async function getProfile(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Request-scoped profile read for server-rendered pages and components. */
export const getProfileCached = cache(getProfile);

export type RegistrationState = {
  membershipId: string | null;
  status: string | null;
  verifiedAt: Date | null;
  userType: string | null;
  ageRange: string | null;
  country: string | null;
  schoolName: string | null;
  schoolWebsite: string | null;
  schoolEmail: string | null;
  graduationDate: string | null;
  referrer: string | null;
  circumstances: string | null;
  collegeId: string | null;
};

/**
 * Composed view the dashboard reads: the member's collegiate-program
 * membership + its detail row + the affiliated college, plus person-level
 * profile fields. Returns null when the member has neither a profile nor a
 * membership yet.
 */
async function readRegistrationState(
  userId: string,
  loadProfile: typeof getProfile,
): Promise<RegistrationState | null> {
  const db = getDb();
  const [profile, rows] = await Promise.all([
    loadProfile(userId),
    db
      .select({
        membershipId: programMemberships.id,
        status: programMemberships.status,
        verifiedAt: programMemberships.verifiedAt,
        userType: collegiateRegistrations.userType,
        schoolEmail: collegiateRegistrations.schoolEmail,
        graduationDate: collegiateRegistrations.graduationDate,
        referrer: collegiateRegistrations.referrer,
        circumstances: collegiateRegistrations.circumstances,
        collegeId: collegiateRegistrations.collegeId,
        collegeName: colleges.name,
        collegeWebPages: colleges.webPages,
      })
      .from(programMemberships)
      .leftJoin(
        collegiateRegistrations,
        eq(collegiateRegistrations.membershipId, programMemberships.id),
      )
      .leftJoin(colleges, eq(colleges.id, collegiateRegistrations.collegeId))
      .where(
        and(
          eq(programMemberships.userId, userId),
          eq(programMemberships.programId, PROGRAM_COLLEGIATE_ID),
        ),
      )
      .limit(1),
  ]);

  const row = rows[0];
  if (!profile && !row) return null;

  let schoolWebsite: string | null = null;
  if (row?.collegeWebPages) {
    try {
      schoolWebsite = (JSON.parse(row.collegeWebPages) as string[])[0] ?? null;
    } catch {
      // corrupt college row: leave website empty
    }
  }

  return {
    membershipId: row?.membershipId ?? null,
    status: row?.status ?? null,
    verifiedAt: row?.verifiedAt ?? null,
    userType: row?.userType ?? null,
    ageRange: profile?.ageRange ?? null,
    country: profile?.country ?? null,
    schoolName: row?.collegeName ?? null,
    schoolWebsite,
    schoolEmail: row?.schoolEmail ?? null,
    graduationDate: row?.graduationDate ?? null,
    referrer: row?.referrer ?? null,
    circumstances: row?.circumstances ?? null,
    collegeId: row?.collegeId ?? null,
  };
}

/** Fresh registration read for mutations and other write-adjacent work. */
export async function getRegistrationState(
  userId: string,
): Promise<RegistrationState | null> {
  return readRegistrationState(userId, getProfile);
}

/** Request-scoped registration read for server-rendered pages and components. */
export const getRegistrationStateCached = cache((userId: string) =>
  readRegistrationState(userId, getProfileCached),
);

/** A registration waiting on a staff decision — the verification queue's row. */
export type ReviewMember = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  userType: string | null;
  ageRange: string | null;
  schoolName: string | null;
  schoolEmail: string | null;
  graduationDate: string | null;
  referrer: string | null;
  circumstances: string | null;
  createdAt: number;
};

/**
 * Everyone parked in MANUAL_REVIEW — chiefly alumni without a school email.
 * The staff verification panel lists these and flips them to VERIFIED or
 * INELIGIBLE. Oldest first (longest-waiting on top).
 */
export async function listManualReviewMembers(): Promise<ReviewMember[]> {
  const rows = await getDb()
    .select({
      userId: programMemberships.userId,
      membershipId: programMemberships.id,
      name: user.name,
      email: user.email,
      userType: collegiateRegistrations.userType,
      schoolEmail: collegiateRegistrations.schoolEmail,
      graduationDate: collegiateRegistrations.graduationDate,
      referrer: collegiateRegistrations.referrer,
      circumstances: collegiateRegistrations.circumstances,
      collegeName: colleges.name,
      ageRange: profiles.ageRange,
      createdAt: programMemberships.createdAt,
    })
    .from(programMemberships)
    .innerJoin(user, eq(user.id, programMemberships.userId))
    .leftJoin(
      collegiateRegistrations,
      eq(collegiateRegistrations.membershipId, programMemberships.id),
    )
    .leftJoin(colleges, eq(colleges.id, collegiateRegistrations.collegeId))
    .leftJoin(profiles, eq(profiles.userId, programMemberships.userId))
    .where(
      and(
        eq(programMemberships.programId, PROGRAM_COLLEGIATE_ID),
        eq(programMemberships.status, "MANUAL_REVIEW"),
      ),
    )
    .orderBy(programMemberships.createdAt);

  return rows.map((r) => ({
    userId: r.userId,
    membershipId: r.membershipId,
    name: r.name,
    email: r.email,
    userType: r.userType,
    ageRange: r.ageRange,
    schoolName: r.collegeName ?? null,
    schoolEmail: r.schoolEmail,
    graduationDate: r.graduationDate,
    referrer: r.referrer,
    circumstances: r.circumstances,
    createdAt: r.createdAt.getTime(),
  }));
}

/** Which setup steps are actually finished, in step-rail order. */
export type SetupProgress = {
  /** Step 1 — academic email verified. */
  academic: boolean;
  /** Step 2 — every required platform account linked. */
  integrations: boolean;
  /** Step 3 — team / tournaments. */
  team: boolean;
};

/** Platform accounts a member must link before setup counts as done. */
export const REQUIRED_PROVIDERS = ["discord", "battlenet"] as const;

/**
 * Single source of truth for setup completion: drives both the step rail's
 * checkmarks (SetupShell) and the resume redirect (/account/setup/), so the two
 * can't drift apart and send someone to a step the rail calls finished.
 */
async function readSetupProgress(
  userId: string,
  loadRegistrationState: typeof getRegistrationState,
  loadAccountLinks: typeof getAccountLinks,
): Promise<SetupProgress> {
  const [reg, accountRows, teamRows] = await Promise.all([
    loadRegistrationState(userId),
    loadAccountLinks(userId),
    getDb()
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(
          eq(teamMembers.userId, userId),
          eq(teamMembers.status, "active"),
          isNull(teams.disbandedAt),
        ),
      )
      .limit(1),
  ]);
  const linked = new Set(accountRows.map((r) => r.providerId));

  return {
    academic: reg?.status === "VERIFIED",
    // Every program we run today is Overwatch, so a verified BattleTag is as
    // load-bearing as Discord. If the site ever runs events for other games,
    // this is the line to make per-game (e.g. required only once someone
    // registers for a tournament that needs that platform).
    integrations: REQUIRED_PROVIDERS.every((p) => linked.has(p)),
    // Being on a roster is the whole of step 3; entering a tournament is a
    // team decision, not a personal setup task.
    team: teamRows.length > 0,
  };
}

/** Fresh setup-progress read for write-adjacent work. */
export async function getSetupProgress(userId: string): Promise<SetupProgress> {
  return readSetupProgress(userId, getRegistrationState, getAccountLinks);
}

/** Request-scoped setup progress for server-rendered pages and components. */
export const getSetupProgressCached = cache((userId: string) =>
  readSetupProgress(
    userId,
    getRegistrationStateCached,
    getAccountLinksCached,
  ),
);

// ---------------------------------------------------------------------------
// Write helpers (registration flow). Each ensures its row exists then patches.
// ---------------------------------------------------------------------------

/** Upsert the slim person profile; returns its id. */
export async function ensureProfile(
  userId: string,
  fields: {
    ageRange?: string | null;
    country?: string | null;
    /** compact | cozy | comfortable — see lib/density.ts. */
    density?: string;
    /** JSON array of Home widget ids (lib/home-shared.ts), or null to reset. */
    homeLayout?: string | null;
  },
): Promise<string> {
  const db = getDb();
  const now = new Date();
  const existing = await getProfile(userId);
  if (existing) {
    await db
      .update(profiles)
      .set({ ...fields, updatedAt: now })
      .where(eq(profiles.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(profiles).values({ id, userId, ...fields });
  return id;
}

/** Upsert the user's collegiate-program membership; returns its id. */
export async function ensureCollegiateMembership(
  userId: string,
  patch: { status?: string | null; verifiedAt?: Date | null },
): Promise<string> {
  const db = getDb();
  const now = new Date();
  const existing = (
    await db
      .select({ id: programMemberships.id })
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.userId, userId),
          eq(programMemberships.programId, PROGRAM_COLLEGIATE_ID),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    await db
      .update(programMemberships)
      .set({ ...patch, updatedAt: now })
      .where(eq(programMemberships.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(programMemberships).values({
    id,
    userId,
    programId: PROGRAM_COLLEGIATE_ID,
    ...patch,
  });
  return id;
}

/** Upsert the collegiate detail row hanging off a membership. */
export async function upsertCollegiateRegistration(
  membershipId: string,
  fields: {
    collegeId?: string | null;
    userType?: string | null;
    schoolEmail?: string | null;
    graduationDate?: string | null;
    referrer?: string | null;
    circumstances?: string | null;
    domainMatched?: boolean | null;
  },
): Promise<string> {
  const db = getDb();
  const now = new Date();
  const existing = (
    await db
      .select({ id: collegiateRegistrations.id })
      .from(collegiateRegistrations)
      .where(eq(collegiateRegistrations.membershipId, membershipId))
      .limit(1)
  )[0];
  if (existing) {
    await db
      .update(collegiateRegistrations)
      .set({ ...fields, updatedAt: now })
      .where(eq(collegiateRegistrations.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(collegiateRegistrations).values({ id, membershipId, ...fields });
  return id;
}

/**
 * Resolve a durable `colleges` row for a school, creating it on first use.
 * Deduped by primary_domain so re-affiliations reuse the row; manual entries
 * with no resolvable domain always create a fresh row.
 */
export async function getOrCreateCollege(input: {
  name: string;
  country?: string | null;
  alphaTwoCode?: string | null;
  stateProvince?: string | null;
  domains?: string[] | null;
  webPages?: string[] | null;
}): Promise<string> {
  const db = getDb();
  const domains = input.domains ?? [];
  const webPages = input.webPages ?? [];
  const primaryDomain =
    (domains[0] ? domains[0].toLowerCase().replace(/^www\./, "") : null) ??
    (webPages[0] ? hostnameOf(webPages[0]) : null);

  if (primaryDomain) {
    const existing = (
      await db
        .select({ id: colleges.id })
        .from(colleges)
        .where(eq(colleges.primaryDomain, primaryDomain))
        .limit(1)
    )[0];
    if (existing) return existing.id;
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(colleges).values({
      id,
      name: input.name,
      country: input.country ?? null,
      alphaTwoCode: input.alphaTwoCode ?? null,
      stateProvince: input.stateProvince ?? null,
      primaryDomain,
      domains: domains.length ? JSON.stringify(domains) : null,
      webPages: webPages.length ? JSON.stringify(webPages) : null,
    });
    return id;
  } catch (error) {
    // Lost a race on the unique primary_domain — reuse the winner.
    if (primaryDomain) {
      const again = (
        await db
          .select({ id: colleges.id })
          .from(colleges)
          .where(eq(colleges.primaryDomain, primaryDomain))
          .limit(1)
      )[0];
      if (again) return again.id;
    }
    throw error;
  }
}
