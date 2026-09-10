import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { SeriesList } from "@/components/dashboard/series/SeriesList";
import { TournamentCards } from "@/components/dashboard/tournaments/TournamentList";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import { getSessionCached } from "@/lib/session";
import { isDiscordSourced } from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Series",
  robots: { index: false },
};

/**
 * The Series tab — grouped competition, kept off the flat /tournaments/ list.
 *
 * Deliberately lightweight: it reads the SAME `loadTournamentEntries()` the
 * Tournaments tab does and groups it in the browser-facing components, rather
 * than adding a query path of its own. Nothing here is a second source of
 * truth, so a tournament can never appear under a series it isn't in.
 */
export default async function SeriesPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const tournaments = await loadTournamentEntries();
  // The one surface that shows them: everywhere else runs the complementary
  // `withoutDiscordSourced`. Internal Commons tournaments leave `source` unset
  // (they read as Challonge), so this is only ever collector-written rows.
  const discord = tournaments.filter(isDiscordSourced);
  const leagueos = tournaments.filter(t => t.source === "leagueos");

  return (
    <DashboardShell
      active="experimental"
      activeChild="series"
      setupUserId={session.user.id}
    >
      <h1 className="screen-reader-text">Series</h1>
      <div className="ff-bubble-grid">
        {/* Both bubbles pass `titleHidden`: each section renders its own
            .ff-list-heading (name + dim count), the shape the tournaments grid
            uses, so the card carries one heading rather than two. */}
        <Bubble title="Series & Leagues" titleHidden span="full">
          <SeriesList tournaments={tournaments} />
        </Bubble>

        <Bubble title="LeagueOS" titleHidden span="full">
          <div className="ff-list-heading">
            <h2>LeagueOS</h2>
            <span className="ff-list-count">{leagueos.length} tournaments</span>
          </div>
          <TournamentCards
            tournaments={leagueos}
            empty="No LeagueOS tournaments have been collected yet. Public collegiate leagues will appear here after the collector runs."
          />
        </Bubble>

        <Bubble title="Discord Tournaments" titleHidden span="full">
          <div className="ff-list-heading">
            <h2>Discord Tournaments</h2>
            <span className="ff-list-count">{discord.length} tournaments</span>
          </div>
          <TournamentCards
            tournaments={discord}
            empty="No Discord tournaments have been recorded yet. Tournaments a collector writes with a Discord source will appear here."
          />
        </Bubble>
      </div>
    </DashboardShell>
  );
}
