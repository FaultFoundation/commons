import { syncPlayerData } from "@/lib/player-data";
import { getSessionCached } from "@/lib/session";

// POST /api/player-data/refresh — the external-teams top-up. The Teams tab and
// the external team detail page render from D1 and then fire this after paint
// (the ExternalTournamentRefresh pattern): body { force?: boolean } where the
// on-open call leaves force unset (full TTL) and the refresh icon sends
// force:true (short floor, so a click storm can't hammer the providers). Only a
// `changed: true` response makes the client router.refresh().
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  const result = await syncPlayerData(session.user.id, request.headers, {
    force: body.force === true,
  });
  return Response.json({ refreshed: result.ran, changed: result.changed });
}
