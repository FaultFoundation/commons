import { defineConfig } from "drizzle-kit";

// Generates SQL migrations into drizzle/ — applied by wrangler, not
// drizzle-kit (wrangler.jsonc points migrations_dir at the same folder):
//   npm run db:generate        # schema change -> new SQL file
//   npm run db:migrate:local   # apply to the local D1 (.wrangler/state)
//   npm run db:migrate:remote  # apply to the real D1
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
