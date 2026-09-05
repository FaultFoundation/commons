import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ScheduleView } from "@/components/dashboard/schedule/ScheduleView";
import { listUpcomingExternalScheduleEntries } from "@/lib/external-tournaments";
import { getSessionCached } from "@/lib/session";
import { getAccountLinksCached } from "@/lib/account-links";
import { DashboardDataRefresh } from "@/components/dashboard/DashboardDataRefresh";
import { loadSchedule } from "@/lib/schedule";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schedule",
  robots: { index: false },
};

export default async function SchedulePage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const userId = session.user.id;
  // Cached calendar and account links only; provider work starts after paint.
  const [{ upcoming, past }, allUpcoming, connects] = await Promise.all([
    loadSchedule(userId),
    listUpcomingExternalScheduleEntries(),
    getAccountLinksCached(userId),
  ]);
  const anyConnected = connects.some((c) => ["faceit", "startgg", "challonge"].includes(c.providerId));

  return (
    <DashboardShell active="schedule" setupUserId={userId}>
      <h1 className="screen-reader-text">Schedule</h1>
      <DashboardDataRefresh schedule />
      <ScheduleView
        allUpcoming={allUpcoming}
        upcoming={upcoming}
        past={past}
        anyConnected={anyConnected}
      />
    </DashboardShell>
  );
}
