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
// Ids are deterministic so a re-import upserts in place rather than duplicating.
// FACEIT/Discord rows are `${source}:${source_id}`; a start.gg tournament runs
// several games as sibling events and projects to one row PER GAME
// (`startgg:${source_id}:g${videogameId}`), all sharing one source_tournament_id
// so the Commons can regroup a tournament's games into one series. There are no
// foreign-key constraints across to
// website-sql — the two databases are joined only in application code (D1 can't
// JOIN across bindings), by external id, exactly like the bot's Sheets↔D1 split.
// ===========================================================================

/** Compact school-name lookup used by the scraper to replace provider defaults. */
export const schoolFavicons = sqliteTable(
  "school_favicons",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain").notNull(),
    faviconUrl: text("favicon_url").notNull(),
  },
  (t) => [index("school_favicons_normalized_name_idx").on(t.normalizedName)],
);

/** One external tournament — for start.gg, one row per GAME within a tournament
    (a tournament runs several games as sibling events); for FACEIT, one
    championship (single-game). */
export const extTournaments = sqliteTable(
  "ext_tournaments",
  {
    // Deterministic, so imports upsert. FACEIT: `${source}:${sourceTournamentId}`.
    // start.gg: `${source}:${sourceTournamentId}:g${videogameId}` (per game).
    id: text("id").primaryKey(),
    source: text("source").notNull(), // 'startgg' | 'faceit'
    // The provider tournament id — SHARED across a start.gg tournament's per-game
    // rows, so `${source}:${sourceTournamentId}` regroups them into one series.
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
    // Provider-authored blurb. FACEIT: the championship description. start.gg:
    // the concatenated Markdown widgets from the tournament's Details tab (its
    // real "About" — pulled from the internal widget API, since the public API
    // exposes no about field), else the `rules` link.
    description: text("description"),
    // Organizer contact surfaced on the tournament page — start.gg's
    // `primaryContact` (a Discord invite, email, Twitter, or URL) with its
    // `primaryContactType` (`discord`/`email`/`twitter`/…). Null for FACEIT
    // (no contact field) and when the organizer set none.
    contact: text("contact"),
    contactType: text("contact_type"),
    // A "watch" link when the tournament has a live stream — start.gg's first
    // `streams` entry (built from source+channel, e.g. twitch.tv/<name>); FACEIT's
    // `stream.source` when its stream is active. Null when there's no stream.
    streamUrl: text("stream_url"),
    // When registration/check-in closes — start.gg `registrationClosesAt`,
    // FACEIT `subscription_end`. Epoch ms. Null when the provider omits it.
    registrationClosesAt: integer("registration_closes_at", {
      mode: "timestamp_ms",
    }),
    // Prize pool as a display string — FACEIT `total_prizes` ("10,000 FACEIT
    // Points"), start.gg's event `payoutTotal` + currency when cash prizing is
    // enabled (start.gg usually keeps its prize breakdown in the About markdown,
    // so this is often null there). Null when there's no structured prize.
    prizePool: text("prize_pool"),
    // A promo/VOD video link — start.gg's Details-tab VideoWidget (YouTube/Twitch/
    // Drive). Distinct from `stream_url` (a live stream). Null when none.
    videoUrl: text("video_url"),
    // The organizer — start.gg tournament `owner` (name + a `/user/<slug>` link),
    // FACEIT the championship's organizer (name + FACEIT organizer page). Shown as
    // "Organized by". Null when unavailable.
    organizer: text("organizer"),
    organizerUrl: text("organizer_url"),
    // Social / external links as a JSON array of `{label,url}` — start.gg
    // tournament `links` (Facebook/Discord), FACEIT the organizer's
    // website/twitter/youtube/twitch/facebook. "[]" / null when none; the reader
    // parses it defensively.
    links: text("links_json"),
    // Extra graphics as a JSON array of `{url,caption}` — start.gg's Details-tab
    // ImageWidgets (schedules, sponsor art). Separate from the hero `banner_url`.
    // "[]" / null when none.
    images: text("images_json"),
    // The full start.gg About-tab layout, JSON `[{columns:[[widget,…],…]}]` — rows
    // preserving the source's 1–3 column split, each widget `{type:"md",content}`
    // / `{type:"img",url,caption}` / `{type:"vid",url}`. Lets the branded view
    // mimic start.gg's own layout instead of flattening to one column; the
    // markdown widgets carry inline HTML the renderer folds in. Null for FACEIT
    // and start.gg tournaments with no widget content.
    aboutLayout: text("about_layout"),
    // When this row was last written by the import/scraper.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("ext_tournaments_start_at_idx").on(t.startAt),
    // Unique per (source, source_tournament_id, GAME): a start.gg tournament runs
    // several games as sibling events, and the scraper projects one row PER GAME
    // (id `startgg:<tournamentId>:g<videogameId>`), all sharing one
    // source_tournament_id so the Commons can regroup them into a series. The
    // game is what keeps those rows distinct here. (Scraper migration 0016.)
    uniqueIndex("ext_tournaments_source_unique").on(
      t.source,
      t.sourceTournamentId,
      t.game,
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
    phases: text("phases_json"),
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
    // Display round name ("Winners Round 1", "Grand Final", "Round 3").
    round: text("round"),
    // Signed round number for bracket column ordering + winners/losers split
    // (start.gg's `round`: +winners/−losers; FACEIT's numeric round). Column
    // position = |roundOrder|.
    roundOrder: integer("round_order"),
    // Bracket position within a round, top-to-bottom (start.gg set identifier);
    // drives column layout and feed-forward connectors. Null when unavailable.
    orderKey: text("order_key"),
    entrant1Name: text("entrant_1_name"),
    entrant2Name: text("entrant_2_name"),
    entrant1LogoUrl: text("entrant_1_logo_url"),
    entrant2LogoUrl: text("entrant_2_logo_url"),
    entrant1SchoolName: text("entrant_1_school_name"),
    entrant1SchoolDomain: text("entrant_1_school_domain"),
    entrant2SchoolName: text("entrant_2_school_name"),
    entrant2SchoolDomain: text("entrant_2_school_domain"),
    // Per-side score; negative = forfeit/DQ side, null = not played.
    entrant1Score: integer("entrant_1_score"),
    entrant2Score: integer("entrant_2_score"),
    // Winning side: 1 = entrant1, 2 = entrant2, null = undecided.
    winner: integer("winner"),
    // The source match id feeding each slot (the true feed graph, from start.gg
    // prereqId) — the branded bracket draws exact connectors from these. Null
    // for a seeded slot or a provider without feed structure (FACEIT).
    prereq1Id: text("prereq_1_id"),
    prereq2Id: text("prereq_2_id"),
    // The phase this match belongs to (start.gg phaseGroup.phase). A start.gg
    // event can hold SEVERAL independent brackets/phases ("Round 1 Bracket" +
    // "Round 2 Bracket"); without this the branded view mashed them into one
    // jumbled column set. The view groups matches by `phaseId` (ordered by
    // `phaseOrder`, titled `phaseName`) and lays each out as its own bracket.
    // Null for single-phase events and FACEIT (no phases) → renders as one.
    phaseId: text("phase_id"),
    phaseName: text("phase_name"),
    phaseOrder: integer("phase_order"),
    // The phase GROUP (pool) this match belongs to (start.gg phaseGroup) — one
    // level below the phase. A single phase can run SEVERAL independent pool
    // brackets ("A1".."A4"): they share one `phaseId` and identical round names,
    // so without this the branded view stacked all four pools into shared
    // columns and drew connectors crossing between unrelated brackets. The view
    // splits a phase into pools by `phaseGroupId` (labelled `phaseGroupName` —
    // the provider's "A1"; ordered by `phaseGroupOrder`), each its own tabbed
    // sub-bracket. Null for a single-pool phase and FACEIT → the view then infers
    // pools from the feed graph (prereq components), so old rows still split.
    phaseGroupId: text("phase_group_id"),
    phaseGroupName: text("phase_group_name"),
    phaseGroupOrder: integer("phase_group_order"),
    bracketType: text("bracket_type"),
    url: text("url"),
  },
  (t) => [
    index("ext_matches_event_idx").on(t.eventId),
    index("ext_matches_scheduled_at_idx").on(t.scheduledAt),
  ],
);

/** A registered entrant or final placement in an event. */
export const extStandings = sqliteTable(
  "ext_standings",
  {
    id: text("id").primaryKey(), // `${eventId}:${entrantId}`
    eventId: text("event_id").notNull(),
    entrantName: text("entrant_name").notNull(),
    entrantLogoUrl: text("entrant_logo_url"),
    entrantSchoolName: text("entrant_school_name"),
    entrantSchoolDomain: text("entrant_school_domain"),
    isTeam: integer("is_team", { mode: "boolean" }).notNull().default(true),
    placement: integer("placement"),
  },
  (t) => [index("ext_standings_event_idx").on(t.eventId)],
);


// Discord ingestion is migrated by cen-news-notifications/migrations/0015.
// These declarations mirror its reader-facing state; Commons does not write it.
export const discordEntities = sqliteTable("discord_entities", {
  id: text("id").primaryKey(),
  identityKey: text("identity_key").notNull(),
  tournamentId: text("tournament_id").notNull(),
  sourceChannelId: text("source_channel_id").notNull(),
  dataJson: text("data_json").notNull(),
  fieldTimesJson: text("field_times_json").notNull(),
  lockedAt: integer("locked_at"),
  lastMessageId: text("last_message_id").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const discordMessages = sqliteTable("discord_messages", {
  id: text("id").primaryKey(), channelId: text("channel_id").notNull(),
  sourceChannelId: text("source_channel_id").notNull(), sourceMessageId: text("source_message_id").notNull(),
  sourceGuildId: text("source_guild_id"), forwardedBy: text("forwarded_by").notNull(),
  postedAt: integer("posted_at").notNull(), capturedAt: integer("captured_at").notNull(),
  payloadJson: text("payload_json").notNull(), captureHash: text("capture_hash"), duplicateOf: text("duplicate_of"),
  documentText: text("document_text"), status: text("status").notNull(), attempts: integer("attempts").notNull(),
  leaseUntil: integer("lease_until").notNull(), error: text("error"), extractionJson: text("extraction_json"),
  targetOverride: text("target_override"), updatedAt: integer("updated_at").notNull(),
});
