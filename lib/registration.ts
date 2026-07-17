import { and, eq, isNull, ne } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { profiles } from "@/db/schema";

// ---------------------------------------------------------------------------
// Registration constants (mirroring the legacy sheet/Apps Script flow).
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 5;
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 5; // per CODE_TTL_MS window

export {
  AGE_RANGES,
  USER_TYPES,
  type RegistrationStatus,
  type UserType,
} from "@/lib/registration-shared";

// ---------------------------------------------------------------------------
// Verification codes. Plaintext is never stored: only sha256(userId:CODE),
// so a D1 leak doesn't expose usable codes. ~40 bits of entropy is fine for
// a 24h-TTL code capped at 5 online guesses.
// ---------------------------------------------------------------------------

// No 0/O/1/I/L to keep hand-typed codes unambiguous.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

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

/** XXXX-XXXX presentation used in emails and the entry field hint. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

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
// profiles helpers
// ---------------------------------------------------------------------------

export async function getProfileByUserId(userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Best-effort Discord display name for the just-linked account. Called
 * from the account-created hook while the OAuth access token is fresh.
 * Never throws — a miss just means the Accounts tab shows "Connected".
 */
export async function fetchDiscordUsername(
  accessToken: string | null | undefined,
): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const me = (await res.json()) as {
      username?: string;
      global_name?: string | null;
    };
    return me.global_name || me.username || null;
  } catch {
    return null;
  }
}

/**
 * Mirrors a linked Discord account into profiles.discordId (and the
 * display name, when the fetch got one — null never clobbers a stored
 * name). Runs from the better-auth account-created hook, covering
 * explicit linking and Discord sign-in/up. Must never throw: a mirror
 * failure must not fail the OAuth flow — conflicts get recorded in
 * staff notes instead.
 */
export async function mirrorDiscordIdToProfile(
  userId: string,
  discordId: string,
  discordUsername?: string | null,
): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();
    const nameUpdate = discordUsername ? { discordUsername } : {};

    // A legacy import row carrying this Discord ID (userId still null)
    // gets adopted by the signing-in user.
    const legacy = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.discordId, discordId), isNull(profiles.userId)))
      .limit(1);

    const own = await getProfileByUserId(userId);

    if (legacy[0]) {
      if (own) {
        // Rare: the user already has a row (started registration on the
        // site before linking). Keep the site row as source of truth and
        // flag the legacy row for staff to merge by hand.
        await db
          .update(profiles)
          .set({
            notes: `Legacy row for Discord ${discordId} superseded by site profile ${own.id} (${now.toISOString()})`,
            updatedAt: now,
          })
          .where(eq(profiles.id, legacy[0].id));
        await db
          .update(profiles)
          .set({ discordId, ...nameUpdate, updatedAt: now })
          .where(eq(profiles.id, own.id));
      } else {
        await db
          .update(profiles)
          .set({ userId, ...nameUpdate, updatedAt: now })
          .where(eq(profiles.id, legacy[0].id));
      }
      return;
    }

    if (own) {
      if (own.discordId === discordId) {
        if (discordUsername && own.discordUsername !== discordUsername) {
          await db
            .update(profiles)
            .set({ discordUsername, updatedAt: now })
            .where(eq(profiles.id, own.id));
        }
        return;
      }
      // Unique-violation guard: some other profile already owns this ID.
      const taken = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.discordId, discordId), ne(profiles.id, own.id)))
        .limit(1);
      if (taken[0]) {
        await db
          .update(profiles)
          .set({
            notes: `${own.notes ? `${own.notes}\n` : ""}Discord ${discordId} already claimed by profile ${taken[0].id} (${now.toISOString()})`,
            updatedAt: now,
          })
          .where(eq(profiles.id, own.id));
        return;
      }
      await db
        .update(profiles)
        .set({ discordId, ...nameUpdate, updatedAt: now })
        .where(eq(profiles.id, own.id));
      return;
    }

    await db.insert(profiles).values({
      id: crypto.randomUUID(),
      userId,
      discordId,
      discordUsername: discordUsername ?? null,
    });
  } catch (error) {
    console.error("discordId mirror failed:", error);
  }
}
