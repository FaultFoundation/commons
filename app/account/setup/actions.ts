"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  schools,
  schoolEmailVerifications,
  programMemberships,
  collegiateRegistrations,
} from "@/db/schema";
import { sendVerificationCodeEmail } from "@/lib/email";
import { syncRoleConnection } from "@/lib/integrations";
import {
  AGE_RANGES,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  RESEND_COOLDOWN_MS,
  USER_TYPES,
  emailDomain,
  ensureCollegiateMembership,
  ensureProfile,
  generateCode,
  getOrCreateCollege,
  getRegistrationState,
  hashCode,
  hashesEqual,
  hostnameOf,
  normalizeCodeInput,
  schoolEmailMatches,
  upsertCollegiateRegistration,
} from "@/lib/registration";

// ---------------------------------------------------------------------------
// Server actions for the registration flow. Every action re-checks the
// session and re-validates inputs — client state is presentation only.
// Results are plain serializable objects; nothing throws across the boundary.
//
// Writes fan out across three tables: the slim `profiles` (age/country), the
// generic `program_memberships` (status), and `collegiate_registrations`
// (school detail) hanging off it — via the helpers in lib/registration.ts.
// ---------------------------------------------------------------------------

export type SubmitInput = {
  userType: string;
  ageRange: string;
  country: string;
  schoolId?: number;
  schoolName?: string;
  schoolWebsite?: string;
  schoolEmail?: string;
  graduationDate?: string;
  referrer?: string;
  circumstances?: string;
};

export type SubmitResult =
  | { ok: true; outcome: "EMAIL_SENT"; email: string }
  | { ok: true; outcome: "MANUAL_REVIEW" }
  | { ok: false; error: string };

export type VerifyResult =
  | { ok: true }
  | { ok: false; error: string; attemptsRemaining?: number; expired?: boolean };

export type ResendResult =
  | { ok: true }
  | { ok: false; error: string; cooldownSeconds?: number };

async function requireUserId(): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

// Statuses the member can still act on; anything else (VERIFIED, INELIGIBLE,
// legacy KICKED/…) is read-only from the site.
function isOpenStatus(status: string | null): boolean {
  return status === null || status === "EMAIL_SENT" || status === "MANUAL_REVIEW";
}

/**
 * Send-throttling shared by submit and resend: 60s cooldown between sends,
 * max 5 sends per rolling 24h window (anchored at firstSentAt). The window
 * survives code replacement because the row is updated, never deleted.
 */
function sendWindow(
  row: { lastSentAt: Date; firstSentAt: Date; sendCount: number } | null,
  now: number,
):
  | { allowed: true; firstSentAt: Date; sendCount: number }
  | { allowed: false; error: string; cooldownSeconds?: number } {
  if (!row) return { allowed: true, firstSentAt: new Date(now), sendCount: 1 };

  const sinceLast = now - row.lastSentAt.getTime();
  if (sinceLast < RESEND_COOLDOWN_MS) {
    const cooldownSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
    return {
      allowed: false,
      error: `Please wait ${cooldownSeconds}s before requesting another code.`,
      cooldownSeconds,
    };
  }
  const windowActive = now - row.firstSentAt.getTime() < CODE_TTL_MS;
  if (windowActive && row.sendCount >= MAX_SENDS_PER_WINDOW) {
    return {
      allowed: false,
      error: "Too many codes requested. Try again tomorrow or contact support.",
    };
  }
  return {
    allowed: true,
    firstSentAt: windowActive ? row.firstSentAt : new Date(now),
    sendCount: windowActive ? row.sendCount + 1 : 1,
  };
}

async function issueCode(userId: string, email: string): Promise<SubmitResult> {
  const db = getDb();
  const now = Date.now();

  const existing =
    (
      await db
        .select()
        .from(schoolEmailVerifications)
        .where(eq(schoolEmailVerifications.userId, userId))
        .limit(1)
    )[0] ?? null;

  const window = sendWindow(existing, now);
  if (!window.allowed) return { ok: false, error: window.error };

  const code = generateCode();
  const codeHash = await hashCode(userId, code);
  const fields = {
    email,
    codeHash,
    expiresAt: new Date(now + CODE_TTL_MS),
    attempts: 0,
    sendCount: window.sendCount,
    lastSentAt: new Date(now),
    firstSentAt: window.firstSentAt,
    verifiedAt: null,
    updatedAt: new Date(now),
  };

  // Throttle state is committed before the send so a failing provider can't
  // be hammered for free sends.
  if (existing) {
    await db
      .update(schoolEmailVerifications)
      .set(fields)
      .where(eq(schoolEmailVerifications.userId, userId));
  } else {
    await db.insert(schoolEmailVerifications).values({
      id: crypto.randomUUID(),
      userId,
      ...fields,
    });
  }

  const sent = await sendVerificationCodeEmail({ to: email, code });
  if (!sent.ok) {
    return { ok: false, error: "We couldn't send the email — try again in a minute." };
  }
  return { ok: true, outcome: "EMAIL_SENT", email };
}

export async function submitRegistration(input: SubmitInput): Promise<SubmitResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const state = await getRegistrationState(userId);
  if (state && !isOpenStatus(state.status)) {
    return { ok: false, error: "Your registration can't be changed — contact staff." };
  }

  const userType = USER_TYPES.find((t) => t === input.userType);
  const ageRange = AGE_RANGES.find((a) => a === input.ageRange);
  const country = (input.country ?? "").trim();
  if (!userType) return { ok: false, error: "Pick a membership type." };
  if (!ageRange) return { ok: false, error: "Pick an age range." };

  const db = getDb();
  const memberCountry = country.slice(0, 100) || null;

  /**
   * Persist everything the member typed. Deliberately does NOT set a status:
   * the details must be safely stored before any email goes out, so that a
   * failing send (or any later error) can't strand someone on a status with
   * nothing saved behind it — they'd come back to an empty form.
   */
  const save = async (detail: {
    collegeId?: string | null;
    schoolEmail?: string | null;
    graduationDate?: string | null;
    referrer?: string | null;
    circumstances?: string | null;
    domainMatched?: boolean | null;
  }) => {
    await ensureProfile(userId, { ageRange, country: memberCountry });
    const membershipId = await ensureCollegiateMembership(userId, {});
    await upsertCollegiateRegistration(membershipId, { userType, ...detail });
  };

  /** Commit the outcome once everything that can fail already has. */
  const setStatus = async (status: "EMAIL_SENT" | "MANUAL_REVIEW") => {
    await ensureCollegiateMembership(userId, { status });
    revalidatePath("/home/", "layout");
    revalidatePath("/account/", "layout");
  };

  // --- "None of the above": straight to manual review, no school/email. ---
  if (userType === "None of the above") {
    const referrer = (input.referrer ?? "").trim().slice(0, 200);
    const circumstances = (input.circumstances ?? "").trim().slice(0, 2000);
    if (!circumstances) {
      return { ok: false, error: "Tell us a bit about your circumstances." };
    }
    await save({
      collegeId: null,
      referrer: referrer || null,
      circumstances,
      schoolEmail: null,
      graduationDate: null,
      domainMatched: null,
    });
    await setStatus("MANUAL_REVIEW");
    return { ok: true, outcome: "MANUAL_REVIEW" };
  }

  // --- School paths (university student / alumnus / high school). ---
  const schoolEmail = (input.schoolEmail ?? "").trim().toLowerCase().slice(0, 254);
  const domain = emailDomain(schoolEmail);
  if (!domain || schoolEmail.length < 6 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(schoolEmail)) {
    return { ok: false, error: "Enter a valid school email address." };
  }
  if (!country) return { ok: false, error: "Pick your country." };

  const isUniversity = userType !== "High school student";
  const needsGradDate = userType !== "University alumnus";
  const graduationDate = (input.graduationDate ?? "").trim().slice(0, 20);
  if (needsGradDate && !graduationDate) {
    return { ok: false, error: "Enter your expected graduation date." };
  }

  // Build the durable college record + decide whether the email domain matches.
  let collegeInput: Parameters<typeof getOrCreateCollege>[0];
  let matched: boolean;

  if (isUniversity && input.schoolId != null) {
    // Dataset school: authoritative domains come from D1; a user-edited
    // website never widens the match set.
    const school = (
      await db
        .select()
        .from(schools)
        .where(eq(schools.id, Math.trunc(input.schoolId)))
        .limit(1)
    )[0];
    if (!school) {
      return { ok: false, error: "School not found — search and select it again." };
    }
    if (school.name !== (input.schoolName ?? "").trim() || school.country !== country) {
      return {
        ok: false,
        error: "The school directory changed. Reload this page and select your school again.",
      };
    }
    let domains: string[] = [];
    let pages: string[] = [];
    try {
      domains = JSON.parse(school.domains) as string[];
      pages = JSON.parse(school.webPages) as string[];
    } catch {
      domains = [];
      pages = [];
    }
    const candidates = [
      ...domains,
      ...pages.map((p) => hostnameOf(p) ?? "").filter(Boolean),
    ];
    collegeInput = {
      name: school.name,
      country: school.country,
      alphaTwoCode: school.alphaTwoCode,
      stateProvince: school.stateProvince,
      domains,
      webPages: pages,
    };
    matched = schoolEmailMatches(schoolEmail, candidates);
  } else {
    // Manual entry (high school, or "my school isn't listed"). The only domain
    // evidence here is the user-entered website — checking a user-supplied
    // email against a user-supplied domain is circular, so this path can never
    // count as a domain match, however the two strings compare.
    const schoolName = (input.schoolName ?? "").trim().slice(0, 200);
    const schoolWebsite = (input.schoolWebsite ?? "").trim().slice(0, 300);
    if (!schoolName) return { ok: false, error: "Enter your school's name." };
    collegeInput = {
      name: schoolName,
      country: memberCountry,
      webPages: schoolWebsite ? [schoolWebsite] : [],
    };
    matched = false;
  }

  // Someone else already verified with this school email. That's a genuine
  // conflict between two people rather than weak evidence, so it's the one
  // school-path case that still can't self-serve. (Legacy imports may hold
  // dupes, hence no unique constraint.)
  const dupe = await db
    .select({ id: collegiateRegistrations.id })
    .from(collegiateRegistrations)
    .innerJoin(
      programMemberships,
      eq(programMemberships.id, collegiateRegistrations.membershipId),
    )
    .where(
      and(
        eq(collegiateRegistrations.schoolEmail, schoolEmail),
        eq(programMemberships.status, "VERIFIED"),
        state?.membershipId
          ? ne(collegiateRegistrations.membershipId, state.membershipId)
          : undefined,
      ),
    )
    .limit(1);

  const collegeId = await getOrCreateCollege(collegeInput);
  const detail = {
    collegeId,
    schoolEmail,
    graduationDate: graduationDate || null,
    referrer: null,
    circumstances: null,
    // Recorded, not enforced: a mismatch still gets a code today. The admin
    // layer sweeps `false` rows once it exists.
    domainMatched: matched,
  };

  // Everything the member typed lands in D1 first — see `save` above.
  await save(detail);

  if (dupe[0]) {
    await setStatus("MANUAL_REVIEW");
    return { ok: true, outcome: "MANUAL_REVIEW" };
  }

  const sent = await issueCode(userId, schoolEmail);
  if (sent.ok) {
    await setStatus("EMAIL_SENT");
  }
  return sent;
}

export async function resendCode(): Promise<ResendResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const state = await getRegistrationState(userId);
  if (state?.status !== "EMAIL_SENT" || !state.schoolEmail) {
    return { ok: false, error: "Nothing to resend — submit the form first." };
  }

  const result = await issueCode(userId, state.schoolEmail);
  if (!result.ok) {
    // Preserve the cooldown hint for the client countdown.
    const m = result.error.match(/wait (\d+)s/);
    return {
      ok: false,
      error: result.error,
      cooldownSeconds: m ? Number(m[1]) : undefined,
    };
  }
  return { ok: true };
}

export async function verifyCode(input: string): Promise<VerifyResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const state = await getRegistrationState(userId);
  if (state?.status !== "EMAIL_SENT" || !state.membershipId) {
    return { ok: false, error: "No verification in progress." };
  }

  const db = getDb();
  const row = (
    await db
      .select()
      .from(schoolEmailVerifications)
      .where(eq(schoolEmailVerifications.userId, userId))
      .limit(1)
  )[0];
  if (!row) return { ok: false, error: "No verification in progress." };

  const now = new Date();
  if (row.expiresAt.getTime() < now.getTime()) {
    return { ok: false, error: "That code has expired — request a new one.", expired: true };
  }

  // Count the attempt before comparing, atomically, so parallel guesses
  // can't exceed the cap.
  const counted = await db
    .update(schoolEmailVerifications)
    .set({ attempts: sql`${schoolEmailVerifications.attempts} + 1`, updatedAt: now })
    .where(
      and(
        eq(schoolEmailVerifications.userId, userId),
        sql`${schoolEmailVerifications.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .returning({ attempts: schoolEmailVerifications.attempts });
  if (!counted[0]) {
    return {
      ok: false,
      error: "Too many attempts — request a new code.",
      attemptsRemaining: 0,
    };
  }

  const normalized = normalizeCodeInput(input ?? "");
  const inputHash = await hashCode(userId, normalized);
  if (!normalized || !hashesEqual(inputHash, row.codeHash)) {
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - counted[0].attempts);
    return {
      ok: false,
      error:
        attemptsRemaining > 0
          ? "That code doesn't match."
          : "That code doesn't match, and you're out of attempts — request a new one.",
      attemptsRemaining,
    };
  }

  await db
    .update(schoolEmailVerifications)
    .set({ verifiedAt: now, updatedAt: now })
    .where(eq(schoolEmailVerifications.userId, userId));
  await db
    .update(programMemberships)
    .set({ status: "VERIFIED", verifiedAt: now, updatedAt: now })
    .where(eq(programMemberships.id, state.membershipId));

  // The moment the claim becomes true, tell Discord — that's what the server's
  // Linked Role gates on. Best-effort by design: verification stands whether or
  // not Discord is linked or reachable.
  await syncRoleConnection(userId, await headers());

  revalidatePath("/home/", "layout");
  revalidatePath("/account/", "layout");
  return { ok: true };
}
