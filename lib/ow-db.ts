import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as owSchema from "@/db/ow-schema";

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
export function getOwDb() {
  const { env } = getCloudflareContext();
  if (!env.OW) return null;
  return drizzle(env.OW, { schema: owSchema });
}
