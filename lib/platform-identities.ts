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
// FACEIT OpenID Connect userinfo (the authorize/token hosts come from FACEIT's
// OIDC discovery doc — see the discoveryUrl in lib/auth.ts).
const FACEIT_USERINFO = "https://api.faceit.com/auth/v1/resources/userinfo";
// start.gg is GraphQL-only; identity is the `currentUser` query.
const STARTGG_GQL = "https://api.start.gg/gql/alpha";
// Challonge API v2.1 "me" (the `me` scope), on the same base version as the
// org-key client in lib/challonge.ts. Exact response shape is parsed defensively
// — confirm the fields against a live token when wiring the app.
const CHALLONGE_ME = "https://api.challonge.com/v2.1/me.json";
const PROVIDER_TIMEOUT_MS = 3000;

/**
 * The identity fields we read from an esports provider at link time. Shared by
 * lib/auth.ts (to shape the Better Auth user for the OAuth callback) and the
 * account-created hook (to mirror the handle into platform_identities), so each
 * provider is fetched through one code path. `externalId` is the provider's
 * stable user id; `handle` is the display name; the rest is best-effort.
 */
export type ProviderProfile = {
  externalId: string;
  handle: string | null;
  email?: string | null;
  emailVerified?: boolean;
};

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
 * Best-effort FACEIT profile via the OIDC userinfo endpoint. `guid` is the
 * stable player id, `nickname` the handle. Returns a real email (with the
 * `email` scope), so — unlike Battle.net — no synthetic address is needed.
 */
export async function fetchFaceitProfile(
  accessToken: string | null | undefined,
): Promise<ProviderProfile | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(FACEIT_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const me = (await res.json()) as {
      guid?: string;
      sub?: string;
      nickname?: string;
      email?: string;
      email_verified?: boolean;
    };
    const externalId = me.guid ?? me.sub;
    if (!externalId) return null;
    return {
      externalId,
      handle: me.nickname ?? null,
      email: me.email ?? null,
      emailVerified: me.email_verified ?? false,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort start.gg profile via the GraphQL `currentUser` query. The
 * gamerTag is the competitor-facing handle; `slug` is the fallback. `email`
 * needs the user.email scope.
 */
export async function fetchStartggProfile(
  accessToken: string | null | undefined,
): Promise<ProviderProfile | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(STARTGG_GQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query{currentUser{id slug email player{gamerTag}}}",
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: {
        currentUser?: {
          id?: number;
          slug?: string;
          email?: string;
          player?: { gamerTag?: string };
        };
      };
    };
    const u = body.data?.currentUser;
    if (!u?.id) return null;
    return {
      externalId: String(u.id),
      handle: u.player?.gamerTag ?? u.slug ?? null,
      email: u.email ?? null,
      emailVerified: false,
    };
  } catch {
    return null;
  }
}

/**
 * Best-effort Challonge profile via the v2 `me` endpoint. Challonge accounts
 * are thin (username + email, no avatar/region). The response shape isn't fully
 * documented, so this parses both a JSON:API `data.attributes` envelope and a
 * flat body, and gives up to id-only rather than throwing.
 */
export async function fetchChallongeProfile(
  accessToken: string | null | undefined,
): Promise<ProviderProfile | null> {
  if (!accessToken) return null;
  try {
    const res = await fetch(CHALLONGE_ME, {
      // v2.1 is JSON:API: it 415s without the vnd.api+json content type, and an
      // OAuth (member) token is the `v2` authorization type — vs the org key's
      // `v1` in lib/challonge.ts. Missing either → the link fails
      // "user_info_is_missing" because this returns null.
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Authorization-Type": "v2",
        "Content-Type": "application/vnd.api+json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { id?: string | number; attributes?: Record<string, unknown> };
      id?: string | number;
      username?: string;
      email?: string;
    };
    const attr = (body.data?.attributes ?? body) as {
      username?: string;
      name?: string;
      email?: string;
    };
    const rawId = body.data?.id ?? body.id ?? attr.username;
    if (rawId == null) return null;
    return {
      externalId: String(rawId),
      handle: attr.username ?? attr.name ?? null,
      email: attr.email ?? null,
      emailVerified: false,
    };
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
