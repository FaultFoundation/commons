import { defineConfig } from "drizzle-kit";

// The second D1 (cen-sql) — the external-tournaments projection. Its migrations
// live apart from website-sql's so the two databases version independently
// (wrangler.jsonc points the CEN_DB binding's migrations_dir at drizzle-cen):
//   npm run db:cen:generate        # db/cen-schema.ts change -> new SQL file
//   npm run db:cen:migrate:local   # apply to the local cen-sql
//   npm run db:cen:migrate:remote  # apply to the real cen-sql
export default defineConfig({
  schema: "./db/cen-schema.ts",
  out: "./drizzle-cen",
  dialect: "sqlite",
});
