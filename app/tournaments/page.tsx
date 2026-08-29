import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TournamentList } from "@/components/dashboard/tournaments/TournamentList";
import { listExternalTournaments } from "@/lib/external-tournaments";
import { listTournaments } from "@/lib/tournaments";
import {
  TOURNAMENT_LAYOUT_COOKIE,
  asTournamentLayout,
} from "@/lib/tournaments-shared";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments",
  robots: { index: false },
};

// Auth + the dashboard shell are handled by app/tournaments/layout.tsx.
export default async function TournamentsPage() {
  // Internal (Challonge-backed) + external (cen-sql projection) tournaments,
  // merged into one unified list. External reads degrade to [] when cen-sql
  // isn't there, so the tab still renders the internal ones.
  const [internal, external] = await Promise.all([
    listTournaments({ excludeDraft: true }),
    listExternalTournaments(),
  ]);

  const internalEntries: TournamentListEntry[] = internal.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    status: t.status,
    entrantCount: t.entrantCount,
    maxParticipants: t.maxParticipants,
    startsAt: t.startsAt ? t.startsAt.getTime() : null,
    bannerUrl: t.bannerUrl,
    featured: t.featured,
    game: t.gameName,
    gameLogoUrl: t.gameLogoUrl,
  }));

  const externalEntries: TournamentListEntry[] = external.map((t) => ({
    id: t.id,
    name: t.name,
    format: "",
    status: t.status,
    entrantCount: t.numAttendees ?? 0,
    maxParticipants: null,
    startsAt: t.startAt ? t.startAt.getTime() : null,
    bannerUrl: t.bannerUrl,
    featured: false,
    source: t.source,
    externalUrl: t.url,
    game: t.game,
    gameLogoUrl: null,
  }));

  // All entries; ordering and the featured/date split are decided in the client
  // list (which already owns filtering, so a round trip per view would be a
  // billed request for work a sort already does).
  const tournaments = [...internalEntries, ...externalEntries];
  const initialLayout = asTournamentLayout(
    (await cookies()).get(TOURNAMENT_LAYOUT_COOKIE)?.value,
  );

  return (
    <>
      <h1 className="screen-reader-text">Tournaments</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Tournaments" span="full">
          <TournamentList
            tournaments={tournaments}
            initialLayout={initialLayout}
          />
        </Bubble>
      </div>
    </>
  );
}
