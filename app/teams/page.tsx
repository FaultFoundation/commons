import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TeamCardGrid } from "@/components/dashboard/teams/TeamCardGrid";
import { TeamsActions } from "@/components/dashboard/teams/TeamsActions";
import {
  PlayerDataAutoRefresh,
  PlayerDataRefreshButton,
} from "@/components/dashboard/teams/PlayerDataRefresh";
import { listGames } from "@/lib/games";
import { getExternalTeamsForUser } from "@/lib/player-data";
import { getRegistrationStateCached } from "@/lib/registration";
import { getSessionCached } from "@/lib/session";
import { listMyTeams } from "@/lib/teams";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams",
  robots: { index: false },
};

export default async function TeamsPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const [myTeams, externalTeams, registration, games] = await Promise.all([
    listMyTeams(session.user.id),
    // D1-only (no provider calls) — freshness comes from the client top-up
    // below plus the ow-data cron, so this render stays fast.
    getExternalTeamsForUser(session.user.id),
    getRegistrationStateCached(session.user.id),
    listGames(),
  ]);
  const verified = registration?.status === "VERIFIED";

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Teams</h1>

      {/* Starting, finding and recruiting are actions, not cards — the tab
          itself is the member's teams. */}
      <TeamsActions verified={verified} games={games} />

      {/* External teams sync lazily after paint; the icon forces a re-pull. */}
      <div className="ff-pd-toolbar">
        <PlayerDataAutoRefresh />
        <PlayerDataRefreshButton />
      </div>

      {/* The cards are rearrangeable, so the order lives client-side — the
          reads all still happen here. External (FACEIT/start.gg) teams render
          inline after the member's internal cards. */}
      {myTeams.length || externalTeams.length ? (
        <TeamCardGrid teams={myTeams} external={externalTeams} />
      ) : (
        <div className="ff-bubble-grid">
          <Bubble title="No Teams Yet" span="full">
            <p className="ff-auth__hint">
              Start a team above and invite your players with a link — or open
              the invite link a captain sent you and you&rsquo;ll land on their
              roster.
            </p>
          </Bubble>
        </div>
      )}
    </DashboardShell>
  );
}
