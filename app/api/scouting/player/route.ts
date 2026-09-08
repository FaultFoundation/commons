import { getScoutingData } from "@/lib/faceit-scouting";
import { normalizeNickname } from "@/lib/faceit-scouting-shared";
import { getSessionCached } from "@/lib/session";

// GET /api/scouting/player?nickname=…|player_id=… — read the cached scouting
// profile without triggering a new collection. The view uses this to re-read
// (e.g. the "Refresh" control, or restoring a remembered search) so the map win
// rates and match list pick up detail the Worker filled in the background.
// Member-gated; reads request-scoped D1, so force-dynamic.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const playerId = url.searchParams.get("player_id") ?? undefined;
  const nickname = normalizeNickname(url.searchParams.get("nickname") ?? "") ?? undefined;
  if (!playerId && !nickname) {
    return Response.json({ error: "nickname or player_id required" }, { status: 400 });
  }
  const payload = await getScoutingData({ playerId, nickname });
  return Response.json(payload);
}
