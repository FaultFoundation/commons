import { cache } from "react";
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "@/db/schema";

// The D1 binding only exists per request (and in `next dev` via
// initOpenNextCloudflareForDev). React cache keeps one stateless Drizzle wrapper
// per request so its full schema config is extracted once; every query still
// hits D1 live, and nothing is retained across requests.
export const getDb = cache(function getDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
});
