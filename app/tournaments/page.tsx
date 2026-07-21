import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournaments",
  robots: { index: false },
};

export default async function TournamentsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <DashboardShell active="tournaments" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Tournaments</h1>
      <div className="ff-bubble-grid">
        {/* Setup step 3 deep-links here (/tournaments/#overfault), so the
            id has to stay stable. */}
        <Bubble id="overfault" title="Overfault" variant="wip" span="full">
          <div className="ff-bubble__wip">
            Registration, brackets, and standings land here.
          </div>
        </Bubble>
      </div>
    </DashboardShell>
  );
}
