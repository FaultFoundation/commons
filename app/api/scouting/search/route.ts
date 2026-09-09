import { getScoutingData, requestFaceitSearch } from "@/lib/faceit-scouting";
import {
  normalizeNickname,
  type ScoutMode,
  type ScoutResponse,
} from "@/lib/faceit-scouting-shared";
import { getSessionCached } from "@/lib/session";

// POST /api/scouting/search — the Scouting search box calls this. It asks the
// ow-data Worker to collect the FACEIT player (the collection engine lives only
// there), then reads the freshened `faceit_*` cache and returns the derived
// scouting profile. Member-gated + same-origin (it triggers an outbound,
// authenticated server-to-server call, so no forging it from off-site). Reads the
// request-scoped env/D1, so force-dynamic.
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
    nickname?: unknown;
    mode?: unknown;
  };
  const nickname =
    typeof body.nickname === "string" ? normalizeNickname(body.nickname) : null;
  if (!nickname) {
    return Response.json({ error: "nickname required" }, { status: 400 });
  }
  const mode: ScoutMode = body.mode === "deep" ? "deep" : "quick";

  const trigger = await requestFaceitSearch({ nickname }, mode);

  // A definitive negative from the Worker (not found / unconfigured) short-circuits.
  if (!trigger.ok && trigger.status !== "error") {
    const payload: ScoutResponse = {
      status: trigger.status,
      player: null,
      data: null,
    };
    return Response.json(payload);
  }

  // Read the cache back by the resolved id (preferred — exact), else the nickname.
  const read = await getScoutingData(
    trigger.resolved
      ? { playerId: trigger.resolved.playerId }
      : { nickname },
  );

  // The Worker collected a first page synchronously, so the row normally exists.
  // If a read races ahead of the write, still hand back the resolved identity so
  // the header can paint while the background backfill lands.
  if (read.status === "idle" && trigger.resolved) {
    const payload: ScoutResponse = {
      status: "collecting",
      player: {
        playerId: trigger.resolved.playerId,
        nickname: trigger.resolved.nickname,
        avatarUrl: null,
        country: null,
        skillLevel: null,
        faceitElo: null,
        region: null,
        faceitUrl: null,
        gamePlayerName: null,
        matchCount: 0,
        listDone: false,
        detailDone: false,
        searchMode: mode,
      },
      data: null,
    };
    return Response.json(payload);
  }

  // If the trigger itself errored but the cache already held this player, the
  // cached read (ready/collecting) is the better answer than the transient error.
  if (!trigger.ok && read.status === "idle") {
    return Response.json({ status: "error", player: null, data: null } satisfies ScoutResponse);
  }

  return Response.json(read);
}
