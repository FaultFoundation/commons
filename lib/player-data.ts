import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  pdMatches,
  pdSync,
  pdTeamLinks,
  pdTeamMembers,
  pdTeams,
} from "@/db/ow-schema";
import { getAccountLinksCached } from "@/lib/account-links";
import { getAuth } from "@/lib/auth";
import { getOwDb } from "@/lib/ow-db";
import { chunkForUser } from "@/lib/ow-stats-shared";
import {
  getPlatformIdentitiesCached,
  hasScope,
} from "@/lib/platform-identities";
import {
  PD_FORCE_FLOOR_MS,
  PD_PROVIDERS,
  PD_SYNC_TTL_MS,
  type ExternalMatchRow,
  type ExternalTeamMember,
  type ExternalTeamSummary,
  type MatchDataResponse,
  type PdProvider,
  type PdProviderState,
  type PdSyncStatus,
} from "@/lib/player-data-shared";
import {
  applySyncOutcome,
  runProviderSync,
  staleRosterTeamIds,
} from "@/lib/player-data-sync";

// ---------------------------------------------------------------------------
// Cross-provider player data — the server-only Commons half. Owns the pd_sync
// registry mirror (platform_identities → ow-player-data, so the standalone
// poller never needs a website-sql binding), the lazy page-open/refresh-icon
// sync, and every read the Teams tab / team detail / Match Data tab does.
//
// Degrades like lib/ow-stats.ts: no OW binding, a missing key, or a provider
// miss returns empty/no-op — a render never fails because a platform is down.
// The other writer is the ow-data Worker's hourly cron (FACEIT/start.gg only;
// Challonge needs the member's OAuth token, which only Better Auth here can
// mint, so its rows sync on page open alone).
// ---------------------------------------------------------------------------

type PdSyncRow = typeof pdSync.$inferSelect;

/**
 * Mirror the member's linked connect providers into pd_sync — upserting rows
 * for current links, deleting rows (with their links + matches) for providers
 * that have been unlinked since. Data hygiene: unlinking a platform removes its
 * data from the member's view, same as the Integrations card disappearing.
 */
async function ensurePdSyncRows(userId: string): Promise<void> {
  const db = getOwDb();
  if (!db) return;

  const identities = await getPlatformIdentitiesCached(userId);
  const existing = await db
    .select()
    .from(pdSync)
    .where(eq(pdSync.userId, userId));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stmts: any[] = [];
  const now = new Date();

  for (const provider of PD_PROVIDERS) {
    const identity = identities.find(
      (row) => row.provider === provider && row.externalId,
    );
    const row = existing.find((r) => r.provider === provider);
    if (identity?.externalId) {
      if (!row) {
        stmts.push(
          db.insert(pdSync).values({
            id: `${userId}:${provider}`,
            userId,
            provider,
            externalId: identity.externalId,
            handle: identity.handle,
            pollChunk: chunkForUser(userId),
          }),
        );
      } else if (
        row.externalId !== identity.externalId ||
        row.handle !== identity.handle
      ) {
        stmts.push(
          db
            .update(pdSync)
            .set({
              externalId: identity.externalId,
              handle: identity.handle,
              updatedAt: now,
              // A re-link to a DIFFERENT account restarts history from scratch.
              ...(row.externalId !== identity.externalId
                ? {
                    backfillCursor: null,
                    backfillDone: false,
                    meta: null,
                    status: null,
                    statusDetail: null,
                  }
                : {}),
            })
            .where(eq(pdSync.id, row.id)),
        );
      }
    } else if (row) {
      stmts.push(db.delete(pdSync).where(eq(pdSync.id, row.id)));
      stmts.push(
        db
          .delete(pdTeamLinks)
          .where(
            and(eq(pdTeamLinks.userId, userId), eq(pdTeamLinks.provider, provider)),
          ),
      );
      stmts.push(
        db
          .delete(pdMatches)
          .where(
            and(eq(pdMatches.userId, userId), eq(pdMatches.provider, provider)),
          ),
      );
    }
  }

  if (stmts.length) {
    const [first, ...rest] = stmts;
    await db.batch([first, ...rest]);
  }
}

/**
 * A currently-valid Challonge access token via Better Auth (refreshing if
 * expired), or null when the link/scope/refresh is missing — same path as
 * lib/schedule.ts. Members linked before the tournaments:read scope shipped
 * are skipped rather than 403'd.
 */
async function challongeToken(
  userId: string,
  requestHeaders: Headers,
): Promise<string | null> {
  try {
    const links = await getAccountLinksCached(userId);
    const linked = links.find((row) => row.providerId === "challonge");
    if (!linked) return null;
    if (!hasScope(linked.scope, "tournaments:read")) return null;
    const result = await getAuth().api.getAccessToken({
      body: { providerId: "challonge", accountId: linked.accountId, userId },
      headers: requestHeaders,
    });
    return result?.accessToken ?? null;
  } catch {
    return null;
  }
}

export type PlayerDataSyncResult = {
  /** True when at least one provider actually ran a sync tick. */
  ran: boolean;
  /** True when a run plausibly changed what a page shows (teams refreshed,
      matches pulled, or a status moved) — the refresh components' cue to
      router.refresh(). */
  changed: boolean;
};

/**
 * Refresh the member's external teams + match history from every linked
 * provider whose last sync has aged past the TTL (or the short force floor for
 * the refresh icon). Best-effort per provider; a failure lands as a visible
 * status, never a throw.
 */
export async function syncPlayerData(
  userId: string,
  requestHeaders: Headers,
  { force = false }: { force?: boolean } = {},
): Promise<PlayerDataSyncResult> {
  const db = getOwDb();
  if (!db) return { ran: false, changed: false };

  await ensurePdSyncRows(userId);
  const rows = await db.select().from(pdSync).where(eq(pdSync.userId, userId));
  if (!rows.length) return { ran: false, changed: false };

  const { env } = getCloudflareContext();
  const ttl = force ? PD_FORCE_FLOOR_MS : PD_SYNC_TTL_MS;
  const now = Date.now();

  let ran = false;
  let changed = false;

  await Promise.all(
    rows.map(async (row: PdSyncRow) => {
      try {
        if (row.lastSyncedAt && now - row.lastSyncedAt.getTime() < ttl) return;

        const outcome = await runProviderSync({
          row,
          faceitApiKey: env.FACEIT_API_KEY ?? null,
          startggApiKey: env.STARTGG_API_KEY ?? null,
          challongeToken:
            row.provider === "challonge"
              ? await challongeToken(userId, requestHeaders)
              : null,
          rosterDue: (ids) => staleRosterTeamIds(db, row.provider, ids),
        });
        if (!outcome) return; // provider unconfigured — not an error, no bump

        ran = true;
        if (
          outcome.teams !== null ||
          outcome.matches.length > 0 ||
          outcome.status !== row.status
        ) {
          changed = true;
        }
        await applySyncOutcome(db, row, outcome);
      } catch (error) {
        console.error(`player-data sync failed for ${row.provider}:`, error);
      }
    }),
  );

  return { ran, changed };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The member's external teams for the Teams tab, D1-only (never a provider
 * call — freshness comes from the lazy sync + cron). Empty when the OW binding
 * is absent or nothing is synced yet.
 */
export async function getExternalTeamsForUser(
  userId: string,
): Promise<ExternalTeamSummary[]> {
  const db = getOwDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: pdTeams.id,
        provider: pdTeams.provider,
        name: pdTeams.name,
        game: pdTeams.game,
        logoUrl: pdTeams.logoUrl,
        url: pdTeams.url,
      })
      .from(pdTeamLinks)
      .innerJoin(pdTeams, eq(pdTeams.id, pdTeamLinks.teamId))
      .where(eq(pdTeamLinks.userId, userId))
      .orderBy(pdTeams.name);
    if (!rows.length) return [];

    const counts = await db
      .select({
        teamId: pdTeamMembers.teamId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(pdTeamMembers)
      .where(
        inArray(
          pdTeamMembers.teamId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(pdTeamMembers.teamId);
    const countByTeam = new Map(counts.map((c) => [c.teamId, c.count]));

    return rows.map((r) => ({
      id: r.id,
      provider: r.provider as PdProvider,
      name: r.name,
      game: r.game,
      logoUrl: r.logoUrl,
      url: r.url,
      memberCount: countByTeam.get(r.id) ?? 0,
    }));
  } catch (error) {
    console.error("external teams read failed:", error);
    return [];
  }
}

export type ExternalTeamDetail = {
  team: ExternalTeamSummary;
  roster: ExternalTeamMember[];
  matches: ExternalMatchRow[];
};

function toMatchRow(m: typeof pdMatches.$inferSelect): ExternalMatchRow {
  return {
    id: m.id,
    provider: m.provider as PdProvider,
    game: m.game,
    competitionName: m.competitionName,
    roundText: m.roundText,
    teamName: m.teamName,
    opponentName: m.opponentName,
    scoreFor: m.scoreFor,
    scoreAgainst: m.scoreAgainst,
    result: m.result as ExternalMatchRow["result"],
    status: m.status as ExternalMatchRow["status"],
    startedAt: m.startedAt ? m.startedAt.getTime() : null,
    url: m.url,
  };
}

/**
 * One external team, viewable only by a member linked to it — a team you're
 * not on is indistinguishable from one that doesn't exist, matching the
 * internal-team rule. Read as one db.batch snapshot (the cen-sql pattern) so a
 * concurrent sync can't produce a half-updated view.
 */
export async function getExternalTeamDetail(
  userId: string,
  teamRowId: string,
): Promise<ExternalTeamDetail | null> {
  const db = getOwDb();
  if (!db) return null;
  try {
    const [links, teamRows, memberRows, matchRows] = await db.batch([
      db
        .select({ id: pdTeamLinks.id })
        .from(pdTeamLinks)
        .where(
          and(eq(pdTeamLinks.userId, userId), eq(pdTeamLinks.teamId, teamRowId)),
        )
        .limit(1),
      db.select().from(pdTeams).where(eq(pdTeams.id, teamRowId)).limit(1),
      db
        .select()
        .from(pdTeamMembers)
        .where(eq(pdTeamMembers.teamId, teamRowId)),
      // The team's matches across every linked member who carries them —
      // deduped below since two members in one match each store a row.
      db
        .select()
        .from(pdMatches)
        .where(
          eq(
            pdMatches.teamExternalId,
            sql`(select external_team_id from pd_teams where id = ${teamRowId})`,
          ),
        )
        .orderBy(desc(pdMatches.startedAt))
        .limit(300),
    ]);

    if (!links.length || !teamRows.length) return null;
    const team = teamRows[0];

    const seen = new Set<string>();
    const matches: ExternalMatchRow[] = [];
    for (const m of matchRows) {
      if (m.provider !== team.provider) continue;
      if (seen.has(m.externalMatchId)) continue;
      seen.add(m.externalMatchId);
      matches.push(toMatchRow(m));
    }

    const roleRank = { leader: 0, captain: 1, member: 2 } as const;
    const roster: ExternalTeamMember[] = memberRows
      .map((m) => ({
        handle: m.handle,
        role: (m.role ?? null) as ExternalTeamMember["role"],
        avatarUrl: m.avatarUrl,
      }))
      .sort(
        (a, b) =>
          (roleRank[a.role ?? "member"] ?? 2) - (roleRank[b.role ?? "member"] ?? 2) ||
          (a.handle ?? "").localeCompare(b.handle ?? ""),
      );

    return {
      team: {
        id: team.id,
        provider: team.provider as PdProvider,
        name: team.name,
        game: team.game,
        logoUrl: team.logoUrl,
        url: team.url,
        memberCount: memberRows.length,
      },
      roster,
      matches,
    };
  } catch (error) {
    console.error("external team detail read failed:", error);
    return null;
  }
}

/** How many match rows the Match Data tab is handed (newest first). */
const MATCH_LIST_LIMIT = 300;

/**
 * Everything the Statistics → Match Data tab renders: per-provider sync state
 * (so an inaccessible account is an explained error, not missing data) plus
 * the member's match history across providers, newest first.
 */
export async function getMatchData(userId: string): Promise<MatchDataResponse> {
  const db = getOwDb();
  if (!db) return { providers: [], matches: [] };
  try {
    const [syncRows, matchRows] = await db.batch([
      db.select().from(pdSync).where(eq(pdSync.userId, userId)),
      db
        .select()
        .from(pdMatches)
        .where(eq(pdMatches.userId, userId))
        .orderBy(desc(pdMatches.startedAt))
        .limit(MATCH_LIST_LIMIT),
    ]);

    const providers: PdProviderState[] = syncRows.map((row) => ({
      provider: row.provider as PdProvider,
      status: (row.status ?? null) as PdSyncStatus | null,
      statusDetail: row.statusDetail,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.getTime() : null,
      backfillDone: row.backfillDone,
    }));

    return { providers, matches: matchRows.map(toMatchRow) };
  } catch (error) {
    console.error("match data read failed:", error);
    return { providers: [], matches: [] };
  }
}
