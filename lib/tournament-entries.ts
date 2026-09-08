// Server-only (it reads D1 through listTournaments / the cen-sql projection).
import { cache } from "react";
import { and, eq, isNull, lt, or } from "drizzle-orm";

import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { tournamentListCache } from "@/db/schema";
import { getDb } from "@/lib/db";
import { listExternalTournaments } from "@/lib/external-tournaments";
import { enrichDiscovery } from "@/lib/discovery";
import { listTournaments } from "@/lib/tournaments";

/** The single cache row's key — this table holds exactly one. */
const LIST_CACHE_ID = "default";
/** How long a built list is served before a reader rebuilds it. The scraper's
 *  cron is hourly, so ten minutes is far inside its write cadence; the cost of
 *  being wrong is a list up to ten minutes behind, and opening a tournament
 *  always reads that tournament's own row live. */
const LIST_CACHE_TTL_MS = 10 * 60 * 1000;
/** How long one reader owns a rebuild before another may retry it. Comfortably
 *  longer than a build (~0.5s of D1 + classification), short enough that a
 *  Worker killed mid-build doesn't freeze the cache. */
const LIST_CACHE_LEASE_MS = 60 * 1000;

/**
 * Build the unified tournament list from source: internal (Challonge-backed,
 * website-sql) plus external (the cen-sql projection), mapped into the one
 * shape the list card renders. External reads degrade to [] when cen-sql isn't
 * bound, so the list still shows the internal tournaments.
 *
 * This is the EXPENSIVE path — see `tournament_list_cache` in db/schema.ts for
 * what it costs and why almost every caller should be going through
 * `loadTournamentEntries()` instead.
 */
async function buildTournamentEntries(): Promise<TournamentListEntry[]> {
  const [internal, external] = await Promise.all([
    listTournaments({ excludeDraft: true }),
    listExternalTournaments(),
  ]);

  const internalEntries: TournamentListEntry[] = internal.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    status: t.status,
    entrantCount: t.entrantCount,
    maxParticipants: t.maxParticipants,
    startsAt: t.startsAt ? t.startsAt.getTime() : null,
    bannerUrl: t.bannerUrl,
    featured: t.featured,
    endsAt: t.endsAt?.getTime() ?? null,
    description: t.description,
    registrationClosesAt: t.registrationClosesAt?.getTime() ?? null,
    academicVerificationRequired: t.academicVerificationRequired,
    game: t.gameName,
    gameLogoUrl: t.gameLogoUrl,
  }));

  const externalEntries: TournamentListEntry[] = external.map((t) => ({
    id: t.id,
    name: t.name,
    format: "",
    status: t.status,
    entrantCount: t.numAttendees ?? 0,
    maxParticipants: null,
    // Prefer the first round's scheduled time when the projection has match
    // times; fall back to the tournament-level start. Drives both the displayed
    // date+time and the list sort.
    startsAt: (t.firstMatchAt ?? t.startAt)?.getTime() ?? null,
    bannerUrl: t.bannerUrl,
    featured: false,
    endsAt: t.endAt?.getTime() ?? null,
    sourceStartsAt: t.startAt?.getTime() ?? null,
    description: t.description,
    organizer: t.organizer,
    organizerUrl: t.organizerUrl,
    country: t.country,
    city: t.city,
    registrationClosesAt: t.registrationClosesAt?.getTime() ?? null,
    prizePool: t.prizePool,
    source: t.source,
    sourceTournamentId: t.sourceTournamentId,
    externalUrl: t.url,
    game: t.game,
    gameLogoUrl: null,
  }));

  const entries = await enrichDiscovery([...internalEntries, ...externalEntries]);
  // Classification uses source prose on the server; cards do not need a copy
  // of every full description in their serialized client payload.
  return entries.map(({ description: _description, ...entry }) => entry);
}

/** Parse a cached payload, treating anything malformed as a cache miss rather
 *  than letting it reach the pages as a broken list. */
function parseCached(payload: string): TournamentListEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return Array.isArray(parsed) ? (parsed as TournamentListEntry[]) : null;
  } catch {
    return null;
  }
}

/** Take the rebuild lease, or report that someone else already holds it. One
 *  atomic UPDATE elects a single builder across Worker isolates — the claimSync
 *  idiom in lib/schedule.ts. */
async function claimRebuild(now: number): Promise<boolean> {
  const claimed = await getDb()
    .update(tournamentListCache)
    .set({ leaseUntil: new Date(now + LIST_CACHE_LEASE_MS) })
    .where(
      and(
        eq(tournamentListCache.id, LIST_CACHE_ID),
        or(
          isNull(tournamentListCache.leaseUntil),
          lt(tournamentListCache.leaseUntil, new Date(now)),
        ),
      ),
    )
    .returning({ id: tournamentListCache.id });
  return claimed.length > 0;
}

/**
 * The unified tournament list, served from `tournament_list_cache` and rebuilt
 * lazily once the row is older than the TTL.
 *
 * Every failure degrades to building live: no cache row yet (cold start), a
 * malformed payload, or a D1 error on the cache table all fall through to
 * `buildTournamentEntries()`. So the pages behave exactly as they did before
 * the cache existed — just slower — and never 500 because of it.
 *
 * Lives here rather than in the Tournaments page because the Home board can pin
 * the Tournaments bubble — both hosts must build entries identically, or a
 * pinned list would quietly disagree with the tab it came from.
 */
export const loadTournamentEntries = cache(
  async function loadTournamentEntries(): Promise<TournamentListEntry[]> {
    const now = Date.now();

    let row:
      | { payload: string; builtAt: Date; leaseUntil: Date | null }
      | undefined;
    try {
      [row] = await getDb()
        .select({
          payload: tournamentListCache.payload,
          builtAt: tournamentListCache.builtAt,
          leaseUntil: tournamentListCache.leaseUntil,
        })
        .from(tournamentListCache)
        .where(eq(tournamentListCache.id, LIST_CACHE_ID))
        .limit(1);
    } catch (error) {
      // Table not migrated yet — build live rather than take the pages down.
      console.error("tournament list cache unavailable", error);
      return buildTournamentEntries();
    }

    const cached = row ? parseCached(row.payload) : null;
    if (cached && row && now - row.builtAt.getTime() < LIST_CACHE_TTL_MS) {
      return cached;
    }

    // Stale (or unparseable). Exactly one reader rebuilds; the rest keep serving
    // the stale copy, which is far better than every concurrent visitor
    // replaying the whole build against cen-sql.
    if (row) {
      let mine = false;
      try {
        mine = await claimRebuild(now);
      } catch (error) {
        console.error("tournament list cache lease failed", error);
      }
      if (!mine && cached) return cached;
    }

    const entries = await buildTournamentEntries();

    // Best-effort write-back: a cache we failed to store is a slow next request,
    // never a failed one.
    try {
      const payload = JSON.stringify(entries);
      await getDb()
        .insert(tournamentListCache)
        .values({
          id: LIST_CACHE_ID,
          payload,
          builtAt: new Date(),
          leaseUntil: null,
        })
        .onConflictDoUpdate({
          target: tournamentListCache.id,
          set: { payload, builtAt: new Date(), leaseUntil: null },
        });
    } catch (error) {
      console.error("tournament list cache write failed", error);
    }

    return entries;
  },
);

/**
 * Drop the cached list so the next read rebuilds it. Called by the admin
 * tournament actions: a staff edit must show up on /tournaments/ and the Home
 * board immediately, not after the TTL lapses. Never throws — invalidation
 * failing must not fail the mutation it accompanies (the enqueueBotJob rule).
 */
export async function invalidateTournamentEntries(): Promise<void> {
  try {
    await getDb()
      .update(tournamentListCache)
      .set({ builtAt: new Date(0), leaseUntil: null })
      .where(eq(tournamentListCache.id, LIST_CACHE_ID));
  } catch (error) {
    console.error("tournament list cache invalidation failed", error);
  }
}
