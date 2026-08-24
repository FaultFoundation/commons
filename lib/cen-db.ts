import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as cenSchema from "@/db/cen-schema";

// A Drizzle client over the SECOND D1 (cen-sql), the external-tournaments
// projection. Same per-request rule as getDb() — the binding only exists on the
// request context, so never hoist this to module scope.
//
// Returns null when the binding is absent (cen-sql not created yet), so callers
// degrade to "no external tournaments" instead of throwing. The binding is
// declared in wrangler.jsonc, so it's normally present locally and in prod;
// this guard covers the window before cen-sql exists and keeps the read layer
// honest about the dependency.
export function getCenDb() {
  const { env } = getCloudflareContext();
  if (!env.CEN) return null;
  return drizzle(env.CEN, { schema: cenSchema });
}
