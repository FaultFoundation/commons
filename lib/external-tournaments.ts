import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  max,
  min,
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
  /** Earliest scheduled match (round 1), when the projection has match times —
      a more precise "starts" than the tournament-level startAt. Null otherwise. */
  firstMatchAt: Date | null;
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
    const firstMatchByTournament = new Map<string, Date | null>();
    try {
      const matchRows = rows.length
        ? await db
            .select({
              tournamentId: extEvents.tournamentId,
              latestMatchAt: max(extMatches.scheduledAt),
              firstMatchAt: min(extMatches.scheduledAt),
            })
            .from(extMatches)
            .innerJoin(extEvents, eq(extEvents.id, extMatches.eventId))
            .groupBy(extEvents.tournamentId)
        : [];
      for (const match of matchRows) {
        latestMatchByTournament.set(match.tournamentId, match.latestMatchAt);
        firstMatchByTournament.set(match.tournamentId, match.firstMatchAt);
      }
    } catch {
      // Older cen-sql schema: start/end and event-state derivation still works.
    }
    return rows.map(({ updatedAt, ...r }) => ({
      ...r,
      firstMatchAt: firstMatchByTournament.get(r.id) ?? null,
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
  /** The provider's own match/set id — the node the feed graph references. */
  sourceMatchId: string;
  scheduledAt: Date | null;
  state: string | null;
  /** Display round name ("Winners Round 1", "Grand Final", "Round 3"). */
  round: string | null;
  /** Signed round number: +winners / −losers; |value| is the column position. */
  roundOrder: number | null;
  /** Bracket position within the round (top-to-bottom), for column + connectors. */
  orderKey: string | null;
  entrant1Name: string | null;
  entrant2Name: string | null;
  entrant1Score: number | null;
  entrant2Score: number | null;
  /** 1 = entrant1 won, 2 = entrant2 won, null = undecided. */
  winner: 1 | 2 | null;
  /** sourceMatchId of the set feeding each slot — the true feed graph the view
      draws connectors from. Null for a seeded slot / a provider without one. */
  prereq1Id: string | null;
  prereq2Id: string | null;
  /** The phase (independent bracket) this match belongs to. A start.gg event can
      hold several — the view groups by `phaseId` (ordered by `phaseOrder`, titled
      `phaseName`) so each renders as its own bracket. Null → one bracket. */
  phaseId: string | null;
  phaseName: string | null;
  phaseOrder: number | null;
  /** The phase GROUP (pool) this match belongs to, one level below the phase. A
      single phase can hold several independent pool brackets (e.g. "A1".."A4"),
      all sharing one `phaseId` and identical round names; the view splits them
      into separate sub-brackets by `phaseGroupId` (labelled `phaseGroupName`,
      ordered by `phaseGroupOrder`) so their rounds don't mash into shared
      columns. Null for a single-pool phase and for FACEIT — the view then infers
      pools from the feed graph. */
  phaseGroupId: string | null;
  phaseGroupName: string | null;
  phaseGroupOrder: number | null;
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
  /** Provider-authored blurb — start.gg's About widgets or FACEIT description. */
  description: string | null;
  /** Organizer contact (a Discord/email/URL) + its type; null when unset. */
  contact: string | null;
  contactType: string | null;
  /** A "watch" link when the tournament has a live stream; null otherwise. */
  streamUrl: string | null;
  /** When registration/check-in closes; null when the provider omits it. */
  registrationClosesAt: Date | null;
  /** Prize pool as a display string; null when there's no structured prize. */
  prizePool: string | null;
  /** A promo/VOD video link (distinct from a live stream); null when none. */
  videoUrl: string | null;
  /** The organizer's display name + a link to them; null when unavailable. */
  organizer: string | null;
  organizerUrl: string | null;
  /** Social/external links (Facebook, Discord, org site…); empty when none. */
  links: { label: string; url: string }[];
  /** Extra graphics beyond the hero banner (schedules, sponsors); empty=none. */
  images: { url: string; caption: string | null }[];
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
 * Upcoming public events for the schedule's All Matches calendar.
 *
 * Two layers, MERGED (not either/or): the granular scheduled matches from
 * `ext_matches`, PLUS a single start-date entry for every upcoming tournament
 * that has no dated upcoming match yet. Without the second layer, a future
 * tournament (its bracket not generated, or its match times not set) vanished
 * from the calendar entirely the moment any *other* tournament had matches —
 * which is why the Tournaments tab could list events the Schedule never showed.
 * A tournament with dated matches shows those; one without shows on its start
 * date, so nothing on the Tournaments tab is missing here.
 */
export async function listUpcomingExternalScheduleEntries(): Promise<
  ScheduleEntry[]
> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const staleCutoff = new Date(Date.now() - STALE_TOURNAMENT_MS);

  const matchEntries: ScheduleEntry[] = [];
  // Tournaments that already have a match on the calendar — they don't also get a
  // start-date window entry (that would double them).
  const tournamentsWithMatch = new Set<string>();

  const db = getCenDb();
  if (db) {
    try {
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
          tournamentId: extTournaments.id,
          tournamentName: extTournaments.name,
          tournamentStartAt: extTournaments.startAt,
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

      for (const row of rows) {
        if (!isScheduleProvider(row.source)) continue;
        const state = externalMatchStatus(row.state);
        if (state === "finished" || state === "cancelled") continue;
        const matchup = [row.entrant1Name, row.entrant2Name]
          .filter(Boolean)
          .join(" vs ");
        const matchTime = row.scheduledAt?.getTime() ?? null;
        // Every match lands on the calendar: on its own time when it has one,
        // otherwise on its tournament's start day (a bracket set with no
        // scheduled time). `scheduledAt` still displays "Time TBD" for the
        // latter — only the calendar POSITION falls back.
        const dayAt = matchTime ?? row.tournamentStartAt?.getTime() ?? null;
        matchEntries.push({
          id: `public:${row.id}`,
          provider: row.source,
          title: matchup || row.tournamentName,
          opponent: null,
          round: [row.tournamentName, row.eventName, row.round]
            .filter(Boolean)
            .join(" · "),
          status: state,
          scheduledAt: matchTime,
          dayAt,
          url: row.matchUrl ?? row.tournamentUrl,
          href: null,
          // Collapse every match of one tournament into a single calendar chip
          // (a bracket day otherwise floods the cell); the popup expands them.
          groupKey: `${row.source}:${row.tournamentName}`,
          groupTitle: row.tournamentName,
        });
        tournamentsWithMatch.add(row.tournamentId);
      }
    } catch (error) {
      console.error("listUpcomingExternalScheduleEntries matches failed:", error);
    }
  }

  // Start-date entry ONLY for upcoming tournaments that have no match at all yet
  // (bracket not generated / not scraped), so the calendar still mirrors the
  // Tournaments tab. Tournaments with matches show those matches instead.
  const tournaments = await listExternalTournaments();
  const windowEntries = tournaments.flatMap((tournament): ScheduleEntry[] => {
    if (!isScheduleProvider(tournament.source)) return [];
    if (tournament.status === "completed") return [];
    if (tournamentsWithMatch.has(tournament.id)) return [];
    const start = tournament.firstMatchAt ?? tournament.startAt;
    if (!start || start.getTime() < today.getTime()) return [];
    return [
      {
        id: `public:${tournament.id}`,
        provider: tournament.source,
        title: tournament.name,
        opponent: null,
        round: tournament.game,
        status: tournament.status === "active" ? "live" : "scheduled",
        scheduledAt: start.getTime(),
        dayAt: start.getTime(),
        url: tournament.url,
        href: null,
        groupKey: `${tournament.source}:${tournament.name}`,
        groupTitle: tournament.name,
      },
    ];
  });

  return [...matchEntries, ...windowEntries].sort(
    (a, b) =>
      (a.dayAt ?? a.scheduledAt ?? Infinity) -
      (b.dayAt ?? b.scheduledAt ?? Infinity),
  );
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

/** Coerce a projection value that *should* be a number to one, or null. D1
    columns are dynamically typed and the projection can be (re)loaded by tools
    other than the scraper — a CSV/export round-trip can leave a numeric column
    holding a string, or even the column NAME from a header row. Reading those
    verbatim leaked "entrant_1_score" into the bracket and broke round grouping
    (`Math.abs("round_order")` → NaN), so every numeric field is funneled through
    here: real ints pass, numeric strings parse, anything else becomes null. */
function toNum(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Parse a `links_json` column into `{label,url}[]`, tolerating null/junk (D1 is
    dynamically typed and the projection can be reloaded by other tools). Only
    entries with a safe http(s) URL and a label survive. */
function parseLinkList(value: unknown): { label: string; url: string }[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): { label: string; url: string }[] => {
      const label = typeof entry?.label === "string" ? entry.label.trim() : "";
      const url = typeof entry?.url === "string" ? entry.url.trim() : "";
      if (!label || !/^https?:\/\//i.test(url)) return [];
      return [{ label, url }];
    });
  } catch {
    return [];
  }
}

/** Parse an `images_json` column into `{url,caption}[]`, tolerating null/junk;
    only entries with a safe http(s) image URL survive. */
function parseImageList(value: unknown): { url: string; caption: string | null }[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): { url: string; caption: string | null }[] => {
      const url = typeof entry?.url === "string" ? entry.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) return [];
      const caption =
        typeof entry?.caption === "string" && entry.caption.trim()
          ? entry.caption.trim()
          : null;
      return [{ url, caption }];
    });
  } catch {
    return [];
  }
}

/** Natural order for start.gg set identifiers ("A".."Z".."AA".."AB"): shorter
    first, then lexical, so "B" sorts before "AA". */
function compareOrderKeys(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** Deterministic bracket order: column (|roundOrder|), then top-to-bottom
    position (orderKey), then scheduled time and id as tie-breakers. */
function compareMatches(
  a: ExternalTournamentMatch,
  b: ExternalTournamentMatch,
): number {
  const ao = a.roundOrder == null ? Infinity : Math.abs(a.roundOrder);
  const bo = b.roundOrder == null ? Infinity : Math.abs(b.roundOrder);
  if (ao !== bo) return ao - bo;
  const byKey = compareOrderKeys(a.orderKey, b.orderKey);
  if (byKey !== 0) return byKey;
  const at = a.scheduledAt?.getTime() ?? Infinity;
  const bt = b.scheduledAt?.getTime() ?? Infinity;
  if (at !== bt) return at - bt;
  return a.id.localeCompare(b.id);
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

    // The bracket/sets, grouped per event. Ordered by column (|roundOrder|) then
    // top-to-bottom bracket position (orderKey), so the branded view lays out
    // proper columns and can draw feed-forward connectors; scheduledAt/id break
    // ties for providers that give no ordering keys. D1 returns rows unordered,
    // so this base sort must be deterministic.
    const matchesByEvent = new Map<string, ExternalTournamentMatch[]>();
    for (const m of matches) {
      const list = matchesByEvent.get(m.eventId) ?? [];
      list.push({
        id: m.id,
        sourceMatchId: m.sourceMatchId,
        scheduledAt: m.scheduledAt,
        state: m.state,
        round: m.round,
        roundOrder: toNum(m.roundOrder),
        orderKey: m.orderKey,
        entrant1Name: m.entrant1Name,
        entrant2Name: m.entrant2Name,
        entrant1Score: toNum(m.entrant1Score),
        entrant2Score: toNum(m.entrant2Score),
        winner: (toNum(m.winner) === 1 ? 1 : toNum(m.winner) === 2 ? 2 : null),
        prereq1Id: m.prereq1Id,
        prereq2Id: m.prereq2Id,
        phaseId: m.phaseId,
        phaseName: m.phaseName,
        phaseOrder: toNum(m.phaseOrder),
        phaseGroupId: m.phaseGroupId,
        phaseGroupName: m.phaseGroupName,
        phaseGroupOrder: toNum(m.phaseGroupOrder),
        url: m.url,
      });
      matchesByEvent.set(m.eventId, list);
    }
    for (const list of matchesByEvent.values()) list.sort(compareMatches);

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
      contact: t.contact,
      contactType: t.contactType,
      streamUrl: t.streamUrl,
      registrationClosesAt: t.registrationClosesAt,
      prizePool: t.prizePool,
      videoUrl: t.videoUrl,
      organizer: t.organizer,
      organizerUrl: t.organizerUrl,
      links: parseLinkList(t.links),
      images: parseImageList(t.images),
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
