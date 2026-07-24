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
  // Owned by the two-factor plugin. One flag for both factors: it flips on the
  // first successful verification during enrollment (see `twoFactor` below).
  twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
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

/**
 * Two-factor enrollment — one row per member, created by
 * `authClient.twoFactor.enable()`. The export name must stay `twoFactor`: the
 * drizzle adapter resolves Better Auth's models by export name, not by table
 * name.
 *
 * `secret` and `backupCodes` are encrypted with BETTER_AUTH_SECRET, so rotating
 * that secret makes every enrolled member's 2FA undecryptable — see
 * docs/cloudflare-setup.md.
 *
 * `verified` is what separates the two factors. Enrolling always mints a TOTP
 * secret, but it stays `false` until someone actually enters a code from their
 * authenticator app; the sign-in challenge only offers TOTP once it's `true`.
 * Members who enrolled with email codes therefore leave it `false` forever, and
 * that is the flag telling the challenge to offer email only.
 */
export const twoFactor = sqliteTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: integer("verified", { mode: "boolean" }).notNull().default(true),
    // Account-level lockout: consecutive failed second-factor verifications
    // across challenges and factors, reset on success (NIST SP 800-63B §5.2.2).
    failedVerificationCount: integer("failed_verification_count")
      .notNull()
      .default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  },
  (t) => [index("two_factor_user_id_idx").on(t.userId)],
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
  // compact | cozy | comfortable — how tightly the dashboard packs a bubble's
  // rows (lib/density.ts). Source of truth; the ff-density cookie caches it so
  // the shell doesn't read D1 on every render.
  density: text("density").notNull().default("cozy"),
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
    // How the grant was created: "discord" rows are reconciled automatically
    // against the linked Discord role (lib/staff.ts syncManagedStaffRoles) and
    // removed when the role is lost; "manual" (or NULL/legacy) rows are managed
    // by owners/admins in the dashboard and never touched by the sync. Kept
    // separate from granted_by because that column is a FK to user.id — it can't
    // hold a sentinel, and it goes NULL when the granting account is deleted.
    grantedVia: text("granted_via"), // discord | manual (NULL = legacy/manual)
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
//
// Permissions live entirely on team_members.role (see lib/teams-shared.ts) —
// there is deliberately no owner column, because a team can have several
// managers and deleting one needs all of them to agree.
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
    description: text("description"),
    // LFG matching inputs, also shown on the team card.
    region: text("region"),
    timezone: text("timezone"), // IANA zone
    // Where "connect with this team" points (LFM).
    discordInviteUrl: text("discord_invite_url"),
    // Team logo, as the /api/avatars/... path it is served from (lib/avatars.ts).
    // A path, not an absolute URL, so it survives the workers.dev -> custom
    // domain cutover. The user-side equivalent is Better Auth's `user.image`.
    logoUrl: text("logo_url"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Soft delete. A hard delete would NULL tournament_participants.team_id
    // and orphan standings and match history, so disbanding only hides the
    // team (and frees its name — hence no unique index on `name`).
    disbandedAt: integer("disbanded_at", { mode: "timestamp_ms" }),
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
    // manager | captain | coach | player — the capability tiers in
    // lib/teams-shared.ts. Distinct from `position`, which is the in-game role.
    role: text("role").notNull().default("player"),
    position: text("position"), // e.g. tank | damage | support
    // Leaving flips this to inactive rather than deleting the row, so the
    // team/user unique index turns a rejoin into a reactivation.
    status: text("status").notNull().default("active"), // active | inactive
    // This member's own ordering of their teams on /teams/ (drag to reorder).
    // NULL = never reordered, and sorts after everything explicit; the (team,
    // user) grain is exactly "one person's placement of one team".
    sortOrder: integer("sort_order"),
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

/**
 * Join links. Every team gets one reusable `link` invite (its newest
 * non-revoked one is *the* invite link; rotating revokes and inserts);
 * `targeted` invites are minted per person for a specific role, usually with
 * maxUses = 1.
 */
export const teamInvites = sqliteTable(
  "team_invites",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    kind: text("kind").notNull().default("link"), // link | targeted
    // Role the redeemer lands on (see lib/teams-shared.ts).
    role: text("role").notNull().default("player"),
    // Free-text "who this is for" on targeted invites.
    note: text("note"),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    maxUses: integer("max_uses"), // NULL = unlimited
    useCount: integer("use_count").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("team_invites_team_id_idx").on(t.teamId)],
);

/**
 * Multi-manager delete consent. A sole manager disbands immediately; with
 * several, a request collects one vote per manager and only unanimous approval
 * executes. Unanimity is judged against the CURRENT manager set, so promoting
 * someone mid-vote correctly re-blocks the delete.
 */
export const teamDeleteRequests = sqliteTable(
  "team_delete_requests",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    // open | approved | declined | cancelled | expired. At most one `open` row
    // per team (enforced in the action, not the schema).
    status: text("status").notNull().default("open"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("team_delete_requests_team_id_idx").on(t.teamId)],
);

export const teamDeleteVotes = sqliteTable(
  "team_delete_votes",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => teamDeleteRequests.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    decision: text("decision").notNull(), // approve | decline
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("team_delete_votes_request_id_idx").on(t.requestId),
    uniqueIndex("team_delete_votes_request_user_unique").on(
      t.requestId,
      t.userId,
    ),
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
    registeredByUserId: text("registered_by_user_id").references(
      () => user.id,
      { onDelete: "set null" },
    ),
    seed: integer("seed"),
    checkedInAt: integer("checked_in_at", { mode: "timestamp_ms" }),
    // Withdrawing keeps the row (and its standings history) but drops it out
    // of every "who is entered" query — including the one-team-per-tournament
    // conflict check in lib/teams.ts.
    withdrawnAt: integer("withdrawn_at", { mode: "timestamp_ms" }),
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
    // Who filed the score that stands. Reports apply instantly (no opponent
    // confirmation step), so this is the audit trail staff correct against.
    reportedByUserId: text("reported_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reportedAt: integer("reported_at", { mode: "timestamp_ms" }),
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
    // Re-reporting a match overwrites these rows rather than adding to them.
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
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

// ===========================================================================
// LAYER 9 — Matchmaking (LFG / LFT / LFM)
//
// Two sides of one market: `lfg_profiles` is a player advertising themselves,
// `team_listings` is a team advertising open slots, and `lfg_connections` is
// the handshake between them (which is also what the "connect over Discord"
// button records). Matching is availability + skill-range overlap, so both
// sides carry the same shape of those fields.
//
// The columns are here ahead of the UI on purpose: the browse/apply screens
// are still WIP, and shipping the tables now means building them later needs
// no migration. `positions` and `availability` are JSON strings whose shape is
// owned by lib/lfg-shared.ts — parse them through those helpers, never ad hoc.
// ===========================================================================

export const lfgProfiles = sqliteTable(
  "lfg_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    gameId: text("game_id").references(() => games.id),
    // open | paused | placed
    status: text("status").notNull().default("open"),
    // Current and peak skill rating (Overwatch SR), used against a listing's
    // skillMin/skillMax.
    skillRating: integer("skill_rating"),
    peakRating: integer("peak_rating"),
    positions: text("positions"), // JSON string array
    availability: text("availability"), // JSON, see lib/lfg-shared.ts
    timezone: text("timezone"), // IANA zone
    region: text("region"),
    description: text("description"),
    // discord | site — how the player wants to be reached.
    contactPreference: text("contact_preference"),
    // Freshness signal for sorting; distinct from updatedAt, which any edit
    // bumps.
    bumpedAt: integer("bumped_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // One advertisement per person per game.
    uniqueIndex("lfg_profiles_user_program_game_unique").on(
      t.userId,
      t.programId,
      t.gameId,
    ),
    index("lfg_profiles_program_status_idx").on(t.programId, t.status),
  ],
);

export const teamListings = sqliteTable(
  "team_listings",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    gameId: text("game_id").references(() => games.id),
    // open | closed | filled
    status: text("status").notNull().default("open"),
    positions: text("positions"), // JSON string array of what's needed
    skillMin: integer("skill_min"),
    skillMax: integer("skill_max"),
    slotsOpen: integer("slots_open"),
    availability: text("availability"), // JSON, see lib/lfg-shared.ts
    timezone: text("timezone"),
    region: text("region"),
    description: text("description"),
    // Overrides teams.discord_invite_url for this listing only.
    contactUrl: text("contact_url"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    bumpedAt: integer("bumped_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("team_listings_team_id_idx").on(t.teamId),
    index("team_listings_program_status_idx").on(t.programId, t.status),
  ],
);

export const lfgConnections = sqliteTable(
  "lfg_connections",
  {
    id: text("id").primaryKey(),
    // Whichever side started it; both are nullable because a team can reach
    // out to a player who has no profile, and vice versa.
    listingId: text("listing_id").references(() => teamListings.id, {
      onDelete: "cascade",
    }),
    profileId: text("profile_id").references(() => lfgProfiles.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // player_to_team | team_to_player
    direction: text("direction").notNull(),
    // open | accepted | declined | withdrawn
    status: text("status").notNull().default("open"),
    message: text("message"),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("lfg_connections_team_status_idx").on(t.teamId, t.status),
    index("lfg_connections_user_status_idx").on(t.userId, t.status),
    // One approach per player per listing (re-approaching updates the row).
    uniqueIndex("lfg_connections_listing_user_unique").on(t.listingId, t.userId),
  ],
);

// ===========================================================================
// LAYER 10 — Support tickets (website is source of truth; Discord mirrors)
//
// Ported from the Discord bot's Google "Tickets" sheet, which stored only 13
// columns of metadata and left the conversation in the channel. Here D1 owns
// both: support_ticket_messages is a full two-way mirror (Discord messages
// stream in; staff replies from the dashboard stream out via the bot bridge).
// ===========================================================================

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    // Human-facing 4-digit number (bot parity: ticket-oscar-0007). Monotonic
    // and unique; the id above is the real key.
    ticketNumber: integer("ticket_number").notNull(),
    // The opener. userId is null when they have no site account yet; the
    // Discord id/name are always captured so the ticket survives either way.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    discordUserId: text("discord_user_id"),
    discordUsername: text("discord_username"),
    // The mirrored Discord channel. Nullable until the bot reports it; unique so
    // one channel maps to exactly one ticket.
    discordChannelId: text("discord_channel_id"),
    discordChannelName: text("discord_channel_name"),
    // Verification | Other | Internal | … (bot inquiry types, kept as text).
    category: text("category"),
    subject: text("subject"),
    // open | closed
    status: text("status").notNull().default("open"),
    // low | normal | high | urgent (staff-set; NULL = unset)
    priority: text("priority"),
    assignedToUserId: text("assigned_to_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // manual | inactivity | discord (who/what closed it), plus the staff closer.
    closeReason: text("close_reason"),
    closedByUserId: text("closed_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    // Inactivity bookkeeping, mirrored from the bot's InactivityMonitor.
    warningSent: integer("warning_sent", { mode: "boolean" })
      .notNull()
      .default(false),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("support_tickets_number_unique").on(t.ticketNumber),
    uniqueIndex("support_tickets_channel_unique").on(t.discordChannelId),
    index("support_tickets_status_idx").on(t.status),
    index("support_tickets_assigned_idx").on(t.assignedToUserId),
    index("support_tickets_discord_user_idx").on(t.discordUserId),
  ],
);

export const supportTicketMessages = sqliteTable(
  "support_ticket_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    // user | staff | system
    authorType: text("author_type").notNull(),
    // Set when we can attribute the author to a site account (a staff reply, or
    // a Discord author whose account is linked); the Discord id/name are the
    // fallback for everyone else.
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    authorDiscordId: text("author_discord_id"),
    authorName: text("author_name").notNull(),
    content: text("content").notNull().default(""),
    // JSON array of { url, name } — attachments carried on the Discord message.
    attachments: text("attachments"),
    // discord | website — which side authored it. Also stops the bridge from
    // re-mirroring a website reply the bot just posted into the channel.
    source: text("source").notNull(),
    // The Discord message id, when one exists. Unique so mirroring is
    // idempotent — replaying an event never duplicates a row.
    discordMessageId: text("discord_message_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("support_ticket_messages_ticket_idx").on(t.ticketId, t.createdAt),
    uniqueIndex("support_ticket_messages_discord_msg_unique").on(
      t.discordMessageId,
    ),
  ],
);

// Outbound work queue for the Discord bot. The bot can only make outbound
// calls (managed hosting), so instead of the site pushing to it, the bot polls
// this table and carries out each job: post a staff reply, close a channel, DM
// a transcript. Enqueued by the dashboard actions; drained via /api/bot/outbox.
export const botOutbox = sqliteTable(
  "bot_outbox",
  {
    id: text("id").primaryKey(),
    // post_message | close_channel | send_transcript
    kind: text("kind").notNull(),
    ticketId: text("ticket_id").references(() => supportTickets.id, {
      onDelete: "cascade",
    }),
    // JSON args for the job (channel id, content, transcript, …).
    payload: text("payload").notNull(),
    // pending | claimed | done | failed
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // Set when a poll hands the job out; a stale claim (crash mid-run) is
    // re-offered after a visibility timeout.
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("bot_outbox_status_idx").on(t.status, t.createdAt)],
);

// Staff-only notes, never shown to the ticket opener or mirrored to Discord.
export const supportTicketNotes = sqliteTable(
  "support_ticket_notes",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("support_ticket_notes_ticket_idx").on(t.ticketId)],
);
