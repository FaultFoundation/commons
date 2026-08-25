import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TeamCardGrid } from "@/components/dashboard/teams/TeamCardGrid";
import { TeamsActions } from "@/components/dashboard/teams/TeamsActions";
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

  const [myTeams, registration] = await Promise.all([
    listMyTeams(session.user.id),
    getRegistrationStateCached(session.user.id),
  ]);
  const verified = registration?.status === "VERIFIED";

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Teams</h1>

      {/* Starting, finding and recruiting are actions, not cards — the tab
          itself is the member's teams. */}
      <TeamsActions verified={verified} />

      {/* The cards are rearrangeable, so the order lives client-side — the
          reads all still happen here. */}
      {myTeams.length ? (
        <TeamCardGrid teams={myTeams} />
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
