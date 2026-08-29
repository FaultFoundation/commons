-- Registry rows the application code references by stable id (lib/programs.ts).
-- Idempotent — safe to re-run. Apply with:
--   wrangler d1 execute website-sql --local  --file=db/seed/bootstrap.sql
--   wrangler d1 execute website-sql --remote --file=db/seed/bootstrap.sql

-- Games a team can pick from (the "what are you competing in" dropdown on team
-- creation) — each needs matching art under public/brand/games/. Overwatch is
-- still the program's game; the rest are here so teams and tournaments can be
-- tagged with the right mark. Add a game by adding a row here plus its SVG.
INSERT INTO games (id, slug, name, logo_url) VALUES
  ('overwatch', 'overwatch', 'Overwatch 2', '/brand/games/overwatch.svg'),
  ('valorant', 'valorant', 'Valorant', '/brand/games/valorant.svg'),
  ('cs2', 'cs2', 'Counter-Strike 2', '/brand/games/cs2.svg'),
  ('league-of-legends', 'league-of-legends', 'League of Legends', '/brand/games/league-of-legends.svg'),
  ('rocket-league', 'rocket-league', 'Rocket League', '/brand/games/rocket-league.svg')
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  name = excluded.name,
  logo_url = excluded.logo_url;

INSERT INTO programs (id, slug, name, description, game_id, active) VALUES
  ('collegiate-overwatch', 'collegiate-overwatch', 'Collegiate Overwatch',
   'The Fault Foundation collegiate Overwatch community and its events.',
   'overwatch', 1)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  game_id = excluded.game_id,
  active = excluded.active;

-- No example tournament is seeded: tournaments are created through the admin UI,
-- which also creates the matching Challonge tournament and stores its id. A
-- seeded row with no Challonge backing would have an empty bracket and can't be
-- managed, so the registry stops at games + programs.
