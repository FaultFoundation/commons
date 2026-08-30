import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Match Statistics",
  robots: { index: false },
};

export default async function MatchStatsPage() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  return (
    <DashboardShell active="statistics" activeChild="match" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Match Statistics</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Match Statistics" variant="wip" span="full">
          <div className="ff-bubble__wip">
            Per-match history, session tracking, and trends — coming soon. Player
            Data is live now under the Statistics tab.
          </div>
        </Bubble>
      </div>
    </DashboardShell>
  );
}
