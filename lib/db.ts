import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "@/db/schema";

// The D1 binding only exists per-request (and in `next dev` via
// initOpenNextCloudflareForDev) — never cache the client at module scope.
export function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
}
