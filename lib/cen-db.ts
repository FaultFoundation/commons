import { cache } from "react";
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// A Drizzle client over the SECOND D1 (cen-sql), the external-tournaments
// projection. Same per-request rule as getDb() — the binding only exists on the
// request context, so never hoist this to module scope.
//
// Returns null when the binding is absent (cen-sql not created yet), so callers
// degrade to "no external tournaments" instead of throwing. The binding is
// declared in wrangler.jsonc, so it's normally present locally and in prod;
// this guard covers the window before cen-sql exists and keeps the read layer
// honest about the dependency.
export const getCenDb = cache(function getCenDb() {
  const { env } = getCloudflareContext();
  if (!env.CEN) return null;
  // Only SQL query builders are used here; skip unused relational-schema extraction.
  return drizzle(env.CEN);
});
