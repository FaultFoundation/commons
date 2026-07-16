import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Better Auth core tables (email/password + Discord OAuth). Shapes follow the
// Better Auth documented schema; the drizzle adapter resolves models by these
// export names (user/session/account/verification).
// ---------------------------------------------------------------------------

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
    // user's Discord ID (the join key to legacy verification records).
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

// ---------------------------------------------------------------------------
// Foundation member profile — the domain fields from the legacy verification
// sheet, restructured. 1:1 with `user` once linked, but rows can exist
// unlinked (userId null) so legacy sheet records can be imported before the
// member registers on the site. Everything is nullable: nothing is collected
// at signup yet.
//
// Dropped from the sheet: Verification Code / Code Expires At / Attempts
// (superseded by Better Auth's verification flow) and Form Row (sheet
// artifact). Email lives on `user`; Discord ID also appears in `account`
// (providerId "discord") once the member signs in with Discord.
// ---------------------------------------------------------------------------

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  discordId: text("discord_id").unique(),
  battleTag: text("battle_tag"),
  steamFriendCode: text("steam_friend_code"),
  userType: text("user_type"),
  graduationDate: text("graduation_date"),
  schoolName: text("school_name"),
  schoolWebsite: text("school_website"),
  // Community verification (school/identity), distinct from email
  // verification on `user`.
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  status: text("status"),
  dmPreference: text("dm_preference"),
  kickedAt: integer("kicked_at", { mode: "timestamp_ms" }),
  bannedAt: integer("banned_at", { mode: "timestamp_ms" }),
  // Staff-only; never rendered to the member.
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
