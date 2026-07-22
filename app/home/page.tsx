import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false },
};

export default async function HomePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <DashboardShell active="home" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Home</h1>
      <div className="ff-bubble-grid">
        {/* The top bubble of a tab always spans the grid — see the guide. */}
        <Bubble title="My Tournaments" variant="wip" span="full">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
        <Bubble title="My Team" variant="wip">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
      </div>
    </DashboardShell>
  );
}
