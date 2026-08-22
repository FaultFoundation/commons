-- FULL RESET — drops every table so a fresh baseline migration can recreate
-- them. Safe only because all current accounts are test data. Also drops
-- wrangler's `d1_migrations` tracker so the reset baseline re-applies cleanly.
--
-- Remote use (destructive — export first if you ever have real data):
--   wrangler d1 execute website-sql --remote --file=db/reset/drop-all.sql
--   npm run db:migrate:remote
--   npm run db:seed:remote
--   wrangler d1 execute website-sql --remote --file=db/seed/bootstrap.sql
--
-- Locally, prefer deleting .wrangler/state/v3/d1 instead of running this.
--
-- Children before parents so foreign keys never block a drop. Every table in
-- db/schema.ts must appear here — a missing one survives the reset and then
-- collides with the baseline's CREATE TABLE.

-- Layer 10 — support tickets + the bot outbox
DROP TABLE IF EXISTS bot_outbox;
DROP TABLE IF EXISTS support_ticket_notes;
DROP TABLE IF EXISTS support_ticket_messages;
DROP TABLE IF EXISTS support_tickets;

-- Layer 9 — matchmaking
DROP TABLE IF EXISTS lfg_connections;
DROP TABLE IF EXISTS team_listings;
DROP TABLE IF EXISTS lfg_profiles;

-- Layer 8 — tournaments (Challonge-backed) + the personal-calendar mirror.
-- Also drops the removed self-hosted engine tables (matches/match_games/stages):
-- the baseline migrations still create them before 0013 drops them, and a
-- database left on the pre-Challonge schema still has them — DROP ... IF EXISTS
-- makes clearing them harmless either way. Children before parents.
DROP TABLE IF EXISTS match_games;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS stages;
DROP TABLE IF EXISTS external_matches;
DROP TABLE IF EXISTS tournament_brackets;
DROP TABLE IF EXISTS tournament_participants;
DROP TABLE IF EXISTS tournaments;

-- Layer 7 — teams & rosters
DROP TABLE IF EXISTS team_delete_votes;
DROP TABLE IF EXISTS team_delete_requests;
DROP TABLE IF EXISTS team_invites;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;

-- Layers 1-6 — membership, satellites, reference data
DROP TABLE IF EXISTS collegiate_registrations;
DROP TABLE IF EXISTS program_memberships;
DROP TABLE IF EXISTS moderation_actions;
DROP TABLE IF EXISTS staff_roles;
DROP TABLE IF EXISTS platform_identities;
DROP TABLE IF EXISTS school_email_verifications;
DROP TABLE IF EXISTS parental_consents;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS colleges;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS schools;

-- Layer 0 — identity core (Better Auth)
DROP TABLE IF EXISTS two_factor;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS "user";
DROP TABLE IF EXISTS d1_migrations;
