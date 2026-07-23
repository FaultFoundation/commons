import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { platformIdentities } from "@/db/schema";
import { getRegistrationState } from "@/lib/registration";
import { MEMBER_TYPE_IDS, type UserType } from "@/lib/registration-shared";

// ---------------------------------------------------------------------------
// Connected-platform primitives: one provider fetch or one D1 write each.
//
// Deliberately free of any `@/lib/auth` import — lib/auth.ts calls into this
// module from its account-created hook, so a dependency the other way would
// close a cycle. Session-aware orchestration (token refresh, staleness gates)
// lives in lib/integrations.ts, which may import both.
//
// Every provider call here is best-effort: 3s timeout, never throws, returns
// null on any failure. A miss degrades the UI to "Connected" — it must never
// fail an OAuth callback or blank a dashboard.
// ---------------------------------------------------------------------------

const DISCORD_API = "https://discord.com/api/v10";
const BATTLENET_USERINFO = "https://oauth.battle.net/userinfo";
const PROVIDER_TIMEOUT_MS = 3000;

/** Platform name shown on the member's Discord connection card. */
const PLATFORM_NAME = "The Fault Foundation";

/** A single connected platform identity (discord / battlenet / …), or null. */
export async function getPlatformIdentity(userId: string, provider: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(platformIdentities)
    .where(
      and(
        eq(platformIdentities.userId, userId),
        eq(platformIdentities.provider, provider),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Whether a stored `account.scope` (better-auth persists it comma-separated)
 * covers the given OAuth scope. Accounts linked before a scope was added carry
 * the narrower set, so callers gate on this and skip rather than 403.
 */
export function hasScope(scope: string | null | undefined, wanted: string): boolean {
  if (!scope) return false;
  return scope.split(",").some((s) => s.trim() === wanted);
}

// ---------------------------------------------------------------------------
// Provider reads
// ---------------------------------------------------------------------------

/**
 * Best-effort Discord display name for a linked account. Called from the
 * account-created hook while the OAuth access token is fresh. Prefers the
 * display name (global_name) over the unique handle, matching what better-auth
 * itself resolves as the user's name.
 */
export async function fetchDiscordUsername(
  accessToken: string | null | undefined,
): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
 * Best-effort BattleTag for a linked Battle.net account. Blizzard issues no
 * refresh token and access tokens live ~24h, so this is a one-shot capture at
 * link time — there is no way to re-read it later without a fresh consent.
 */
export async function fetchBattleTag(
  accessToken: string | null | undefined,
): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(BATTLENET_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const me = (await res.json()) as { battletag?: string };
    return me.battletag || null;
  } catch {
    return null;
  }
}

/**
 * Whether the member is in our Discord server. Needs the guilds.members.read
 * scope, which is narrowly scoped to this one guild — it reveals nothing about
 * the member's other servers.
 *
 * Returns true (in), false (a definitive 404 — not in), or null (unknown:
 * missing scope, revoked authorization, network trouble). The roles and
 * nickname the endpoint also returns are deliberately not read or stored;
 * they change constantly and we only need the join signal.
 */
export async function fetchIsInGuild(
  accessToken: string | null | undefined,
  guildId: string | null | undefined,
): Promise<boolean | null> {
  if (!accessToken || !guildId) return null;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (res.ok) return true;
    // 404 is the useful answer, not an error: authorized, simply not a member.
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * The member's Discord role IDs in our guild, via the same endpoint as
 * fetchIsInGuild (which discards them). Needs the guilds.members.read scope.
 *
 * Returns the role-ID array (possibly empty — a member with no roles), or null
 * when the answer is unknown: missing scope, not a member (404), revoked
 * authorization, or network trouble. Null and [] are deliberately different —
 * the staff-role sync must not revoke access on an unknown answer, only on a
 * confirmed empty/changed set. This is the only place roles are read; they are
 * used transiently to reconcile staff_roles and never stored.
 */
export async function fetchGuildMemberRoles(
  accessToken: string | null | undefined,
  guildId: string | null | undefined,
): Promise<string[] | null> {
  if (!accessToken || !guildId) return null;
  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const member = (await res.json()) as { roles?: unknown };
    if (!Array.isArray(member.roles)) return null;
    return member.roles.filter((role): role is string => typeof role === "string");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Linked Roles (Discord) — write-only push of verification state.
//
// Nothing is read back; this tells Discord what kind of member this is so the
// server can gate roles on it without staff having to cross-check the site.
// Keys must match what scripts/register-role-metadata.mjs registered on the
// application:
//   verified_member  boolean  — any verified member, whatever the type
//   member_type      integer  — MEMBER_TYPE_IDS, or 0 when not verified
//   graduation_date  datetime — only sent once verified
// ---------------------------------------------------------------------------

/** "YYYY-MM" (what the native month picker stores) -> ISO8601 for Discord. */
function graduationToIso(graduationDate: string | null): string | null {
  if (!graduationDate) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(graduationDate.trim());
  if (!match) return null;
  const [, year, month] = match;
  return `${year}-${month}-01T00:00:00.000Z`;
}

/**
 * Push the member's verification state onto their Discord connection.
 * Best-effort and never throws: the member is verified on the site whether or
 * not Discord accepts the write.
 */
export async function pushRoleConnection(
  accessToken: string | null | undefined,
  applicationId: string | null | undefined,
  userId: string,
): Promise<void> {
  if (!accessToken || !applicationId) return;
  try {
    const reg = await getRegistrationState(userId);
    const verified = reg?.status === "VERIFIED";

    // Everything below is gated on `verified`, deliberately. member_type falls
    // back to 0 (matching no role) rather than being omitted, so a member who
    // *claims* to be a university student but hasn't verified can never satisfy
    // a "Member Type = 1" requirement. A role keyed on member_type therefore
    // implies verification on its own; admins don't have to remember to AND it
    // with Verified Member.
    const memberType =
      verified && reg?.userType
        ? (MEMBER_TYPE_IDS[reg.userType as UserType] ?? 0)
        : 0;

    const metadata: Record<string, string> = {
      verified_member: verified ? "1" : "0",
      member_type: String(memberType),
    };
    const graduation = verified
      ? graduationToIso(reg?.graduationDate ?? null)
      : null;
    if (graduation) metadata.graduation_date = graduation;

    const res = await fetch(
      `${DISCORD_API}/users/@me/applications/${applicationId}/role-connection`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform_name: PLATFORM_NAME,
          // Shown on the member's Discord connection card. The school is the
          // meaningful thing we verified; fall back to nothing rather than
          // leaking an email or an internal id.
          platform_username: reg?.schoolName ?? undefined,
          metadata,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.error(`role connection push failed: ${res.status}`);
    }
  } catch (error) {
    console.error("role connection push failed:", error);
  }
}

// ---------------------------------------------------------------------------
// Mirror
// ---------------------------------------------------------------------------

/**
 * Mirrors a linked OAuth account into platform_identities. Runs from the
 * better-auth account-created hook, covering explicit linking and (for Discord)
 * sign-in/up. Must never throw: a mirror failure must not fail the OAuth flow.
 * An external id already claimed by another user is left alone — the unique
 * (provider, external_id) index would reject it anyway.
 */
export async function mirrorPlatformIdentity(
  userId: string,
  provider: string,
  externalId: string,
  handle?: string | null,
): Promise<void> {
  try {
    const db = getDb();
    const now = new Date();

    const taken = (
      await db
        .select({ userId: platformIdentities.userId })
        .from(platformIdentities)
        .where(
          and(
            eq(platformIdentities.provider, provider),
            eq(platformIdentities.externalId, externalId),
          ),
        )
        .limit(1)
    )[0];
    if (taken && taken.userId !== userId) {
      console.error(`${provider} ${externalId} already linked to another user`);
      return;
    }

    const existing = await getPlatformIdentity(userId, provider);
    if (existing) {
      await db
        .update(platformIdentities)
        .set({
          externalId,
          handle: handle ?? existing.handle,
          verified: true,
          refreshedAt: now,
          updatedAt: now,
        })
        .where(eq(platformIdentities.id, existing.id));
      return;
    }

    await db.insert(platformIdentities).values({
      id: crypto.randomUUID(),
      userId,
      provider,
      externalId,
      handle: handle ?? null,
      verified: true,
      connectedAt: now,
      refreshedAt: now,
    });
  } catch (error) {
    console.error(`${provider} identity mirror failed:`, error);
  }
}

/**
 * Record that a refresh attempt happened, optionally updating the handle.
 * Bumped even when the provider read failed, so a member who revoked the app
 * in Discord doesn't trigger a doomed round-trip on every single render.
 */
export async function markIdentityRefreshed(
  identityId: string,
  handle?: string | null,
): Promise<void> {
  try {
    const now = new Date();
    await getDb()
      .update(platformIdentities)
      .set(handle ? { handle, refreshedAt: now, updatedAt: now } : { refreshedAt: now })
      .where(eq(platformIdentities.id, identityId));
  } catch (error) {
    console.error("identity refresh bookkeeping failed:", error);
  }
}
