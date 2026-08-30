import { defineConfig } from "drizzle-kit";

// The third D1 (ow-player-data) — the Overwatch player-statistics store. Its
// migrations live apart from website-sql's and cen-sql's so the three databases
// version independently (wrangler.jsonc points the OW binding's migrations_dir at
// drizzle-ow). Unlike cen-sql (whose prod schema the scraper repo owns), the
// Commons is the SOLE migration owner here — the ow-stats-poller repo only
// reads/writes rows:
//   npm run db:ow:generate        # db/ow-schema.ts change -> new SQL file
//   npm run db:ow:migrate:local   # apply to the local ow-player-data
//   npm run db:ow:migrate:remote  # apply to the real ow-player-data
export default defineConfig({
  schema: "./db/ow-schema.ts",
  out: "./drizzle-ow",
  dialect: "sqlite",
});
