import { getScoutSuggestions } from "@/lib/scouting-directory";
import { getScoutingData, requestFaceitTeam } from "@/lib/faceit-scouting";
import { asScoutGameMode, DEFAULT_GAME_MODE, parseScoutTeamId } from "@/lib/faceit-scouting-shared";
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
  let teamId = parseScoutTeamId(value);
  if (!teamId && !body.team_id) {
    try { teamId = (await getScoutSuggestions(value, "team"))[0]?.id ?? null; }
    catch { return Response.json({ status: "error", player: null, data: null, message: "Team suggestions are unavailable. Try again or use a FACEIT ID or link." }); }
  }
  if (!teamId) return Response.json({ status: "not_found", player: null, data: null, target: "team", message: "No saved team matches that name. Scout its FACEIT link or ID once to add it to suggestions." });
  // An initial selection is sent as nickname: ID; team_id remains the advance cursor.
  const trigger = await requestFaceitTeam(body.team_id ? "advance" : "search", teamId, body.mode === "deep" ? "deep" : "quick");
  if (!trigger.teamId) return Response.json({ status: trigger.status, player: null, data: null, target: "team", message: trigger.status === "not_found" ? "That FACEIT team could not be found. Check its ID or team link." : undefined });
  return Response.json(await getScoutingData({ teamId: trigger.teamId }, asScoutGameMode(body.game_mode) ?? DEFAULT_GAME_MODE));
}
