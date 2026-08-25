import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ScheduleView } from "@/components/dashboard/schedule/ScheduleView";
import { listUpcomingExternalScheduleEntries } from "@/lib/external-tournaments";
import { getSessionCached } from "@/lib/session";
import { loadConnectIntegrations } from "@/lib/integrations";
import { loadSchedule } from "@/lib/schedule";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Schedule",
  robots: { index: false },
};

export default async function SchedulePage() {
  const requestHeaders = await headers();
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const userId = session.user.id;
  // Sync-on-read + the calendar, and the connect state (to steer the empty
  // state toward Integrations when nothing is linked). Both are best-effort and
  // degrade to an empty calendar rather than failing the page.
  const [{ upcoming, past }, allUpcoming, connects] = await Promise.all([
    loadSchedule(userId, requestHeaders),
    listUpcomingExternalScheduleEntries(),
    loadConnectIntegrations(userId),
  ]);
  const anyConnected = connects.some((c) => c.linked);

  return (
    <DashboardShell active="schedule" setupUserId={userId}>
      <h1 className="screen-reader-text">Schedule</h1>
      <ScheduleView
        allUpcoming={allUpcoming}
        upcoming={upcoming}
        past={past}
        anyConnected={anyConnected}
      />
    </DashboardShell>
  );
}
