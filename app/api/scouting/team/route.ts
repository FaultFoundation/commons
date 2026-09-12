import { getScoutingData, requestFaceitTeam } from "@/lib/faceit-scouting";
import { asScoutGameMode, DEFAULT_GAME_MODE } from "@/lib/faceit-scouting-shared";
import { getSessionCached } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await getSessionCached()) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const teamId = url.searchParams.get("team_id");
  if (!teamId) return Response.json({ error: "team_id required" }, { status: 400 });
  return Response.json(await getScoutingData({ teamId }, asScoutGameMode(url.searchParams.get("game_mode")) ?? DEFAULT_GAME_MODE));
}
export async function POST(request: Request) {
  if (!await getSessionCached()) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "forbidden" }, { status: 403 });
  const raw = await request.json().catch(() => null);
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const value = body.team_id ?? body.nickname;
  if (typeof value !== "string" || !value.trim() || value.length > 256) return Response.json({ error: "team required" }, { status: 400 });
  const trigger = await requestFaceitTeam(body.team_id ? "advance" : "search", value.trim(), body.mode === "deep" ? "deep" : "quick");
  if (!trigger.teamId) return Response.json({ status: trigger.status, player: null, data: null, target: "team", message: trigger.status === "not_found" ? "No unique Overwatch team found. Try its exact name (tag) or FACEIT team URL." : undefined });
  return Response.json(await getScoutingData({ teamId: trigger.teamId }, asScoutGameMode(body.game_mode) ?? DEFAULT_GAME_MODE));
}
