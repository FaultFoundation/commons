import { getStatisticsData } from "@/lib/ow-stats";
import { getSessionCached } from "@/lib/session";

// GET /api/statistics/player — the Player Data view fetches this on open so the
// OverFast round-trips (visibility check + snapshot + roster) run behind a
// loading bar instead of freezing the page's SSR render. Member-gated; reads the
// request-scoped env + D1, so force-dynamic.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await getStatisticsData(session.user.id);
  return Response.json(payload);
}
