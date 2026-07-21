import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams",
  robots: { index: false },
};

export default async function TeamsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Teams</h1>
      <div className="ff-bubble-grid">
        <Bubble title="My Team" variant="wip">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
        <Bubble title="Find a Team" variant="wip">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
      </div>
    </DashboardShell>
  );
}
