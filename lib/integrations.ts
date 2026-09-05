import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { account, platformIdentities } from "@/db/schema";
import { getAccountLinksCached } from "@/lib/account-links";
import {
  challongeAuthEnabled,
  faceitAuthEnabled,
  getAuth,
  startggAuthEnabled,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  CONNECT_PROVIDERS,
  type ConnectProviderId,
} from "@/lib/integrations-shared";
import {
  fetchDiscordUsername,
  fetchGuildMemberRoles,
  fetchIsInGuild,
  getPlatformIdentities,
  getPlatformIdentitiesCached,
  getPlatformIdentityCached,
  hasScope,
  markIdentityRefreshed,
  pushRoleConnection,
} from "@/lib/platform-identities";
import { syncManagedStaffRoles } from "@/lib/staff";
import { isStaffRole, type StaffRole } from "@/lib/staff-shared";

// ---------------------------------------------------------------------------
// Session-aware integration reads. Imports lib/auth.ts (for token access), so
// nothing in lib/auth.ts may import this module — see the note in
// lib/platform-identities.ts.
// ---------------------------------------------------------------------------

/**
 * How long a mirrored Discord handle is trusted before we re-read it.
 *
 * Display names change, but the Discord ID never does — the handle is
 * cosmetic, so this is refreshed lazily when a member actually loads their
 * account page rather than swept by a cron. (A cron would also mean a custom
 * worker entry: OpenNext generates .open-next/worker.js, so there is nowhere
 * to hang a `scheduled` handler without a wrapper or a second Worker.) If this
 * ever needs to be real-time, the answer is the Discord bot consuming
 * USER_UPDATE gateway events, not a polling loop.
 */
const HANDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DiscordIntegration = {
  linked: boolean;
  /** Display name captured at link time and refreshed lazily. */
  handle: string | null;
  /** true in / false out / null unknown (no guild configured, scope missing,
      authorization revoked, or the call failed). */
  inGuild: boolean | null;
};

const NOT_LINKED: DiscordIntegration = {
  linked: false,
  handle: null,
  inGuild: null,
};

/**
 * Fine print for the Discord row. `null` server status stays silent rather than
 * guessing — an unknown answer shown as "not in the server" would send members
 * chasing a problem they don't have.
 */
/** The linked Discord account row, or null. */
async function getDiscordAccount(userId: string) {
  const rows = await getDb()
    .select({ accountId: account.accountId, scope: account.scope })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * A currently-valid Discord access token, refreshing and persisting it first if
 * it expired. Discord refresh tokens don't expire until the member revokes the
 * app, so this keeps working indefinitely; a revoked app throws, which we
 * translate to null.
 */
async function getDiscordAccessToken(
  userId: string,
  accountId: string,
  requestHeaders: Headers,
): Promise<string | null> {
  try {
    const result = await getAuth().api.getAccessToken({
      body: { providerId: "discord", accountId, userId },
      headers: requestHeaders,
    });
    return result?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything the dashboard shows about a member's Discord link, refreshing the
 * stored handle when it has gone stale. Never throws: a provider outage
 * degrades to the last-known handle and an unknown server status.
 */
export async function loadDiscordIntegration(
  userId: string,
  requestHeaders: Headers,
): Promise<DiscordIntegration> {
  const [discordAccount, identity] = await Promise.all([
    getAccountLinksCached(userId).then(
      (rows) => rows.find((row) => row.providerId === "discord") ?? null,
    ),
    getPlatformIdentityCached(userId, "discord"),
  ]);
  if (!discordAccount) return NOT_LINKED;

  const { env } = getCloudflareContext();
  const guildId = env.DISCORD_GUILD_ID || null;

  const stale =
    !identity?.refreshedAt ||
    Date.now() - identity.refreshedAt.getTime() > HANDLE_TTL_MS;
  // guilds.members.read is only present on accounts linked after that scope
  // shipped; older links skip the lookup instead of taking a 403.
  const canCheckGuild =
    Boolean(guildId) && hasScope(discordAccount.scope, "guilds.members.read");

  // Only pay for a token when something actually needs one.
  if (!stale && !canCheckGuild) {
    return { linked: true, handle: identity?.handle ?? null, inGuild: null };
  }

  const accessToken = await getDiscordAccessToken(
    userId,
    discordAccount.accountId,
    requestHeaders,
  );

  let handle = identity?.handle ?? null;
  if (stale && identity) {
    const fresh = accessToken ? await fetchDiscordUsername(accessToken) : null;
    // Bookkeep even on failure, so a revoked authorization defers the next
    // attempt by a full TTL instead of retrying on every render.
    await markIdentityRefreshed(identity.id, fresh);
    handle = fresh ?? handle;
  }

  const inGuild = canCheckGuild ? await fetchIsInGuild(accessToken, guildId) : null;

  return { linked: true, handle, inGuild };
}

/**
 * Push the member's verification state onto their Discord connection (Linked
 * Roles), so the server can gate roles on it. No-op when Discord isn't linked,
 * the scope is absent, or Discord OAuth isn't configured. Fire-and-forget:
 * being verified on the site never depends on Discord accepting the write.
 */
export async function syncRoleConnection(
  userId: string,
  requestHeaders: Headers,
): Promise<void> {
  try {
    const { env } = getCloudflareContext();
    if (!env.DISCORD_CLIENT_ID) return;

    const discordAccount = await getDiscordAccount(userId);
    if (!discordAccount) return;
    if (!hasScope(discordAccount.scope, "role_connections.write")) return;

    const accessToken = await getDiscordAccessToken(
      userId,
      discordAccount.accountId,
      requestHeaders,
    );
    if (!accessToken) return;

    // The Discord Application ID and the OAuth client ID are the same value.
    await pushRoleConnection(accessToken, env.DISCORD_CLIENT_ID, userId);
  } catch (error) {
    console.error("role connection sync failed:", error);
  }
}

// ---------------------------------------------------------------------------
// Staff role linking — read the member's guild roles and reconcile the ones
// this app maps to staff tiers into staff_roles. The DB stays authoritative
// (every gate re-reads it); Discord just drives the granted_via = "discord"
// rows. Manual grants are never affected.
// ---------------------------------------------------------------------------

/**
 * DISCORD_STAFF_ROLE_MAP is a JSON object of Discord role snowflake -> staff
 * tier, e.g. {"1234...":"admin","5678...":"moderator"}. Unknown tiers and a
 * malformed value are dropped rather than thrown — bad config disables the
 * sync, it never breaks a page load.
 */
function parseStaffRoleMap(raw: string | undefined): Map<string, StaffRole> {
  const map = new Map<string, StaffRole>();
  if (!raw) return map;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [roleId, tier] of Object.entries(parsed)) {
      if (roleId && isStaffRole(tier)) map.set(roleId, tier);
    }
  } catch {
    // Leave the map empty; syncStaffRolesFromDiscord no-ops on an empty map.
  }
  return map;
}

/**
 * Reconcile the member's Discord-linked staff roles. Best-effort and never
 * throws: called from the admin area on load, it degrades to whatever
 * staff_roles already holds (so manual grants keep working) on any failure.
 *
 * Crucially, an *unknown* role lookup (revoked auth, 404, network) is left
 * alone — only a definitive role list from Discord, including an empty one,
 * revokes a previously-synced grant.
 */
export async function syncStaffRolesFromDiscord(
  userId: string,
  requestHeaders: Headers,
): Promise<void> {
  try {
    const { env } = getCloudflareContext();
    const guildId = env.DISCORD_GUILD_ID || null;
    const roleMap = parseStaffRoleMap(env.DISCORD_STAFF_ROLE_MAP);
    if (!guildId || roleMap.size === 0) return;

    const discordAccount = await getDiscordAccount(userId);
    if (!discordAccount) return;
    if (!hasScope(discordAccount.scope, "guilds.members.read")) return;

    const accessToken = await getDiscordAccessToken(
      userId,
      discordAccount.accountId,
      requestHeaders,
    );
    if (!accessToken) return;

    const memberRoleIds = await fetchGuildMemberRoles(accessToken, guildId);
    if (memberRoleIds === null) return; // unknown — do not revoke on a guess

    const desired = new Set<StaffRole>();
    for (const roleId of memberRoleIds) {
      const tier = roleMap.get(roleId);
      if (tier) desired.add(tier);
    }
    await syncManagedStaffRoles(userId, [...desired]);
  } catch (error) {
    console.error("staff role sync failed:", error);
  }
}

// ---------------------------------------------------------------------------
// Esports connects — the FACEIT / start.gg / Challonge cards under Integrations.
// Unlike Discord these need no per-render provider call: the link is a Better
// Auth account row and the handle is mirrored at link time, so this is pure D1.
// ---------------------------------------------------------------------------

export type ConnectIntegration = {
  id: ConnectProviderId;
  label: string;
  linkLabel: string;
  /** A Better Auth account row exists for this provider. */
  linked: boolean;
  /** Display handle captured at link time, or null. */
  handle: string | null;
  /** This provider's OAuth secrets are configured. */
  enabled: boolean;
  /**
   * Whether the member's account is queryable through the provider's public
   * API — the thing our schedule sync actually needs. `true` = we read it back
   * fine; `false` = a definitive "nothing there" (usually a private profile),
   * which the card turns into a "set your account to public" hint; `null` =
   * unknown (Challonge, no server key, or the check couldn't run) → no hint,
   * so we never cry wolf.
   */
  reachable: boolean | null;
};

const CONNECT_ENABLED: Record<ConnectProviderId, () => boolean> = {
  faceit: faceitAuthEnabled,
  startgg: startggAuthEnabled,
  challonge: challongeAuthEnabled,
};

// ---------------------------------------------------------------------------
// Public-account reachability. FACEIT and start.gg are read server-side by the
// member's external id (the same path the schedule sync uses), which only works
// if the profile is public — so linking then failing a read is the signal that
// their account is private. Lazy-on-read past a TTL, cached in the identity's
// metadata blob, and strictly best-effort: only a definitive negative from a
// *successful* API call flags "private"; anything else is `null` (no warning).
// ---------------------------------------------------------------------------

const CONNECT_HEALTH_TTL_MS = 30 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 4000;
const FACEIT_DATA = "https://open.faceit.com/data/v4";
const STARTGG_GQL = "https://api.start.gg/gql/alpha";

type ConnectHealth = { checkedAt: number | null; reachable: boolean | null };

function readConnectHealth(metadata: string | null): ConnectHealth {
  if (!metadata) return { checkedAt: null, reachable: null };
  try {
    const parsed = JSON.parse(metadata) as {
      connectCheckedAt?: unknown;
      connectReachable?: unknown;
    };
    return {
      checkedAt:
        typeof parsed.connectCheckedAt === "number"
          ? parsed.connectCheckedAt
          : null,
      reachable:
        typeof parsed.connectReachable === "boolean"
          ? parsed.connectReachable
          : null,
    };
  } catch {
    return { checkedAt: null, reachable: null };
  }
}

/** Stamp the reachability result onto the identity's metadata, preserving any
    other keys (e.g. the schedule sync's scheduleSyncedAt). */
async function writeConnectHealth(
  identityId: string,
  metadata: string | null,
  reachable: boolean,
): Promise<void> {
  let merged: Record<string, unknown> = {};
  if (metadata) {
    try {
      merged = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      merged = {};
    }
  }
  merged.connectCheckedAt = Date.now();
  merged.connectReachable = reachable;
  await getDb()
    .update(platformIdentities)
    .set({ metadata: JSON.stringify(merged), updatedAt: new Date() })
    .where(eq(platformIdentities.id, identityId));
}

/** Is a FACEIT player public? 404 = no (private/removed); other errors unknown. */
async function faceitPlayerPublic(
  apiKey: string,
  playerId: string,
): Promise<boolean | null> {
  try {
    const res = await fetch(
      `${FACEIT_DATA}/players/${encodeURIComponent(playerId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      },
    );
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const body = (await res.json()) as { player_id?: string };
    return body?.player_id ? true : false;
  } catch {
    return null;
  }
}

/** Is a start.gg user resolvable by id? A successful query with a null user
    means the profile isn't publicly readable. */
async function startggUserPublic(
  apiKey: string,
  userId: string,
): Promise<boolean | null> {
  try {
    const res = await fetch(STARTGG_GQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "query($id:ID!){user(id:$id){id}}",
        variables: { id: userId },
      }),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { user?: { id?: number } | null };
    };
    return body?.data?.user?.id != null;
  } catch {
    return null;
  }
}

/** Reachability for one connected identity, TTL-cached in its metadata. Pass
    `force` to skip the TTL and always re-test (the manual re-check button). */
async function connectReachability(
  identity: { id: string; externalId: string | null; metadata: string | null },
  provider: ConnectProviderId,
  env: CloudflareEnv,
  force = false,
): Promise<boolean | null> {
  try {
    const cached = readConnectHealth(identity.metadata);
    if (
      !force &&
      cached.checkedAt != null &&
      Date.now() - cached.checkedAt < CONNECT_HEALTH_TTL_MS
    ) {
      return cached.reachable;
    }
    if (!identity.externalId) return null;

    let reachable: boolean | null = null;
    if (provider === "faceit") {
      if (!env.FACEIT_API_KEY) return null;
      reachable = await faceitPlayerPublic(env.FACEIT_API_KEY, identity.externalId);
    } else if (provider === "startgg") {
      if (!env.STARTGG_API_KEY) return null;
      reachable = await startggUserPublic(env.STARTGG_API_KEY, identity.externalId);
    } else {
      // Challonge is read via the member's own OAuth token — no public concern.
      return null;
    }

    // Only cache a definitive answer; leave "unknown" un-stamped so a transient
    // failure is retried next render rather than parked for a full TTL.
    if (reachable !== null) {
      await writeConnectHealth(identity.id, identity.metadata, reachable);
    }
    return reachable;
  } catch {
    return null;
  }
}

/**
 * State for every esports-connect card in one shot — one identities read plus
 * one account read, shared by the account page and the setup step. Never throws
 * on a per-provider basis: a provider with no secrets simply comes back
 * disabled. For linked FACEIT/start.gg accounts it also tests public API
 * reachability (best-effort, TTL-cached) so the card can flag a private account.
 */
export const loadConnectIntegrations = cache(async function loadConnectIntegrations(
  userId: string,
): Promise<ConnectIntegration[]> {
  const { env } = getCloudflareContext();
  const [identities, linkedRows] = await Promise.all([
    getPlatformIdentitiesCached(userId),
    getAccountLinksCached(userId),
  ]);
  const linked = new Set(linkedRows.map((r) => r.providerId));
  const identityByProvider = new Map(identities.map((i) => [i.provider, i]));

  return Promise.all(
    CONNECT_PROVIDERS.map(async (p) => {
      const enabled = CONNECT_ENABLED[p.id]();
      const identity = identityByProvider.get(p.id) ?? null;
      const isLinked = linked.has(p.id);
      const reachable =
        isLinked && enabled && identity
          ? await connectReachability(identity, p.id, env)
          : null;
      return {
        ...p,
        linked: isLinked,
        handle: identity?.handle ?? null,
        enabled,
        reachable,
      };
    }),
  );
});

/**
 * Force a fresh reachability test for every linked FACEIT/start.gg account,
 * bypassing the TTL — what the "re-check" control on the Integrations bubble
 * calls. Best-effort per provider; writes results back to metadata so the next
 * render reads them. Reads identities fresh (not the request cache) since it runs
 * from an action, not a render.
 */
export async function recheckConnectHealth(userId: string): Promise<void> {
  const { env } = getCloudflareContext();
  const [identities, linkedRows] = await Promise.all([
    getPlatformIdentities(userId),
    getAccountLinksCached(userId),
  ]);
  const linked = new Set(linkedRows.map((r) => r.providerId));
  await Promise.all(
    CONNECT_PROVIDERS.map(async (p) => {
      if (!linked.has(p.id) || !CONNECT_ENABLED[p.id]()) return;
      const identity = identities.find((i) => i.provider === p.id);
      if (!identity) return;
      await connectReachability(identity, p.id, env, true);
    }),
  );
}
