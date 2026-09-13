import { getScoutSuggestions } from "@/lib/scouting-directory";
import { getSessionCached } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await getSessionCached()) return Response.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const target = params.get("target");
  const query = params.get("q")?.trim() ?? "";
  if ((target !== "player" && target !== "team") || query.length > 256) return Response.json({ error: "invalid search" }, { status: 400 });
  try {
    return Response.json({ items: await getScoutSuggestions(query, target) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Suggestions unavailable. Try again or use a FACEIT ID or link." }, { status: 503 });
  }
}
