import { notFound } from "next/navigation";

import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { ExternalTournamentView } from "@/components/dashboard/tournaments/ExternalTournamentView";
import { InternalTournamentView } from "@/components/dashboard/tournaments/InternalTournamentView";
import { getExternalTournament } from "@/lib/external-tournaments";
import { getTournament } from "@/lib/tournaments";
import {
  isPublic,
  isTournamentId,
  tournamentShareText,
} from "@/lib/tournaments-shared";

/**
 * One of a series' tournaments, rendered inside the series shell.
 *
 * Both entry points use this — the profile index (which shows whatever is
 * current without a redirect) and the `[tid]` segment the strip links to — so
 * the two can't drift. It renders the SAME views the standalone
 * `/tournaments/[id]/` page does, in `embedded` mode: the banner, title and
 * status come from the shell's persistent hero instead.
 */
export async function SeriesTournamentPanel({
  entry,
  profileId,
  userId,
  host,
}: {
  entry: TournamentListEntry;
  profileId: string;
  userId: string;
  /** Request host, for the absolute share URL (server components can't read it). */
  host: string;
}) {
  // One remembered tab for the whole series: moving along the strip keeps the
  // member on the section they were reading (Bracket stays Bracket) instead of
  // resetting to each tournament's own last-opened tab.
  const tabStorageKey = `series:${profileId}`;
  // Always the standalone tournament URL: it is the canonical page, and it
  // opens correctly for someone with no context for the series.
  const shareUrl = `https://${host}/tournaments/${encodeURIComponent(entry.id)}/`;

  if (!isTournamentId(entry.id)) {
    const external = await getExternalTournament(entry.id);
    if (!external) notFound();
    return (
      <ExternalTournamentView
        tournament={external}
        shareUrl={shareUrl}
        shareMessage={tournamentShareText(external.name)}
        embedded
        tabStorageKey={tabStorageKey}
      />
    );
  }

  const tournament = await getTournament(entry.id);
  // Drafts are staff-only; members can't see them.
  if (!tournament || !isPublic(tournament.status)) notFound();

  return (
    <InternalTournamentView
      tournament={tournament}
      userId={userId}
      host={host}
      embedded
      tabStorageKey={tabStorageKey}
    />
  );
}
