import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";

import { parentalConsents, programMemberships } from "@/db/schema";
import { getDb } from "@/lib/db";
import { sendParentalConsentEmail } from "@/lib/email";
import { syncRoleConnection } from "@/lib/integrations";
import { PROGRAM_COLLEGIATE_ID } from "@/lib/programs";
import { MAX_SENDS_PER_WINDOW, RESEND_COOLDOWN_MS } from "@/lib/registration";

// ---------------------------------------------------------------------------
// Parental-consent tokens for minor (13–17) registrants. The verification is
// the parent opening the emailed link — no code, no document. The raw token is
// only ever in the URL; we store sha256(token) and look the row up by that on
// click. Throttled like the school-email codes so the send can't be hammered.
// ---------------------------------------------------------------------------

export const CONSENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// URL-safe, unambiguous when retyped; ~190 bits at length 32 — a bearer link.
const TOKEN_ALPHABET =
  "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const TOKEN_LENGTH = 32;

function generateToken(): string {
  const limit = 256 - (256 % TOKEN_ALPHABET.length);
  let token = "";
  while (token.length < TOKEN_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH * 2));
    for (const b of bytes) {
      if (b < limit && token.length < TOKEN_LENGTH) {
        token += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
      }
    }
  }
  return token;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The user's current consent row, or null. */
export async function getPendingConsent(userId: string) {
  const rows = await getDb()
    .select()
    .from(parentalConsents)
    .where(eq(parentalConsents.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export type ConsentIssueResult =
  | { ok: true; parentEmail: string }
  | { ok: false; error: string; cooldownSeconds?: number };

/**
 * Create (or refresh) a pending consent request and email the parent a link.
 * Any resend rotates the token, invalidating the previous link.
 */
export async function issueParentalConsent(
  userId: string,
  parentEmailRaw: string,
  memberName: string,
): Promise<ConsentIssueResult> {
  const parentEmail = parentEmailRaw.trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    return { ok: false, error: "Enter a valid parent or guardian email." };
  }

  const db = getDb();
  const now = Date.now();
  const existing = await getPendingConsent(userId);

  // Same throttle shape as the school-email code (sendWindow): 60s cooldown,
  // capped sends per window.
  const windowActive = existing
    ? now - existing.firstSentAt.getTime() < CONSENT_TTL_MS
    : false;
  if (existing) {
    const sinceLast = now - existing.lastSentAt.getTime();
    if (sinceLast < RESEND_COOLDOWN_MS) {
      const cooldownSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
      return {
        ok: false,
        error: `Please wait ${cooldownSeconds}s before resending.`,
        cooldownSeconds,
      };
    }
    if (windowActive && existing.sendCount >= MAX_SENDS_PER_WINDOW) {
      return {
        ok: false,
        error:
          "Too many consent emails sent. Try again tomorrow or contact support.",
      };
    }
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const fields = {
    parentEmail,
    tokenHash,
    status: "pending" as const,
    consentedAt: null,
    consentIp: null,
    expiresAt: new Date(now + CONSENT_TTL_MS),
    sendCount: existing && windowActive ? existing.sendCount + 1 : 1,
    lastSentAt: new Date(now),
    firstSentAt: existing && windowActive ? existing.firstSentAt : new Date(now),
    updatedAt: new Date(now),
  };

  // Committed before the send so a failing provider can't be hammered.
  if (existing) {
    await db
      .update(parentalConsents)
      .set(fields)
      .where(eq(parentalConsents.userId, userId));
  } else {
    await db
      .insert(parentalConsents)
      .values({ id: crypto.randomUUID(), userId, ...fields });
  }

  const base = (getCloudflareContext().env.BETTER_AUTH_URL ?? "").replace(
    /\/$/,
    "",
  );
  const url = `${base}/consent/${token}`;
  const sent = await sendParentalConsentEmail({ to: parentEmail, memberName, url });
  if (!sent.ok) {
    return { ok: false, error: "We couldn't send the email — try again in a minute." };
  }
  return { ok: true, parentEmail };
}

export type ConsentConsumeResult = { ok: true } | { ok: false; error: string };

/**
 * Record a parent's consent from the emailed link and activate the teen's
 * membership. Idempotent — re-opening an already-approved link is a success.
 */
export async function consumeConsentToken(
  token: string,
  ip: string | null,
  requestHeaders: Headers,
): Promise<ConsentConsumeResult> {
  const db = getDb();
  const tokenHash = await hashToken((token ?? "").trim());
  const row = (
    await db
      .select()
      .from(parentalConsents)
      .where(eq(parentalConsents.tokenHash, tokenHash))
      .limit(1)
  )[0];
  if (!row) return { ok: false, error: "This consent link isn't valid." };
  if (row.status === "consented") return { ok: true }; // already approved
  if (row.status !== "pending") {
    return { ok: false, error: "This consent link is no longer valid." };
  }

  const now = new Date();
  if (row.expiresAt.getTime() < now.getTime()) {
    await db
      .update(parentalConsents)
      .set({ status: "expired", updatedAt: now })
      .where(eq(parentalConsents.id, row.id));
    return {
      ok: false,
      error: "This consent link has expired. Ask them to resend it.",
    };
  }

  await db
    .update(parentalConsents)
    .set({ status: "consented", consentedAt: now, consentIp: ip, updatedAt: now })
    .where(eq(parentalConsents.id, row.id));

  // Activate the teen's collegiate membership.
  await db
    .update(programMemberships)
    .set({ status: "VERIFIED", verifiedAt: now, updatedAt: now })
    .where(
      and(
        eq(programMemberships.userId, row.userId),
        eq(programMemberships.programId, PROGRAM_COLLEGIATE_ID),
      ),
    );

  // Best-effort Discord role push (the teen may not have linked Discord yet, and
  // this runs on the parent's request, not the teen's session — either way the
  // function swallows its own failures and verification still stands).
  await syncRoleConnection(row.userId, requestHeaders);

  return { ok: true };
}
