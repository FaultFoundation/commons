import { cache } from "react";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";

/**
 * The current session, memoized for the request with React's `cache`. Several
 * server components render on one request (DashboardShell, AdminGate, …) and
 * each used to call getSession independently — which rebuilds the whole Better
 * Auth instance and re-validates the session every time, a real chunk of the
 * Worker's per-request CPU. This collapses them to one lookup.
 */
export const getSessionCached = cache(async () => {
  // Server rendering cannot deliver Set-Cookie. Leave renewal to the browser's
  // /api/auth/get-session request so D1 and browser expiry advance together.
  return getAuth().api.getSession({
    headers: await headers(),
    query: { disableRefresh: true },
  });
});
