import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ===========================================================================
// cen-sql — the external-tournaments projection (a SECOND D1 database).
//
// This is deliberately a separate database from website-sql (the member/
// identity core), bound to the Commons Worker read-only as CEN_DB. It holds a
// lean, display-oriented FLATTENING of the scraper's normalized store
// (`cen-news-notifications`, which walks start.gg + FACEIT). The Commons never
// writes it — the scraper (or the one-time import) is the only writer — and
// reads degrade to "no external tournaments" when the binding is absent, so a
// missing/empty cen-sql never breaks the Tournaments tab.
//
// Why a projection and not the full normalized schema: the Commons only needs
// enough to render tournaments in the unified Tournaments tab (list + a
// standings/results view). The rich lineage (organizers, players, entrant
// rosters, poll_runs/entity_changes) stays in the scraper's own store. Keeping
// this thin means the import is simple and the read queries are flat.
//
// Ids are deterministic (`${source}:${source_id}`) so a re-import upserts in
// place rather than duplicating. There are no foreign-key constraints across to
// website-sql — the two databases are joined only in application code (D1 can't
// JOIN across bindings), by external id, exactly like the bot's Sheets↔D1 split.
// ===========================================================================

/** One external tournament (a start.gg tournament or a FACEIT championship). */
export const extTournaments = sqliteTable(
  "ext_tournaments",
  {
    // `${source}:${sourceTournamentId}` — deterministic, so imports upsert.
    id: text("id").primaryKey(),
    source: text("source").notNull(), // 'startgg' | 'faceit'
    sourceTournamentId: text("source_tournament_id").notNull(),
    name: text("name").notNull(),
    slug: text("slug"),
    // Canonical game name (resolved from the scraper's canonical_games).
    game: text("game"),
    // Epoch ms (the scraper stores 'YYYY.MM.DD HH:MM' UTC; the import parses it).
    startAt: integer("start_at", { mode: "timestamp_ms" }),
    endAt: integer("end_at", { mode: "timestamp_ms" }),
    numAttendees: integer("num_attendees"),
    city: text("city"),
    country: text("country"),
    // Deep link to the tournament on its native site (start.gg / FACEIT).
    url: text("url"),
    // Cover/banner artwork for the branded tile + detail hero (FACEIT
    // cover_image, start.gg banner image); null when the provider ships none.
    bannerUrl: text("banner_url"),
    // Provider-authored blurb (FACEIT championship description). start.gg has
    // no standard description field, so it stays null there.
    description: text("description"),
    // When this row was last written by the import/scraper.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("ext_tournaments_start_at_idx").on(t.startAt),
    uniqueIndex("ext_tournaments_source_unique").on(
      t.source,
      t.sourceTournamentId,
    ),
  ],
);

/** An event within a tournament (a bracket/phase — e.g. "Overwatch 5v5"). */
export const extEvents = sqliteTable(
  "ext_events",
  {
    id: text("id").primaryKey(), // `${tournamentId}:${sourceEventId}`
    tournamentId: text("tournament_id").notNull(),
    sourceEventId: text("source_event_id").notNull(),
    name: text("name"),
    // Provider-reported state (e.g. start.gg's ACTIVE/COMPLETED); free text.
    state: text("state"),
    numEntrants: integer("num_entrants"),
  },
  (t) => [index("ext_events_tournament_idx").on(t.tournamentId)],
);

/** A provider match/set within an external event, used by /schedule's calendar. */
export const extMatches = sqliteTable(
  "ext_matches",
  {
    id: text("id").primaryKey(), // `${eventId}:${sourceMatchId}`
    eventId: text("event_id").notNull(),
    sourceMatchId: text("source_match_id").notNull(),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
    state: text("state"),
    round: text("round"),
    entrant1Name: text("entrant_1_name"),
    entrant2Name: text("entrant_2_name"),
    url: text("url"),
  },
  (t) => [
    index("ext_matches_event_idx").on(t.eventId),
    index("ext_matches_scheduled_at_idx").on(t.scheduledAt),
  ],
);

/** A final placement in an event — the "results" the Commons view renders. */
export const extStandings = sqliteTable(
  "ext_standings",
  {
    id: text("id").primaryKey(), // `${eventId}:${entrantId}`
    eventId: text("event_id").notNull(),
    entrantName: text("entrant_name").notNull(),
    isTeam: integer("is_team", { mode: "boolean" }).notNull().default(true),
    placement: integer("placement"),
  },
  (t) => [index("ext_standings_event_idx").on(t.eventId)],
);
