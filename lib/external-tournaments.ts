import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  max,
  or,
  sql,
} from "drizzle-orm";

import {
  extEvents,
  extMatches,
  extStandings,
  extTournaments,
} from "@/db/cen-schema";
import { getCenDb } from "@/lib/cen-db";
import {
  isScheduleProvider,
  type ScheduleEntry,
} from "@/lib/schedule-shared";

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
  /** Cover/banner artwork (FACEIT cover_image, start.gg banner); null if none. */
  bannerUrl: string | null;
};

/**
 * A tournament-level status derived from its window, mapped onto the same
 * vocabulary the internal tournaments use so the unified list can filter and
 * label both the same way. The scraper has no single tournament "state"; the
 * dates are the reliable signal.
 */
const STALE_TOURNAMENT_DAYS = 30;
const STALE_TOURNAMENT_MS = STALE_TOURNAMENT_DAYS * 24 * 60 * 60 * 1000;
const TERMINAL_EVENT_STATES = new Set([
  "cancelled",
  "canceled",
  "complete",
  "completed",
  "finalized",
  "finished",
]);

function deriveStatus(
  startAt: Date | null,
  endAt: Date | null,
  eventStates: (string | null)[] = [],
  lastObservedAt: Date | null = null,
  latestMatchAt: Date | null = null,
): string {
  const now = Date.now();
  const knownStates = eventStates
    .map((state) => state?.trim().toLowerCase())
    .filter((state): state is string => Boolean(state));
  if (
    knownStates.length > 0 &&
    knownStates.every((state) => TERMINAL_EVENT_STATES.has(state))
  ) {
    return "completed";
  }
  if (endAt && endAt.getTime() < now) return "completed";
  if (!endAt && latestMatchAt) {
    if (latestMatchAt.getTime() < now - STALE_TOURNAMENT_MS) {
      return "completed";
    }
    if (startAt && startAt.getTime() <= now) return "active";
    return "registration";
  }
  // Some providers omit an end date and leave their event state stale. Once a
  // tournament has been underway for a month with neither signal, treat it as
  // concluded in the read model rather than leaving it Active forever.
  if (
    !endAt &&
    startAt &&
    startAt.getTime() < now - STALE_TOURNAMENT_MS
  ) {
    return "completed";
  }
  if (
    !startAt &&
    !endAt &&
    lastObservedAt &&
    lastObservedAt.getTime() < now - STALE_TOURNAMENT_MS
  ) {
    return "completed";
  }
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
        updatedAt: extTournaments.updatedAt,
        numAttendees: extTournaments.numAttendees,
        url: extTournaments.url,
        bannerUrl: extTournaments.bannerUrl,
      })
      .from(extTournaments)
      .orderBy(desc(extTournaments.startAt));
    const eventRows = rows.length
      ? await db
          .select({
            tournamentId: extEvents.tournamentId,
            state: extEvents.state,
          })
          .from(extEvents)
      : [];
    const statesByTournament = new Map<string, (string | null)[]>();
    for (const event of eventRows) {
      const states = statesByTournament.get(event.tournamentId) ?? [];
      states.push(event.state);
      statesByTournament.set(event.tournamentId, states);
    }
    const latestMatchByTournament = new Map<string, Date | null>();
    try {
      const matchRows = rows.length
        ? await db
            .select({
              tournamentId: extEvents.tournamentId,
              latestMatchAt: max(extMatches.scheduledAt),
            })
            .from(extMatches)
            .innerJoin(extEvents, eq(extEvents.id, extMatches.eventId))
            .groupBy(extEvents.tournamentId)
        : [];
      for (const match of matchRows) {
        latestMatchByTournament.set(
          match.tournamentId,
          match.latestMatchAt,
        );
      }
    } catch {
      // Older cen-sql schema: start/end and event-state derivation still works.
    }
    return rows.map(({ updatedAt, ...r }) => ({
      ...r,
      status: deriveStatus(
        r.startAt,
        r.endAt,
        statesByTournament.get(r.id),
        updatedAt,
        latestMatchByTournament.get(r.id),
      ),
    }));
  } catch (error) {
    console.error("listExternalTournaments failed:", error);
    return [];
  }
}

export type ExternalTournamentMatch = {
  id: string;
  scheduledAt: Date | null;
  state: string | null;
  round: string | null;
  entrant1Name: string | null;
  entrant2Name: string | null;
  url: string | null;
};

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
  /** Cover/banner artwork (FACEIT cover_image, start.gg banner); null if none. */
  bannerUrl: string | null;
  /** Provider-authored blurb (FACEIT only); null for start.gg. */
  description: string | null;
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
    /** Bracket progression — the sets/matches, scheduled-soonest first. */
    matches: ExternalTournamentMatch[];
  }[];
};

/**
 * Upcoming public events for the schedule's All Matches calendar. A populated
 * ext_matches projection is authoritative; an empty projection means an older
 * scraper seed is still deployed, so tournament start windows bridge the
 * rollout without inventing individual match times.
 */
export async function listUpcomingExternalScheduleEntries(): Promise<
  ScheduleEntry[]
> {
  const db = getCenDb();
  if (db) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const staleCutoff = new Date(Date.now() - STALE_TOURNAMENT_MS);
      const rows = await db
        .select({
          id: extMatches.id,
          state: extMatches.state,
          scheduledAt: extMatches.scheduledAt,
          round: extMatches.round,
          entrant1Name: extMatches.entrant1Name,
          entrant2Name: extMatches.entrant2Name,
          matchUrl: extMatches.url,
          eventName: extEvents.name,
          source: extTournaments.source,
          tournamentName: extTournaments.name,
          tournamentUrl: extTournaments.url,
        })
        .from(extMatches)
        .innerJoin(extEvents, eq(extEvents.id, extMatches.eventId))
        .innerJoin(
          extTournaments,
          eq(extTournaments.id, extEvents.tournamentId),
        )
        .where(
          and(
            or(
              isNull(extMatches.scheduledAt),
              gte(extMatches.scheduledAt, today),
            ),
            or(
              gte(extTournaments.endAt, today),
              and(
                isNull(extTournaments.endAt),
                or(
                  gte(extTournaments.startAt, staleCutoff),
                  and(
                    isNull(extTournaments.startAt),
                    gte(extTournaments.updatedAt, staleCutoff),
                  ),
                ),
              ),
            ),
          ),
        )
        .orderBy(
          sql`${extMatches.scheduledAt} is null`,
          asc(extMatches.scheduledAt),
        )
        .limit(1000);

      // A populated match projection is authoritative even when every row is
      // already terminal. An empty table means the old scraper seed is still
      // deployed, so retain the tournament-window fallback below.
      if (rows.length > 0) {
        return rows
          .flatMap((row): ScheduleEntry[] => {
            if (!isScheduleProvider(row.source)) return [];
            const state = externalMatchStatus(row.state);
            if (state === "finished" || state === "cancelled") return [];
            const matchup = [row.entrant1Name, row.entrant2Name]
              .filter(Boolean)
              .join(" vs ");
            return [
              {
                id: `public:${row.id}`,
                provider: row.source,
                title: matchup || row.tournamentName,
                opponent: null,
                round: [row.tournamentName, row.eventName, row.round]
                  .filter(Boolean)
                  .join(" · "),
                status: state,
                scheduledAt: row.scheduledAt?.getTime() ?? null,
                url: row.matchUrl ?? row.tournamentUrl,
                href: null,
                // Collapse every match of one tournament into a single calendar
                // chip (a bracket day otherwise floods the cell); the popup
                // expands them. Key on the tournament, not the match.
                groupKey: `${row.source}:${row.tournamentName}`,
                groupTitle: row.tournamentName,
              },
            ];
          })
          .sort(
            (a, b) =>
              (a.scheduledAt ?? Infinity) - (b.scheduledAt ?? Infinity),
          );
      }

      const projectionExists = await db
        .select({ id: extMatches.id })
        .from(extMatches)
        .limit(1);
      if (projectionExists.length > 0) return [];
    } catch (error) {
      console.error("listUpcomingExternalScheduleEntries matches failed:", error);
    }
  }

  const tournaments = await listExternalTournaments();
  return tournaments
    .flatMap((tournament): ScheduleEntry[] => {
      if (
        !isScheduleProvider(tournament.source) ||
        tournament.status === "completed" ||
        !tournament.startAt
      ) {
        return [];
      }
      return [
        {
          id: `public:${tournament.id}`,
          provider: tournament.source,
          title: tournament.name,
          opponent: null,
          round: tournament.game,
          status: tournament.status === "active" ? "live" : "scheduled",
          scheduledAt: tournament.startAt.getTime(),
          url: tournament.url,
          href: null,
        },
      ];
    })
    .sort((a, b) => (a.scheduledAt ?? Infinity) - (b.scheduledAt ?? Infinity));
}

function externalMatchStatus(state: string | null): ScheduleEntry["status"] {
  switch (state?.trim().toLowerCase()) {
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "complete":
    case "completed":
    case "finished":
    case "3": // start.gg SetState.COMPLETED
      return "finished";
    case "active":
    case "ongoing":
    case "ready":
    case "2": // start.gg SetState.ACTIVE
      return "live";
    default:
      return "scheduled";
  }
}

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
    // Read the tournament and all its children in ONE db.batch so the branded
    // view always renders a single consistent snapshot — even if the scraper
    // rewrites this tournament (an atomic replaceTournament batch) between the
    // reads. Children are keyed off a tournament-id subquery rather than an
    // eventIds `IN (...)` list, which also keeps this off D1's bind limit.
    const childEventIds = db
      .select({ id: extEvents.id })
      .from(extEvents)
      .where(eq(extEvents.tournamentId, id));
    const [tournamentRows, events, standings, matches] = await db.batch([
      db
        .select()
        .from(extTournaments)
        .where(eq(extTournaments.id, id))
        .limit(1),
      db.select().from(extEvents).where(eq(extEvents.tournamentId, id)),
      db
        .select()
        .from(extStandings)
        .where(inArray(extStandings.eventId, childEventIds)),
      db
        .select()
        .from(extMatches)
        .where(inArray(extMatches.eventId, childEventIds)),
    ]);
    const t = tournamentRows[0];
    if (!t) return null;

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

    // The bracket/sets, grouped per event, soonest-scheduled first (undated
    // last). This is what the branded detail view renders as progression.
    const matchesByEvent = new Map<string, ExternalTournamentMatch[]>();
    for (const m of matches) {
      const list = matchesByEvent.get(m.eventId) ?? [];
      list.push({
        id: m.id,
        scheduledAt: m.scheduledAt,
        state: m.state,
        round: m.round,
        entrant1Name: m.entrant1Name,
        entrant2Name: m.entrant2Name,
        url: m.url,
      });
      matchesByEvent.set(m.eventId, list);
    }
    for (const list of matchesByEvent.values()) {
      list.sort(
        (a, b) =>
          (a.scheduledAt?.getTime() ?? Infinity) -
          (b.scheduledAt?.getTime() ?? Infinity),
      );
    }

    return {
      id: t.id,
      source: t.source,
      name: t.name,
      slug: t.slug,
      game: t.game,
      status: deriveStatus(
        t.startAt,
        t.endAt,
        events.map((event) => event.state),
        t.updatedAt,
      ),
      startAt: t.startAt,
      endAt: t.endAt,
      numAttendees: t.numAttendees,
      city: t.city,
      country: t.country,
      url: t.url,
      bannerUrl: t.bannerUrl,
      description: t.description,
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        state: e.state,
        numEntrants: e.numEntrants,
        standings: byEvent.get(e.id) ?? [],
        matches: matchesByEvent.get(e.id) ?? [],
      })),
    };
  } catch (error) {
    console.error("getExternalTournament failed:", error);
    return null;
  }
}
