import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

// ===========================================================================
// faceit_* — the FACEIT match-search cache (Overwatch), READ from the Commons.
//
// ⚠️ This is a COLUMN-COMPATIBLE TYPING MIRROR, not the source of truth. Unlike
// db/ow-schema.ts (which the Commons OWNS and migrates via drizzle.ow.config.ts),
// the `faceit_*` tables live in the same `ow-player-data` D1 but are OWNED by the
// separate `ow-data` Worker repo (`src/faceit-schema.ts` there + its
// `drizzle-faceit/` migrations, tracked in a separate `d1_migrations_faceit`
// table). This file exists ONLY so the Commons can type its reads of those rows,
// and is deliberately kept OUT of drizzle.ow.config.ts (which globs the single
// file `./db/ow-schema.ts`) so `npm run db:ow:*` never tries to migrate it.
//
// The contract, mirrored from the ow-data README: if a column is added/renamed
// in the ow-data repo's faceit-schema.ts, mirror it HERE — never generate a
// migration for these tables on the Commons side.
//
// The subsystem: a search-driven cache keyed by FACEIT identity (any player, not
// a linked member — the Scouting tab looks up opponents). The Commons search box
// triggers a collection on the ow-data Worker (POST /faceit/search) and then
// reads these rows directly for display (lib/faceit-scouting.ts). See the Scouting
// section of CLAUDE.md and the ow-data README for the full picture.
// ===========================================================================

/**
 * One row per FACEIT player we've encountered. A SEARCHED player carries a
 * search_mode + poll_chunk + collection state; an opponent merely SEEN while
 * collecting someone else is seeded here too (identity only, null search_mode).
 */
export const faceitPlayers = sqliteTable(
  "faceit_players",
  {
    playerId: text("player_id").primaryKey(),
    nickname: text("nickname").notNull(),
    avatarUrl: text("avatar_url"),
    country: text("country"),
    game: text("game").notNull().default("ow2"),
    gamePlayerId: text("game_player_id"),
    gamePlayerName: text("game_player_name"),
    skillLevel: integer("skill_level"),
    faceitElo: integer("faceit_elo"),
    region: text("region"),
    faceitUrl: text("faceit_url"),
    verified: integer("verified", { mode: "boolean" }),
    activatedAt: integer("activated_at", { mode: "timestamp_ms" }),

    // --- collection state (searched players only) --------------------------
    searchMode: text("search_mode"),
    pollChunk: integer("poll_chunk"),
    listOffset: integer("list_offset").notNull().default(0),
    listDone: integer("list_done", { mode: "boolean" }).notNull().default(false),
    detailDone: integer("detail_done", { mode: "boolean" }).notNull().default(false),
    /** 'collecting' | 'ready' | 'not_found' | 'error' | null (never searched). */
    status: text("status"),
    statusDetail: text("status_detail"),
    matchCount: integer("match_count").notNull().default(0),
    firstSearchedAt: integer("first_searched_at", { mode: "timestamp_ms" }),
    lastSearchedAt: integer("last_searched_at", { mode: "timestamp_ms" }),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("faceit_players_nickname_idx").on(t.nickname),
    index("faceit_players_chunk_idx").on(t.pollChunk),
    index("faceit_players_last_synced_idx").on(t.lastSyncedAt),
  ],
);

/**
 * One row per match, shared across every player in it (deduped by match id). The
 * summary columns land during the LIST phase; the overview columns (server, map,
 * hero bans, replay codes) land when the DETAIL phase parses `/matches/{id}`.
 */
export const faceitMatches = sqliteTable(
  "faceit_matches",
  {
    matchId: text("match_id").primaryKey(),
    game: text("game"),
    region: text("region"),
    competitionId: text("competition_id"),
    competitionName: text("competition_name"),
    competitionType: text("competition_type"),
    organizerId: text("organizer_id"),
    gameMode: text("game_mode"),
    matchType: text("match_type"),
    bestOf: integer("best_of"),
    round: integer("round"),
    groupNum: integer("group_num"),
    status: text("status").notNull().default("finished"),
    /** Winning faction key ('faction1' | 'faction2'), when known. */
    winnerFaction: text("winner_faction"),
    /** Per-faction summary: { faction1: { teamId, nickname, avatar, score }, … }. */
    factionsJson: text("factions_json"),

    // --- overview (`/matches/{id}`) — server / map / bans / replay ----------
    locationId: text("location_id"),
    serverName: text("server_name"),
    mapId: text("map_id"),
    mapName: text("map_name"),
    mapMode: text("map_mode"),
    heroBansJson: text("hero_bans_json"),
    votingJson: text("voting_json"),
    votingSyncedAt: integer("voting_synced_at", { mode: "timestamp_ms" }),
    replayCodesJson: text("replay_codes_json"),
    attackingFirst: text("attacking_first"),

    configuredAt: integer("configured_at", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    faceitUrl: text("faceit_url"),

    detailSyncedAt: integer("detail_synced_at", { mode: "timestamp_ms" }),
    statsSyncedAt: integer("stats_synced_at", { mode: "timestamp_ms" }),
    /** When this match's per-map `faceit_match_rounds` rows were written. Null
     *  on every match collected before rounds existed, which is what drives the
     *  Worker's one-off backfill through them. */
    roundsSyncedAt: integer("rounds_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("faceit_matches_started_idx").on(t.startedAt),
    index("faceit_matches_detail_synced_idx").on(t.detailSyncedAt),
    index("faceit_matches_stats_synced_idx").on(t.statsSyncedAt),
    index("faceit_matches_rounds_synced_idx").on(t.roundsSyncedAt),
    index("faceit_matches_competition_idx").on(t.competitionId),
  ],
);

/**
 * One row per MAP played inside a match — the unit a scouting map aggregate
 * counts, and the unit FACEIT's own profile counts.
 *
 * An Overwatch FACEIT match is a Bo3/Bo5 SERIES: `faceit_matches.map_name` only
 * ever holds the first map of the veto, so reading map win rates off it showed
 * mostly Control (map 1 in the OW competitive format) and dropped the rest of
 * every series. These rows come from the per-round stats the Worker parses; each
 * carries the team id that won that map, which joins to
 * `faceit_match_players.team_id` to give a player's per-map record.
 */
export const faceitMatchRounds = sqliteTable(
  "faceit_match_rounds",
  {
    /** Deterministic `${matchId}:${roundIndex}`. */
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull(),
    /** 1-based position in the series (the order the maps were played). */
    roundIndex: integer("round_index").notNull(),
    mapId: text("map_id"),
    mapName: text("map_name"),
    mapMode: text("map_mode"),
    /** Team/faction id that won this map; null = undecided. */
    winnerTeamId: text("winner_team_id"),
    /** The map's own scoreline as FACEIT words it ("2 / 1"). */
    scoreSummary: text("score_summary"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("faceit_match_rounds_match_idx").on(t.matchId),
    index("faceit_match_rounds_map_idx").on(t.mapName),
  ],
);

/**
 * One row per (match, player) — the scoreboard. Every player in a match gets a
 * row, so opponents are captured with no separate handling. The list phase fills
 * identity + faction + result; the stats phase fills the scoreboard scalars and
 * the full `stats_json` blob.
 */
export const faceitMatchPlayers = sqliteTable(
  "faceit_match_players",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id").notNull(),
    playerId: text("player_id").notNull(),
    nickname: text("nickname"),
    avatarUrl: text("avatar_url"),
    faction: text("faction"),
    teamId: text("team_id"),
    gamePlayerId: text("game_player_id"),
    gamePlayerName: text("game_player_name"),
    gameSkillLevel: integer("game_skill_level"),
    membership: text("membership"),
    /** 'win' | 'loss' | 'draw' — from the winning faction (known at list time). */
    result: text("result"),

    // --- scoreboard (`/matches/{id}/stats`) — headline scalars -------------
    role: text("role"),
    eliminations: integer("eliminations"),
    deaths: integer("deaths"),
    assists: integer("assists"),
    kdRatio: real("kd_ratio"),
    damageDealt: integer("damage_dealt"),
    healingDone: integer("healing_done"),
    damageMitigated: integer("damage_mitigated"),
    finalBlows: integer("final_blows"),
    soloKills: integer("solo_kills"),
    objectiveTime: integer("objective_time"),
    timePlayed: integer("time_played"),
    statsJson: text("stats_json"),
    statsSyncedAt: integer("stats_synced_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("faceit_match_players_match_idx").on(t.matchId),
    index("faceit_match_players_player_idx").on(t.playerId),
  ],
);

/** Team search state. History membership comes exclusively from the team stats feed. */
export const faceitScoutTeams = sqliteTable("faceit_scout_teams", {
  teamId: text("team_id").primaryKey(),
  name: text("name").notNull(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url"),
  rosterJson: text("roster_json").notNull(),
  searchMode: text("search_mode").notNull(),
  listPage: integer("list_page").notNull().default(0),
  listDone: integer("list_done", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const faceitScoutTeamMatches = sqliteTable("faceit_scout_team_matches", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull(),
  matchId: text("match_id").notNull(),
}, (t) => [index("faceit_scout_team_matches_team_idx").on(t.teamId)]);
