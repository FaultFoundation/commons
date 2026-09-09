import { discoveryFollowIds } from "@/lib/discovery";
import { getSessionCached } from "@/lib/session";
import { DashboardDataRefresh } from "@/components/dashboard/DashboardDataRefresh";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PackedTournamentsPanel } from "@/components/dashboard/tournaments/PackedTournamentsPanel";
import { packTournamentEntries } from "@/lib/tournament-wire";
import { cookies } from "next/headers";

import { loadTournamentEntries } from "@/lib/tournament-entries";
import {
  TOURNAMENT_LAYOUT_COOKIE,
  asTournamentLayout,
  withoutDiscordSourced,
} from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments",
  robots: { index: false },
};

// The layout supplies the shell; this page must gate its own concurrent reads.
export default async function TournamentsPage() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  // Internal (Challonge-backed) + external (cen-sql projection) tournaments,
  // merged into one unified list — the same loader the Home board's pinned
  // Tournaments bubble uses, so the two can't disagree.
  // Discord-sourced tournaments are Series-tab only, so they never reach the
  // general list — including its counts, filters, pagination and featured hero.
  const tournaments = withoutDiscordSourced(await loadTournamentEntries());
  const follows = await discoveryFollowIds(session.user.id);
  const initialLayout = asTournamentLayout(
    (await cookies()).get(TOURNAMENT_LAYOUT_COOKIE)?.value,
  );

  return (
    <>
      <h1 className="screen-reader-text">Tournaments</h1>
      <DashboardDataRefresh tournaments />
      <div className="ff-bubble-grid">
        <PackedTournamentsPanel
          tournaments={packTournamentEntries(tournaments)}
          initialLayout={initialLayout}
          follows={follows}
        />
      </div>
    </>
  );
}
