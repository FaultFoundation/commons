import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schedule",
  robots: { index: false },
};

export default async function SchedulePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <DashboardShell active="schedule" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Schedule</h1>
      <div className="ff-bubble-grid">
        {/* The top bubble of a tab always spans the grid — see the guide. */}
        <Bubble title="Upcoming Matches" variant="wip" span="full">
          <div className="ff-bubble__wip">
            Your next matches land here once you&rsquo;re on a roster.
          </div>
        </Bubble>
        <Bubble title="Results" variant="wip">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
      </div>
    </DashboardShell>
  );
}
