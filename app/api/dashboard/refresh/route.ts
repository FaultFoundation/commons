import { getSessionCached } from "@/lib/session";
import { syncSchedule } from "@/lib/schedule";
import { syncChallongeTournamentsIfStale } from "@/lib/tournaments";

export const dynamic = "force-dynamic";

/** Refresh only sources present on the page; no user id or force bypass accepted. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  const session = await getSessionCached();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const sources = body as { schedule?: unknown; tournaments?: unknown };
  const results = await Promise.allSettled([
    sources.schedule === true ? syncSchedule(session.user.id, request.headers) : false,
    sources.tournaments === true ? syncChallongeTournamentsIfStale() : false,
  ]);
  for (const result of results) {
    if (result.status === "rejected") console.error("Dashboard refresh failed:", result.reason);
  }
  return Response.json({
    refreshed: results.some((result) => result.status === "fulfilled" && result.value),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
