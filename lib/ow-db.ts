import { cache } from "react";
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// A Drizzle client over the THIRD D1 (ow-player-data), the Overwatch
// player-statistics store. Same per-request rule as getDb() / getCenDb() — the
// binding only exists on the request context, so never hoist this to module
// scope.
//
// Returns null when the binding is absent (ow-player-data not created yet, or an
// environment without it), so callers degrade to "no statistics" instead of
// throwing. The binding is declared in wrangler.jsonc, so it's normally present
// locally and in prod; this guard keeps the read/write layer honest about the
// dependency and lets the Statistics tab render an empty/soft state rather than
// 500 when it's missing.
export const getOwDb = cache(function getOwDb() {
  const { env } = getCloudflareContext();
  if (!env.OW) return null;
  // Only SQL query builders are used here; skip unused relational-schema extraction.
  return drizzle(env.OW);
});
