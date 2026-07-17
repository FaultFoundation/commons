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
-- Children before parents so foreign keys never block a drop.

DROP TABLE IF EXISTS match_games;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS tournament_participants;
DROP TABLE IF EXISTS stages;
DROP TABLE IF EXISTS tournaments;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS collegiate_registrations;
DROP TABLE IF EXISTS program_memberships;
DROP TABLE IF EXISTS moderation_actions;
DROP TABLE IF EXISTS staff_roles;
DROP TABLE IF EXISTS platform_identities;
DROP TABLE IF EXISTS school_email_verifications;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS colleges;
DROP TABLE IF EXISTS programs;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS schools;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS "user";
DROP TABLE IF EXISTS d1_migrations;
