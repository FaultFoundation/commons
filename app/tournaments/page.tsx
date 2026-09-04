import type { Metadata } from "next";
import { cookies } from "next/headers";

import { TournamentsPanel } from "@/components/dashboard/tournaments/TournamentsPanel";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import {
  TOURNAMENT_LAYOUT_COOKIE,
  asTournamentLayout,
} from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments",
  robots: { index: false },
};

// Auth + the dashboard shell are handled by app/tournaments/layout.tsx.
export default async function TournamentsPage() {
  // Internal (Challonge-backed) + external (cen-sql projection) tournaments,
  // merged into one unified list — the same loader the Home board's pinned
  // Tournaments bubble uses, so the two can't disagree.
  const tournaments = await loadTournamentEntries();
  const initialLayout = asTournamentLayout(
    (await cookies()).get(TOURNAMENT_LAYOUT_COOKIE)?.value,
  );

  return (
    <>
      <h1 className="screen-reader-text">Tournaments</h1>
      <div className="ff-bubble-grid">
        <TournamentsPanel
          tournaments={tournaments}
          initialLayout={initialLayout}
        />
      </div>
    </>
  );
}
