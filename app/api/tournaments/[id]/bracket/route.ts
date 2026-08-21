import { getOrRefreshSnapshot, getTournament } from "@/lib/tournaments";
import {
  isPublic,
  isTournamentId,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

// Reads the per-request D1 binding.
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// The public bracket snapshot.
//
// Serves the cached `tournament_brackets` row (rebuilt from Challonge when
// stale — see lib/tournaments.ts `getOrRefreshSnapshot`) rather than calling
// Challonge per request: Challonge meters API usage, and the cache decouples
// viewer count from API calls entirely.
//
// `Cache-Control` saves CPU but NOT requests — on Workers, cache hits are still
// billed. The request budget is instead defended by `nextPollMs`, which lets
// the server tell the client how rarely it can afford to be asked.
// ---------------------------------------------------------------------------

function cacheControl(status: TournamentStatus): string {
  switch (status) {
    case "registration":
      return "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";
    case "seeding":
    case "active":
      return "public, max-age=30, s-maxage=60, stale-while-revalidate=120";
    default:
      return "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
  }
}

/** The poll interval the client should use next, in ms — `null` stops it. The
    server owns this because a client-chosen interval is how a busy final
    quietly burns through the day's request allowance. */
function nextPollMs(status: TournamentStatus): number | null {
  switch (status) {
    case "completed":
    case "cancelled":
    case "draft":
      return null;
    case "registration":
      return 300_000;
    case "seeding":
      return 120_000;
    case "active":
      return 60_000;
    default:
      return 120_000;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Reject a malformed id before spending a D1 read on it.
  if (!isTournamentId(id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const tournament = await getTournament(id);
  // Draft tournaments are staff-only; a plain 404 keeps their existence out of
  // the answer (no session on this route).
  if (!tournament || !isPublic(tournament.status)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const snapshot = await getOrRefreshSnapshot(tournament);
  const etag = `"v${snapshot.version}"`;
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": cacheControl(tournament.status),
    ETag: etag,
  };

  // A matching ETag means the version hasn't moved: answer with no body.
  if (request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(
    JSON.stringify({
      ...snapshot.payload,
      version: snapshot.version,
      nextPollMs: nextPollMs(tournament.status),
    }),
    { status: 200, headers },
  );
}
