import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getSessionCached } from "@/lib/session";

// The shell lives here (not in each page) so route-segment loading.tsx /
// error.tsx render INSIDE the content area, beside the nav rail — the rail
// stays mounted across the list ↔ detail navigation and while data reloads,
// instead of the whole page (shell included) being replaced by a centered
// skeleton and then jumping back into place.
export const dynamic = "force-dynamic";

export default async function TournamentsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  return (
    <DashboardShell active="tournaments" setupUserId={session.user.id}>
      {children}
    </DashboardShell>
  );
}
