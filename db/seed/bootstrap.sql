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

-- Example self-hosted tournament (Overfault): round-robin, Bo3, custom lobby
-- code. created_at/updated_at have no SQL default (set app-side by Drizzle),
-- so raw inserts must supply them.
INSERT INTO tournaments
  (id, program_id, game_id, name, slug, format, status, best_of,
   custom_game_code, created_at, updated_at)
VALUES
  ('overfault-2026', 'collegiate-overwatch', 'overwatch', 'Overfault',
   'overfault-2026', 'round_robin', 'draft', 3, 'Y2TXE',
   CAST(strftime('%s','now') AS INTEGER) * 1000,
   CAST(strftime('%s','now') AS INTEGER) * 1000)
ON CONFLICT(id) DO NOTHING;
