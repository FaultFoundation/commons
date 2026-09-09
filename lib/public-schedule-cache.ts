import { and, eq, isNull, lt, or } from "drizzle-orm";
import { tournamentListCache } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { ScheduleEntry } from "@/lib/schedule-shared";

const CACHE_ID = "public-schedule-v1";
const TTL_MS = 60_000;
const LEASE_MS = 30_000;

/** Public data only. Personal matches and reported times are still read live.
 * One stale reader rebuilds; concurrent readers retain the last good result.
 * A failed source read must throw so it cannot replace a good snapshot with [].
 */
export async function cachedPublicSchedule(build: () => Promise<ScheduleEntry[]>): Promise<ScheduleEntry[]> {
  const db = getDb();
  const now = Date.now();
  let cached: ScheduleEntry[] | null = null;
  try {
    const [row] = await db.select().from(tournamentListCache)
      .where(eq(tournamentListCache.id, CACHE_ID)).limit(1);
    if (row) {
      try {
        const parsed: unknown = JSON.parse(row.payload);
        if (Array.isArray(parsed) && parsed.every((entry) =>
          entry && typeof entry.id === "string" && typeof entry.status === "string")) {
          cached = parsed;
        }
      } catch { /* Bad payload is a miss. */ }
      // Rebuild at UTC midnight too: the builder's date cutoff has changed.
      if (cached && now - row.builtAt.getTime() < TTL_MS &&
          row.builtAt.toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10)) return cached;
      const claimed = await db.update(tournamentListCache)
        .set({ leaseUntil: new Date(now + LEASE_MS) })
        .where(and(eq(tournamentListCache.id, CACHE_ID), or(
          isNull(tournamentListCache.leaseUntil), lt(tournamentListCache.leaseUntil, new Date(now)),
        ))).returning({ id: tournamentListCache.id });
      if (!claimed.length && cached) return cached;
    }
  } catch (error) {
    console.error("public schedule cache read failed", error);
    // Older deployments without the cache table still read the source.
    return build();
  }

  let entries: ScheduleEntry[];
  try {
    entries = await build();
  } catch (error) {
    // Leave the lease in place for a short retry backoff during CEN outages.
    if (cached) {
      console.error("public schedule refresh failed; retaining snapshot", error);
      return cached;
    }
    throw error;
  }
  try {
    const payload = JSON.stringify(entries);
    await db.insert(tournamentListCache)
      .values({ id: CACHE_ID, payload, builtAt: new Date(), leaseUntil: null })
      .onConflictDoUpdate({ target: tournamentListCache.id,
        set: { payload, builtAt: new Date(), leaseUntil: null } });
  } catch (error) {
    console.error("public schedule cache write failed", error);
  }
  return entries;
}
