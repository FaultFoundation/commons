-- Registry rows the application code references by stable id (lib/programs.ts).
-- Idempotent — safe to re-run. Apply with:
--   wrangler d1 execute website-sql --local  --file=db/seed/bootstrap.sql
--   wrangler d1 execute website-sql --remote --file=db/seed/bootstrap.sql

INSERT INTO games (id, slug, name) VALUES
  ('overwatch', 'overwatch', 'Overwatch 2')
ON CONFLICT(id) DO UPDATE SET slug = excluded.slug, name = excluded.name;

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
