"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { profiles, schools, schoolEmailVerifications } from "@/db/schema";
import { sendVerificationCodeEmail } from "@/lib/email";
import {
  AGE_RANGES,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_WINDOW,
  RESEND_COOLDOWN_MS,
  USER_TYPES,
  type UserType,
  emailDomain,
  formatCode,
  generateCode,
  getProfileByUserId,
  hashCode,
  hashesEqual,
  hostnameOf,
  isFreeEmailDomain,
  normalizeCodeInput,
  schoolEmailMatches,
} from "@/lib/registration";

// ---------------------------------------------------------------------------
// Server actions for the registration flow. Every action re-checks the
// session and re-validates inputs — client state is presentation only.
// Results are plain serializable objects; nothing throws across the boundary.
// ---------------------------------------------------------------------------

export type SchoolHit = { id: number; name: string; website: string };

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

export async function searchSchools(
  country: string,
  query: string,
): Promise<{ ok: boolean; hits: SchoolHit[] }> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, hits: [] };

  const q = query.trim();
  if (!country || q.length < 2 || q.length > 120) return { ok: true, hits: [] };

  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const db = getDb();
  const rows = await db
    .select({
      id: schools.id,
      name: schools.name,
      webPages: schools.webPages,
    })
    .from(schools)
    .where(
      and(eq(schools.country, country), sql`${schools.name} LIKE ${pattern} ESCAPE '\\'`),
    )
    .orderBy(schools.name)
    .limit(8);

  return {
    ok: true,
    hits: rows.map((r) => {
      let website = "";
      try {
        website = (JSON.parse(r.webPages) as string[])[0] ?? "";
      } catch {
        // corrupt seed row: leave website empty
      }
      return { id: r.id, name: r.name, website };
    }),
  };
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

  const sent = await sendVerificationCodeEmail({ to: email, code: formatCode(code) });
  if (!sent.ok) {
    return { ok: false, error: "We couldn't send the email — try again in a minute." };
  }
  return { ok: true, outcome: "EMAIL_SENT", email };
}

export async function submitRegistration(input: SubmitInput): Promise<SubmitResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const profile = await getProfileByUserId(userId);
  if (profile && !isOpenStatus(profile.status)) {
    return { ok: false, error: "Your registration can't be changed — contact staff." };
  }

  const userType = USER_TYPES.find((t) => t === input.userType);
  const ageRange = AGE_RANGES.find((a) => a === input.ageRange);
  const country = (input.country ?? "").trim();
  if (!userType) return { ok: false, error: "Pick a membership type." };
  if (!ageRange) return { ok: false, error: "Pick an age range." };

  const db = getDb();
  const base = {
    userType,
    ageRange,
    updatedAt: new Date(),
  };

  const finish = async (
    fields: Partial<typeof profiles.$inferInsert>,
    status: "EMAIL_SENT" | "MANUAL_REVIEW",
  ) => {
    const values = { ...base, ...fields, status };
    if (profile) {
      await db.update(profiles).set(values).where(eq(profiles.id, profile.id));
    } else {
      await db.insert(profiles).values({ id: crypto.randomUUID(), userId, ...values });
    }
    revalidatePath("/dashboard/");
    revalidatePath("/dashboard/register/");
  };

  // --- "None of the above": straight to manual review, no school/email. ---
  if (userType === "None of the above") {
    const referrer = (input.referrer ?? "").trim().slice(0, 200);
    const circumstances = (input.circumstances ?? "").trim().slice(0, 2000);
    if (!circumstances) {
      return { ok: false, error: "Tell us a bit about your circumstances." };
    }
    await finish(
      {
        country: country.slice(0, 100) || null,
        referrer: referrer || null,
        circumstances,
        schoolName: null,
        schoolWebsite: null,
        schoolEmail: null,
        graduationDate: null,
      },
      "MANUAL_REVIEW",
    );
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

  let schoolName: string;
  let schoolWebsite: string;
  let schoolCountry = country.slice(0, 100);
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
    let candidates: string[] = [];
    let firstPage = "";
    try {
      const domains = JSON.parse(school.domains) as string[];
      const pages = JSON.parse(school.webPages) as string[];
      firstPage = pages[0] ?? "";
      candidates = [
        ...domains,
        ...pages.map((p) => hostnameOf(p) ?? "").filter(Boolean),
      ];
    } catch {
      candidates = [];
    }
    schoolName = school.name;
    schoolWebsite = (input.schoolWebsite ?? "").trim().slice(0, 300) || firstPage;
    schoolCountry = school.country;
    matched = schoolEmailMatches(schoolEmail, candidates);
  } else {
    // Manual entry (high school, or "my school isn't listed"): the entered
    // website is the only domain evidence, and free mailboxes never pass.
    schoolName = (input.schoolName ?? "").trim().slice(0, 200);
    schoolWebsite = (input.schoolWebsite ?? "").trim().slice(0, 300);
    if (!schoolName) return { ok: false, error: "Enter your school's name." };
    const siteHost = hostnameOf(schoolWebsite);
    matched =
      !isFreeEmailDomain(domain) &&
      siteHost !== null &&
      !isFreeEmailDomain(siteHost) &&
      schoolEmailMatches(schoolEmail, [siteHost]);
  }

  // Someone else already verified with this school email → human review
  // (legacy imports may hold dupes, so no unique constraint).
  if (matched) {
    const dupe = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(
        and(
          eq(profiles.schoolEmail, schoolEmail),
          eq(profiles.status, "VERIFIED"),
          profile ? ne(profiles.id, profile.id) : undefined,
        ),
      )
      .limit(1);
    if (dupe[0]) matched = false;
  }

  const fields = {
    country: schoolCountry,
    schoolName,
    schoolWebsite: schoolWebsite || null,
    schoolEmail,
    graduationDate: graduationDate || null,
    referrer: null,
    circumstances: null,
  };

  if (!matched) {
    await finish(fields, "MANUAL_REVIEW");
    return { ok: true, outcome: "MANUAL_REVIEW" };
  }

  const sent = await issueCode(userId, schoolEmail);
  if (sent.ok) {
    await finish(fields, "EMAIL_SENT");
  }
  return sent;
}

export async function resendCode(): Promise<ResendResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: "You need to be signed in." };

  const profile = await getProfileByUserId(userId);
  if (profile?.status !== "EMAIL_SENT" || !profile.schoolEmail) {
    return { ok: false, error: "Nothing to resend — submit the form first." };
  }

  const result = await issueCode(userId, profile.schoolEmail);
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

  const profile = await getProfileByUserId(userId);
  if (profile?.status !== "EMAIL_SENT") {
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
    .update(profiles)
    .set({ status: "VERIFIED", verifiedAt: now, updatedAt: now })
    .where(eq(profiles.id, profile.id));

  revalidatePath("/dashboard/");
  revalidatePath("/dashboard/register/");
  return { ok: true };
}
