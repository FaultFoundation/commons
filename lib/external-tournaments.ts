import { desc, eq, inArray } from "drizzle-orm";

import { extEvents, extStandings, extTournaments } from "@/db/cen-schema";
import { getCenDb } from "@/lib/cen-db";

// ---------------------------------------------------------------------------
// The Commons' read view over cen-sql (the external-tournaments projection).
// Server-only. Every read degrades: no CEN binding, an empty table, or a
// query failure returns "nothing" rather than throwing, so the unified
// Tournaments tab renders with just the internal (Challonge) tournaments when
// the projection isn't there yet. cen-sql is never written from here.
// ---------------------------------------------------------------------------

export type ExternalTournamentListItem = {
  id: string;
  /** 'startgg' | 'faceit' — the native site this was scraped from. */
  source: string;
  name: string;
  game: string | null;
  /** Derived from start/end vs now: registration | active | completed. */
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  numAttendees: number | null;
  /** Deep link to the tournament on its native site. */
  url: string | null;
};

/**
 * A tournament-level status derived from its window, mapped onto the same
 * vocabulary the internal tournaments use so the unified list can filter and
 * label both the same way. The scraper has no single tournament "state"; the
 * dates are the reliable signal.
 */
function deriveStatus(startAt: Date | null, endAt: Date | null): string {
  const now = Date.now();
  if (endAt && endAt.getTime() < now) return "completed";
  if (startAt && startAt.getTime() <= now) return "active";
  return "registration";
}

/** Every external tournament, newest first — for the unified Tournaments list. */
export async function listExternalTournaments(): Promise<
  ExternalTournamentListItem[]
> {
  const db = getCenDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        id: extTournaments.id,
        source: extTournaments.source,
        name: extTournaments.name,
        game: extTournaments.game,
        startAt: extTournaments.startAt,
        endAt: extTournaments.endAt,
        numAttendees: extTournaments.numAttendees,
        url: extTournaments.url,
      })
      .from(extTournaments)
      .orderBy(desc(extTournaments.startAt));
    return rows.map((r) => ({ ...r, status: deriveStatus(r.startAt, r.endAt) }));
  } catch (error) {
    console.error("listExternalTournaments failed:", error);
    return [];
  }
}

export type ExternalTournamentDetail = {
  id: string;
  source: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  numAttendees: number | null;
  city: string | null;
  country: string | null;
  url: string | null;
  events: {
    id: string;
    name: string | null;
    state: string | null;
    numEntrants: number | null;
    standings: {
      entrantName: string;
      isTeam: boolean;
      placement: number | null;
    }[];
  }[];
};

/**
 * One external tournament with its events and final standings — the data the
 * branded external tournament view renders (results, not a live bracket, since
 * that's all the scraper collects). Null when absent or unavailable.
 */
export async function getExternalTournament(
  id: string,
): Promise<ExternalTournamentDetail | null> {
  const db = getCenDb();
  if (!db) return null;
  try {
    const t = (
      await db
        .select()
        .from(extTournaments)
        .where(eq(extTournaments.id, id))
        .limit(1)
    )[0];
    if (!t) return null;

    const events = await db
      .select()
      .from(extEvents)
      .where(eq(extEvents.tournamentId, id));

    const eventIds = events.map((e) => e.id);
    const standings = eventIds.length
      ? await db
          .select()
          .from(extStandings)
          .where(inArray(extStandings.eventId, eventIds))
      : [];

    const byEvent = new Map<string, ExternalTournamentDetail["events"][number]["standings"]>();
    for (const s of standings) {
      const list = byEvent.get(s.eventId) ?? [];
      list.push({
        entrantName: s.entrantName,
        isTeam: s.isTeam,
        placement: s.placement,
      });
      byEvent.set(s.eventId, list);
    }
    // Best placement first within each event.
    for (const list of byEvent.values()) {
      list.sort((a, b) => (a.placement ?? 9999) - (b.placement ?? 9999));
    }

    return {
      id: t.id,
      source: t.source,
      name: t.name,
      slug: t.slug,
      game: t.game,
      status: deriveStatus(t.startAt, t.endAt),
      startAt: t.startAt,
      endAt: t.endAt,
      numAttendees: t.numAttendees,
      city: t.city,
      country: t.country,
      url: t.url,
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        state: e.state,
        numEntrants: e.numEntrants,
        standings: byEvent.get(e.id) ?? [],
      })),
    };
  } catch (error) {
    console.error("getExternalTournament failed:", error);
    return null;
  }
}
