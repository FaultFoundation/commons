import { applyMatchTimes } from "@/lib/match-times";
import { getMatchData, syncPlayerData } from "@/lib/player-data";
import { getSessionCached } from "@/lib/session";

// GET /api/statistics/matches — the Match Data tab fetches this on open so the
// provider round-trips (a TTL-gated sync across FACEIT / start.gg / Challonge,
// then the D1 read) run behind the loading bar instead of freezing a render.
// Member-gated; reads the request-scoped env + D1, so force-dynamic.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  // Lazy sync first (no-op inside the TTL), then read what's cached.
  await syncPlayerData(session.user.id, request.headers);
  const payload = await getMatchData(session.user.id);
  return Response.json({ ...payload, matches: await applyMatchTimes(payload.matches) });
}
