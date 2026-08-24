import { and, asc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { account, externalMatches, platformIdentities } from "@/db/schema";
import {
  challongeAuthEnabled,
  faceitAuthEnabled,
  getAuth,
  startggAuthEnabled,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPlatformIdentity, hasScope } from "@/lib/platform-identities";
import {
  SCHEDULE_PROVIDERS,
  isUpcomingStatus,
  type ScheduleEntry,
  type ScheduleProvider,
  type ScheduleStatus,
} from "@/lib/schedule-shared";

// ---------------------------------------------------------------------------
// Personal schedule sync — the server-only half. Pulls each connected member's
// upcoming matches/tournaments from the provider APIs and materializes them
// into external_matches, which the /schedule calendar reads.
//
// Design mirrors lib/integrations.ts: Workers has no cron, so the sync runs
// **lazily on read** past a per-provider TTL, and every provider call is
// best-effort — a 4s timeout, never throws, returns [] on any failure. A miss
// degrades the calendar to whatever is already cached; it never blanks the page
// or fails a render. Imports lib/auth.ts for token access, so lib/auth.ts must
// not import this module (same cycle rule as lib/integrations.ts).
//
// Live-verified: Challonge only (the org has credentials). FACEIT and start.gg
// are written against the providers' documented shapes and are code-complete
// but not yet exercised end-to-end — the parsing is defensive and the mappings
// are commented so they can be confirmed against a live token.
// ---------------------------------------------------------------------------

const SYNC_TTL_MS = 15 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 4000;

const CHALLONGE_V21 = "https://api.challonge.com/v2.1";
const STARTGG_GQL = "https://api.start.gg/gql/alpha";
const FACEIT_DATA = "https://open.faceit.com/data/v4";
// FACEIT history is per-game; cap how many of a player's games we walk so a
// prolific account can't fan out into a dozen calls on one render.
const FACEIT_MAX_GAMES = 3;
const FACEIT_HISTORY_LIMIT = 5;

/** The provider-agnostic row an adapter emits; upserted into external_matches. */
type SyncedMatch = {
  /** Provider-stable id, unique within (userId, provider). */
  externalId: string;
  title: string | null;
  opponentName: string | null;
  round: string | null;
  status: ScheduleStatus;
  scheduledAt: Date | null;
  url: string | null;
};

const enabledFor: Record<ScheduleProvider, () => boolean> = {
  faceit: faceitAuthEnabled,
  startgg: startggAuthEnabled,
  challonge: challongeAuthEnabled,
};

// ---------------------------------------------------------------------------
// Token + TTL plumbing
// ---------------------------------------------------------------------------

/** The linked account row (id + granted scope) for a connect provider, or null. */
async function connectAccount(userId: string, providerId: ScheduleProvider) {
  const rows = await getDb()
    .select({ accountId: account.accountId, scope: account.scope })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * A currently-valid access token for a connect provider, refreshing via Better
 * Auth if it expired. Returns null on a revoked app or any failure (caught).
 */
async function accessTokenFor(
  userId: string,
  providerId: ScheduleProvider,
  accountId: string,
  requestHeaders: Headers,
): Promise<string | null> {
  try {
    const result = await getAuth().api.getAccessToken({
      body: { providerId, accountId, userId },
      headers: requestHeaders,
    });
    return result?.accessToken ?? null;
  } catch {
    return null;
  }
}

/** Read the last schedule-sync time out of a platform_identities.metadata blob. */
function readSyncedAt(metadata: string | null): number {
  if (!metadata) return 0;
  try {
    const parsed = JSON.parse(metadata) as { scheduleSyncedAt?: unknown };
    return typeof parsed.scheduleSyncedAt === "number"
      ? parsed.scheduleSyncedAt
      : 0;
  } catch {
    return 0;
  }
}

/**
 * Stamp scheduleSyncedAt onto the identity's metadata blob, preserving any
 * other keys. Bumped even after an empty/failed pull, so a provider that is
 * quiet or unreachable defers the next attempt by a full TTL instead of
 * retrying on every render.
 */
async function markSynced(identityId: string, metadata: string | null) {
  let merged: Record<string, unknown> = {};
  if (metadata) {
    try {
      merged = JSON.parse(metadata) as Record<string, unknown>;
    } catch {
      merged = {};
    }
  }
  merged.scheduleSyncedAt = Date.now();
  await getDb()
    .update(platformIdentities)
    .set({ metadata: JSON.stringify(merged), updatedAt: new Date() })
    .where(eq(platformIdentities.id, identityId));
}

// ---------------------------------------------------------------------------
// Provider adapters — each best-effort, each returns [] on any trouble.
// ---------------------------------------------------------------------------

/**
 * The member's own Challonge tournaments, via the v2.1 API on their OAuth token
 * (`Authorization-Type: v2` is the act-on-behalf-of-a-user path, distinct from
 * the org key's `v1`). Tournament-level: one entry per event the member owns,
 * timed at its start. Match-level Challonge detail can layer on later using the
 * matches:read scope.
 */
async function loadChallongeSchedule(token: string): Promise<SyncedMatch[]> {
  try {
    const res = await fetch(`${CHALLONGE_V21}/tournaments.json`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Authorization-Type": "v2",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: Array<{
        id?: string | number;
        attributes?: {
          name?: string;
          state?: string;
          "start-at"?: string | null;
          start_at?: string | null;
          "full-challonge-url"?: string | null;
          full_challonge_url?: string | null;
          url?: string | null;
        };
      }>;
    };
    const list = Array.isArray(body.data) ? body.data : [];
    return list.flatMap((t) => {
      if (t.id == null) return [];
      const a = t.attributes ?? {};
      const startRaw = a["start-at"] ?? a.start_at ?? null;
      const url =
        a["full-challonge-url"] ??
        a.full_challonge_url ??
        (a.url ? `https://challonge.com/${a.url}` : null);
      return [
        {
          externalId: `tournament-${t.id}`,
          title: a.name ?? "Challonge tournament",
          opponentName: null,
          round: null,
          status: challongeState(a.state),
          scheduledAt: startRaw ? new Date(startRaw) : null,
          url,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** Challonge tournament state -> our normalized status. */
function challongeState(state: string | undefined): ScheduleStatus {
  switch (state) {
    case "underway":
    case "in_progress":
      return "live";
    case "complete":
    case "ended":
      return "finished";
    default:
      return "scheduled";
  }
}

/**
 * The member's upcoming start.gg tournaments, via the GraphQL `currentUser`
 * query. Tournament-level for the MVP (start.gg's set-level schedule is a later
 * layer). `startAt` is unix seconds.
 */
async function loadStartggSchedule(token: string): Promise<SyncedMatch[]> {
  try {
    const res = await fetch(STARTGG_GQL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "query{currentUser{tournaments(query:{perPage:20,filter:{upcoming:true}}){nodes{id name slug startAt}}}}",
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      data?: {
        currentUser?: {
          tournaments?: {
            nodes?: Array<{
              id?: number | string;
              name?: string;
              slug?: string;
              startAt?: number | null;
            }>;
          };
        };
      };
    };
    const nodes = body.data?.currentUser?.tournaments?.nodes ?? [];
    return nodes.flatMap((t) => {
      if (t.id == null) return [];
      return [
        {
          externalId: `tournament-${t.id}`,
          title: t.name ?? "start.gg tournament",
          opponentName: null,
          round: null,
          status: "scheduled" as ScheduleStatus,
          scheduledAt:
            typeof t.startAt === "number" ? new Date(t.startAt * 1000) : null,
          url: t.slug ? `https://start.gg/${t.slug}` : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * The member's recent FACEIT matches (Results), via the server-side Data API
 * key keyed by their player guid. FACEIT's public API exposes match *history*
 * (played matches), not a forward matchmaking queue, so this feeds the Results
 * list rather than Upcoming. Walks the player's games (capped) and takes the
 * last few matches of each.
 */
async function loadFaceitSchedule(
  apiKey: string,
  playerId: string,
): Promise<SyncedMatch[]> {
  try {
    const playerRes = await fetch(`${FACEIT_DATA}/players/${playerId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!playerRes.ok) return [];
    const player = (await playerRes.json()) as {
      games?: Record<string, unknown>;
    };
    const games = Object.keys(player.games ?? {}).slice(0, FACEIT_MAX_GAMES);
    if (games.length === 0) return [];

    const perGame = await Promise.all(
      games.map((game) => faceitHistory(apiKey, playerId, game)),
    );
    return perGame.flat();
  } catch {
    return [];
  }
}

/** One page of a FACEIT player's match history for a single game. */
async function faceitHistory(
  apiKey: string,
  playerId: string,
  game: string,
): Promise<SyncedMatch[]> {
  try {
    const res = await fetch(
      `${FACEIT_DATA}/players/${playerId}/history?game=${encodeURIComponent(
        game,
      )}&offset=0&limit=${FACEIT_HISTORY_LIMIT}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      items?: Array<{
        match_id?: string;
        started_at?: number;
        finished_at?: number;
        status?: string;
        competition_name?: string;
        faceit_url?: string;
        teams?: Record<string, { nickname?: string; roster?: Array<{ player_id?: string }> }>;
      }>;
    };
    const items = body.items ?? [];
    return items.flatMap((m) => {
      if (!m.match_id) return [];
      return [
        {
          externalId: m.match_id,
          title: m.competition_name ?? `FACEIT ${game}`,
          opponentName: faceitOpponent(m.teams, playerId),
          round: null,
          status: faceitState(m.status),
          scheduledAt: m.started_at ? new Date(m.started_at * 1000) : null,
          url: m.faceit_url ? m.faceit_url.replace("{lang}", "en") : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

/** The name of the faction the player is NOT on, best-effort. */
function faceitOpponent(
  teams: Record<string, { nickname?: string; roster?: Array<{ player_id?: string }> }> | undefined,
  playerId: string,
): string | null {
  if (!teams) return null;
  const factions = Object.values(teams);
  const opponent = factions.find(
    (f) => !(f.roster ?? []).some((p) => p.player_id === playerId),
  );
  return opponent?.nickname ?? null;
}

/** FACEIT match status -> our normalized status. */
function faceitState(status: string | undefined): ScheduleStatus {
  switch ((status ?? "").toUpperCase()) {
    case "ONGOING":
    case "READY":
      return "live";
    case "CANCELLED":
      return "cancelled";
    default:
      // History items are finished matches; anything unknown lands as finished.
      return "finished";
  }
}

// ---------------------------------------------------------------------------
// Sync + read
// ---------------------------------------------------------------------------

/** Upsert one provider's synced matches, idempotent on (user, provider, id). */
async function upsertMatches(
  userId: string,
  provider: ScheduleProvider,
  matches: SyncedMatch[],
) {
  if (matches.length === 0) return;
  const now = new Date();
  const stmts = matches.map((m) =>
    getDb()
      .insert(externalMatches)
      .values({
        id: crypto.randomUUID(),
        userId,
        tournamentId: null,
        provider,
        externalId: m.externalId,
        title: m.title,
        opponentName: m.opponentName,
        round: m.round,
        status: m.status,
        scheduledAt: m.scheduledAt,
        url: m.url,
      })
      .onConflictDoUpdate({
        target: [
          externalMatches.userId,
          externalMatches.provider,
          externalMatches.externalId,
        ],
        set: {
          title: m.title,
          opponentName: m.opponentName,
          round: m.round,
          status: m.status,
          scheduledAt: m.scheduledAt,
          url: m.url,
          updatedAt: now,
        },
      }),
  );
  // D1 has no interactive transactions; batch keeps the writes to one round trip
  // (see CLAUDE.md — use db.batch, never transaction()).
  const [first, ...rest] = stmts;
  await getDb().batch([first, ...rest]);
}

/**
 * Refresh one member's schedule from every connected provider whose cache has
 * aged past the TTL. Best-effort per provider — one provider failing or being
 * unconfigured never affects the others. Returns silently; the caller reads
 * external_matches afterwards.
 */
export async function syncSchedule(
  userId: string,
  requestHeaders: Headers,
): Promise<void> {
  const { env } = getCloudflareContext();

  await Promise.all(
    SCHEDULE_PROVIDERS.map(async (provider) => {
      try {
        if (!enabledFor[provider]()) return;

        const identity = await getPlatformIdentity(userId, provider);
        if (!identity) return; // not connected
        if (Date.now() - readSyncedAt(identity.metadata) < SYNC_TTL_MS) return;

        let matches: SyncedMatch[] = [];

        if (provider === "faceit") {
          // FACEIT reads through the server Data API key, keyed by the player
          // guid captured at link time — no per-member token needed.
          if (env.FACEIT_API_KEY && identity.externalId) {
            matches = await loadFaceitSchedule(
              env.FACEIT_API_KEY,
              identity.externalId,
            );
          }
        } else {
          const linked = await connectAccount(userId, provider);
          if (!linked) return;
          // Challonge's schedule needs the tournaments:read scope; accounts
          // linked before it shipped carry only `me` and are skipped rather
          // than 403'd.
          if (
            provider === "challonge" &&
            !hasScope(linked.scope, "tournaments:read")
          ) {
            return;
          }
          const token = await accessTokenFor(
            userId,
            provider,
            linked.accountId,
            requestHeaders,
          );
          if (!token) return;
          matches =
            provider === "challonge"
              ? await loadChallongeSchedule(token)
              : await loadStartggSchedule(token);
        }

        await upsertMatches(userId, provider, matches);
        // Bookkeep even on an empty pull, to defer the next attempt by a TTL.
        await markSynced(identity.id, identity.metadata);
      } catch (error) {
        console.error(`schedule sync failed for ${provider}:`, error);
      }
    }),
  );
}

export type LoadedSchedule = {
  upcoming: ScheduleEntry[];
  past: ScheduleEntry[];
};

/** Map a stored external_matches row to the client-facing entry shape. */
function toEntry(row: {
  id: string;
  provider: string;
  title: string | null;
  opponentName: string | null;
  round: string | null;
  status: string;
  scheduledAt: Date | null;
  url: string | null;
}): ScheduleEntry {
  return {
    id: row.id,
    provider: row.provider as ScheduleProvider,
    title: row.title ?? "Match",
    opponent: row.opponentName,
    round: row.round,
    status: row.status as ScheduleStatus,
    scheduledAt: row.scheduledAt ? row.scheduledAt.getTime() : null,
    url: row.url,
  };
}

/**
 * The member's calendar: syncs lazily, then returns their external matches
 * split into Upcoming (scheduled/live, soonest first) and Results (finished/
 * cancelled, most recent first). Undated rows sort to the end of Upcoming.
 */
export async function loadSchedule(
  userId: string,
  requestHeaders: Headers,
): Promise<LoadedSchedule> {
  await syncSchedule(userId, requestHeaders);

  const rows = await getDb()
    .select({
      id: externalMatches.id,
      provider: externalMatches.provider,
      title: externalMatches.title,
      opponentName: externalMatches.opponentName,
      round: externalMatches.round,
      status: externalMatches.status,
      scheduledAt: externalMatches.scheduledAt,
      url: externalMatches.url,
    })
    .from(externalMatches)
    .where(eq(externalMatches.userId, userId))
    .orderBy(asc(externalMatches.scheduledAt));

  const entries = rows.map(toEntry);
  const upcoming = entries
    .filter((e) => isUpcomingStatus(e.status))
    .sort(byTime(true));
  const past = entries
    .filter((e) => !isUpcomingStatus(e.status))
    .sort(byTime(false));
  return { upcoming, past };
}

/** Sort by scheduledAt; ascending for upcoming, descending for results.
    Null times sort last either way. */
function byTime(ascending: boolean) {
  return (a: ScheduleEntry, b: ScheduleEntry) => {
    if (a.scheduledAt == null) return 1;
    if (b.scheduledAt == null) return -1;
    return ascending
      ? a.scheduledAt - b.scheduledAt
      : b.scheduledAt - a.scheduledAt;
  };
}
