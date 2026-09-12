import { getScoutMatchDetail } from "@/lib/faceit-scouting";
import { getSessionCached } from "@/lib/session";

// GET /api/scouting/match?match_id=…&player=… — the expandable match dropdown
// fetches this on first open. Returns both teams' scoreboards + the match
// overview for one collected match; `player` (the scouted player id) highlights
// their row and orders their team first. A pure read of rows the ow-data Worker
// already wrote, so no outbound trigger — a session read is enough.
// Member-gated; reads request-scoped D1, so force-dynamic.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const matchId = url.searchParams.get("match_id")?.trim();
  const playerId = url.searchParams.get("player")?.trim() || undefined;
  if (!matchId) {
    return Response.json({ error: "match_id required" }, { status: 400 });
  }

  const detail = await getScoutMatchDetail(matchId, playerId, url.searchParams.get("team")?.trim() || undefined);
  if (!detail) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(detail);
}
