import { requestExternalRefresh } from "@/lib/external-refresh";
import { getSessionCached } from "@/lib/session";

// POST /api/tournaments/external/<id>/refresh — the branded external view calls
// this on open to top up a stale bracket. Member-gated (so it can't be used to
// drive provider calls anonymously); the scraper enforces a per-tournament TTL
// on top. Returns { refreshed } so the client only re-renders when something
// actually changed. Reads the request-scoped env, so force-dynamic.
export const dynamic = "force-dynamic";

/** Decode a route param, tolerating a malformed sequence rather than throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionCached();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const outcome = await requestExternalRefresh(safeDecode(id));
  return Response.json(outcome);
}
