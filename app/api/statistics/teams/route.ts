import { getSessionCached } from "@/lib/session";
import { statisticsTeams, teamStatistics } from "@/lib/team-statistics";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await getSessionCached();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  const team = new URL(request.url).searchParams.get("team");
  try {
    if (!team) return Response.json({ teams: await statisticsTeams(session.user.id) });
    const detail = await teamStatistics(session.user.id, team);
    return detail ? Response.json(detail) : Response.json({ error: "not found" }, { status: 404 });
  } catch {
    return Response.json({ error: "Statistics could not be loaded" }, { status: 503 });
  }
}
