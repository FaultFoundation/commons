import { advanceFaceitSearch, getScoutingData } from "@/lib/faceit-scouting";
import {
  DEFAULT_GAME_MODE,
  asScoutGameMode,
  type ScoutMode,
  type ScoutResponse,
} from "@/lib/faceit-scouting-shared";
import { getSessionCached } from "@/lib/session";

// POST /api/scouting/advance — the Deep search's drive-to-completion loop. Given
// an already-registered player id, it asks the ow-data Worker to advance the
// bounded, resumable collection by one chunk (POST /faceit/advance), then reads
// the freshened cache back and returns the derived profile (with progress). The
// client calls this repeatedly behind the load screen until status is "ready" or
// a safety cap is hit. Member-gated + same-origin (it triggers an outbound
// authenticated call). Reads request-scoped env/D1, so force-dynamic.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    player_id?: unknown;
    mode?: unknown;
    game_mode?: unknown;
  };
  const playerId = typeof body.player_id === "string" ? body.player_id.trim() : "";
  if (!playerId) {
    return Response.json({ error: "player_id required" }, { status: 400 });
  }
  const mode: ScoutMode = body.mode === "quick" ? "quick" : "deep";
  const gameMode = asScoutGameMode(body.game_mode) ?? DEFAULT_GAME_MODE;

  const advanced = await advanceFaceitSearch(playerId, mode);

  // A definitive negative (not found / unconfigured) short-circuits.
  if (!advanced.ok && advanced.status !== "error") {
    const payload: ScoutResponse = {
      status: advanced.status,
      player: null,
      data: null,
    };
    return Response.json(payload);
  }

  // Read the freshened cache. Even if the advance call itself errored transiently,
  // the cached read is the better answer than the transient error.
  const read = await getScoutingData({ playerId }, gameMode);
  return Response.json(read);
}
