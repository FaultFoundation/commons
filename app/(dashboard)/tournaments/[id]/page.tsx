import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ExternalTournamentView } from "@/components/dashboard/tournaments/ExternalTournamentView";
import { InternalTournamentView } from "@/components/dashboard/tournaments/InternalTournamentView";
import { getExternalTournament } from "@/lib/external-tournaments";
import { getSessionCached } from "@/lib/session";
import { getTournament } from "@/lib/tournaments";
import {
  isPublic,
  isTournamentId,
  tournamentShareText,
} from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournament",
  robots: { index: false },
};

/** Decode a route param, tolerating a malformed sequence rather than throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The standalone tournament page.
 *
 * It is now only a router: the id decides which of the two views renders, and
 * both of those are components shared with the series profile's in-page
 * tournament strip (`/tournaments/discovery/<series>/<tid>/`), so a tournament
 * looks and behaves the same whichever way it was opened.
 */
export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  // External ids carry a `source:` prefix, so the card links encode them; Next
  // hands the param back still-encoded. Internal 6-digit ids are unaffected.
  const id = safeDecode(rawId);
  const hdrs = await headers();
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const host = hdrs.get("host") ?? "commons.fault.foundation";

  // External (start.gg / FACEIT) tournaments carry a `source:` prefixed id and
  // are served the branded read-only view from the cen-sql projection. Internal
  // Challonge-backed tournaments (6-digit ids) fall through to the flow below.
  if (!isTournamentId(id)) {
    const external = await getExternalTournament(id);
    if (!external) notFound();
    return (
      <>
        <h1 className="screen-reader-text">{external.name}</h1>
        <ExternalTournamentView
          tournament={external}
          shareUrl={`https://${host}/tournaments/${encodeURIComponent(id)}/`}
          shareMessage={tournamentShareText(external.name)}
        />
      </>
    );
  }

  const tournament = await getTournament(id);
  // Drafts are staff-only; members can't see them.
  if (!tournament || !isPublic(tournament.status)) notFound();

  return (
    <InternalTournamentView
      tournament={tournament}
      userId={session.user.id}
      host={host}
    />
  );
}
