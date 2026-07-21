import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ===========================================================================
// LAYER 0 — Identity core (Better Auth owns these shapes)
//
// email/password + Discord OAuth. The drizzle adapter resolves models by these
// export names (user/session/account/verification). This is the stable anchor:
// adding a new program never touches these tables — new programs hang off
// `user.id` via their own satellite tables (see LAYER 5).
// ===========================================================================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    // Provider-side account id; for providerId "discord" this is the
    // user's Discord ID (mirrored into platform_identities).
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    // Hashed password for the credential ("email/password") provider.
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ===========================================================================
// LAYER 5 registry — Games + Programs
//
// A "program" is an initiative a member can belong to (e.g. the collegiate
// Overwatch community). Kept small on purpose: program-specific data lives in
// that program's own table (see collegiate_registrations). Seeded ids are
// stable slugs (see lib/programs.ts + db/seed/bootstrap.sql).
// ===========================================================================

export const games = sqliteTable("games", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const programs = sqliteTable("programs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  gameId: text("game_id").references(() => games.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ===========================================================================
// LAYER 6 — Colleges (stable, FK-able)
//
// `schools` (below) stays a wholesale-reseeded directory nothing may FK to;
// `colleges` holds only the schools we actually reference, created on demand
// (getOrCreateCollege) so FK targets survive a schools reseed. Keyed by
// primary_domain so re-affiliating the same school reuses the row.
// ===========================================================================

export const colleges = sqliteTable("colleges", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country"),
  alphaTwoCode: text("alpha_two_code"),
  stateProvince: text("state_province"),
  primaryDomain: text("primary_domain").unique(),
  // JSON string arrays (mirrors the schools dataset shape).
  domains: text("domains"),
  webPages: text("web_pages"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ===========================================================================
// LAYER 1 — Person profile (slim, cross-program)
//
// Only what's true about a person across ALL programs. Everything program- or
// platform-specific moved out to its own table. 1:1 with `user`, created lazily
// (first registration), so this row may not exist yet.
// ===========================================================================

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  country: text("country"),
  ageRange: text("age_range"),
  dmPreference: text("dm_preference"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ===========================================================================
// LAYER 2 — Platform identities (program-agnostic; extend by row, not column)
//
// Replaces profiles.discord_id / discord_username / battle_tag /
// steam_friend_code. A new platform (Riot, etc.) is a new `provider` value —
// never a schema change. Discord also lives in Better Auth `account`; mirrored
// here for uniform querying + the future Discord-bot join.
//   provider "discord"  -> external_id = Discord ID, handle = username
//   provider "battlenet"-> external_id = Blizzard account id, handle = BattleTag
//   provider "steam"    -> handle = friend code (no external id)
// ===========================================================================

export const platformIdentities = sqliteTable(
  "platform_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id"),
    handle: text("handle"),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    connectedAt: integer("connected_at", { mode: "timestamp_ms" }),
    // Last time the provider profile was successfully re-read (or the attempt
    // was given up on) — distinct from updated_at, which any write bumps. Sole
    // input to the handle-staleness gate in refreshDiscordIdentity.
    refreshedAt: integer("refreshed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("platform_identities_user_id_idx").on(t.userId),
    // One identity per platform per user.
    uniqueIndex("platform_identities_user_provider_unique").on(
      t.userId,
      t.provider,
    ),
    // A given external account (e.g. a Discord ID, a Blizzard account id) links
    // to one user only. external_id NULL rows (steam) don't collide — SQLite
    // treats NULLs as distinct.
    uniqueIndex("platform_identities_provider_external_unique").on(
      t.provider,
      t.externalId,
    ),
  ],
);

// ===========================================================================
// LAYER 3 — Staff roles (program-agnostic; "extra website access")
//
// program_id NULL = site-wide grant; set = scoped to that program.
// ===========================================================================

export const staffRoles = sqliteTable(
  "staff_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // owner | admin | moderator | tournament_admin
    programId: text("program_id").references(() => programs.id),
    grantedBy: text("granted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    grantedAt: integer("granted_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("staff_roles_user_id_idx").on(t.userId),
    uniqueIndex("staff_roles_user_role_program_unique").on(
      t.userId,
      t.role,
      t.programId,
    ),
  ],
);

// ===========================================================================
// LAYER 4 — Moderation (program-agnostic, append-only history)
//
// Replaces profiles.kicked_at / banned_at / notes. subject_* are denormalized
// so a ban record keeps its anti-abuse keys after the user row is deleted
// (user_id then goes NULL).
// ===========================================================================

export const moderationActions = sqliteTable(
  "moderation_actions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    programId: text("program_id").references(() => programs.id),
    action: text("action").notNull(), // note | warn | kick | ban
    reason: text("reason"),
    notes: text("notes"),
    subjectDiscordId: text("subject_discord_id"),
    subjectEmail: text("subject_email"),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("moderation_actions_user_id_idx").on(t.userId),
    index("moderation_actions_subject_discord_id_idx").on(t.subjectDiscordId),
  ],
);

// ===========================================================================
// LAYER 5 — Program memberships + collegiate detail
//
// program_memberships is the GENERIC join (a user in a program, with a status).
// Program-specific fields live in a sibling detail table — the extension
// pattern: a future program adds a `programs` row + its own `<x>_details`
// table FK'd to program_memberships. Nothing above this line changes.
// ===========================================================================

export const programMemberships = sqliteTable(
  "program_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    // EMAIL_SENT | MANUAL_REVIEW | VERIFIED | INELIGIBLE (see registration-shared)
    status: text("status"),
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("program_memberships_user_program_unique").on(
      t.userId,
      t.programId,
    ),
    index("program_memberships_program_status_idx").on(t.programId, t.status),
  ],
);

export const collegiateRegistrations = sqliteTable(
  "collegiate_registrations",
  {
    id: text("id").primaryKey(),
    membershipId: text("membership_id")
      .notNull()
      .unique()
      .references(() => programMemberships.id, { onDelete: "cascade" }),
    collegeId: text("college_id").references(() => colleges.id),
    userType: text("user_type"),
    schoolEmail: text("school_email"),
    graduationDate: text("graduation_date"),
    // Whether the academic email's domain matched a domain the school is known
    // by, recorded at submission. NULL on rows written before this shipped.
    // Not a gate — everyone gets a code either way; the admin layer reviews
    // the `false` rows retroactively.
    domainMatched: integer("domain_matched", { mode: "boolean" }),
    // "None of the above" path only.
    referrer: text("referrer"),
    circumstances: text("circumstances"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("collegiate_registrations_school_email_idx").on(t.schoolEmail),
    index("collegiate_registrations_college_id_idx").on(t.collegeId),
  ],
);

// ===========================================================================
// LAYER 7 — Teams & rosters (college-affiliated or ad-hoc)
// ===========================================================================

export const teams = sqliteTable(
  "teams",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    gameId: text("game_id").references(() => games.id),
    collegeId: text("college_id").references(() => colleges.id),
    name: text("name").notNull(),
    tag: text("tag"),
    captainUserId: text("captain_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("teams_program_id_idx").on(t.programId),
    index("teams_college_id_idx").on(t.collegeId),
  ],
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("player"), // captain | player | coach | sub
    position: text("position"), // e.g. tank | damage | support
    status: text("status").notNull().default("active"), // active | inactive
    joinedAt: integer("joined_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    leftAt: integer("left_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("team_members_team_id_idx").on(t.teamId),
    index("team_members_user_id_idx").on(t.userId),
    uniqueIndex("team_members_team_user_unique").on(t.teamId, t.userId),
  ],
);

// ===========================================================================
// LAYER 8 — Brackets / tournaments (self-hosted; scores + replay codes)
// ===========================================================================

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    gameId: text("game_id").references(() => games.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    // round_robin | single_elim | double_elim | swiss
    format: text("format").notNull().default("round_robin"),
    // draft | registration | active | completed
    status: text("status").notNull().default("draft"),
    bestOf: integer("best_of").notNull().default(3),
    customGameCode: text("custom_game_code"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    rulesUrl: text("rules_url"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("tournaments_program_id_idx").on(t.programId)],
);

export const stages = sqliteTable(
  "stages",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // round_robin | single_elim | double_elim | swiss | groups
    type: text("type").notNull().default("round_robin"),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (t) => [index("stages_tournament_id_idx").on(t.tournamentId)],
);

export const tournamentParticipants = sqliteTable(
  "tournament_participants",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    // Exactly one of teamId / userId (team tournaments vs solo).
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    seed: integer("seed"),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" }),
    // Standings, updated on match confirmation.
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    mapDiff: integer("map_diff").notNull().default(0),
    points: integer("points").notNull().default(0),
    finalStanding: integer("final_standing"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("tournament_participants_tournament_id_idx").on(t.tournamentId),
    check(
      "tournament_participants_team_xor_user",
      sql`(${t.teamId} IS NOT NULL) <> (${t.userId} IS NOT NULL)`,
    ),
  ],
);

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    stageId: text("stage_id").references(() => stages.id, {
      onDelete: "set null",
    }),
    round: integer("round"),
    bracket: text("bracket"), // W | L | group | null
    participantAId: text("participant_a_id").references(
      () => tournamentParticipants.id,
      { onDelete: "set null" },
    ),
    participantBId: text("participant_b_id").references(
      () => tournamentParticipants.id,
      { onDelete: "set null" },
    ),
    winnerParticipantId: text("winner_participant_id").references(
      () => tournamentParticipants.id,
      { onDelete: "set null" },
    ),
    bestOf: integer("best_of").notNull().default(3),
    // pending | live | reported | confirmed | disputed
    status: text("status").notNull().default("pending"),
    scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }),
    playedAt: integer("played_at", { mode: "timestamp_ms" }),
    // Winner routing for elimination brackets.
    nextMatchId: text("next_match_id").references(
      (): AnySQLiteColumn => matches.id,
      { onDelete: "set null" },
    ),
    nextMatchSlot: text("next_match_slot"), // a | b
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("matches_tournament_id_idx").on(t.tournamentId)],
);

// The maps inside a Bo3/Bo5 — where scores + replay codes live.
export const matchGames = sqliteTable(
  "match_games",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    gameNumber: integer("game_number").notNull(),
    mapName: text("map_name"),
    mode: text("mode"),
    participantAScore: integer("participant_a_score").notNull().default(0),
    participantBScore: integer("participant_b_score").notNull().default(0),
    winnerParticipantId: text("winner_participant_id").references(
      () => tournamentParticipants.id,
      { onDelete: "set null" },
    ),
    replayCode: text("replay_code"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("match_games_match_id_idx").on(t.matchId),
    uniqueIndex("match_games_match_game_unique").on(t.matchId, t.gameNumber),
  ],
);

// ===========================================================================
// University directory for the registration typeahead + school-email domain
// validation. Seeded wholesale from the Hipo university-domains-list dataset
// (MIT) via db/seed/schools.sql — reseeding DELETEs and re-inserts, so ids are
// only stable within one seed generation and nothing may FK to them. Durable
// school references live in `colleges` (above).
// ===========================================================================

export const schools = sqliteTable(
  "schools",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    country: text("country").notNull(),
    alphaTwoCode: text("alpha_two_code").notNull(),
    stateProvince: text("state_province"),
    // JSON string arrays, verbatim from the dataset.
    domains: text("domains").notNull(),
    webPages: text("web_pages").notNull(),
  },
  (t) => [index("schools_country_name_idx").on(t.country, t.name)],
);

// ===========================================================================
// School-email verification codes (registration). One active code per user;
// throttling state lives here. The plaintext code is never stored — only
// sha256(`${userId}:${code}`).
// ===========================================================================

export const schoolEmailVerifications = sqliteTable(
  "school_email_verifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    // Lowercased school email the code was sent to.
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    // Sends within the current 24h window (anchored at firstSentAt).
    sendCount: integer("send_count").notNull().default(1),
    lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }).notNull(),
    firstSentAt: integer("first_sent_at", { mode: "timestamp_ms" }).notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("school_email_verifications_email_idx").on(t.email)],
);
