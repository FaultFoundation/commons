import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { HomeBoard, type HomeTournament } from "@/components/dashboard/home/HomeBoard";
import { asHomeLayout } from "@/lib/home-shared";
import { getProfileCached } from "@/lib/registration";
import { loadSchedule } from "@/lib/schedule";
import { getSessionCached } from "@/lib/session";
import { listMyTeams } from "@/lib/teams";
import { listTournaments } from "@/lib/tournaments";
import { TOURNAMENT_STATUS_LABELS } from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false },
};

/** completed/cancelled are the concluded states; everything else is active. */
function isConcluded(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export default async function HomePage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }
  const userId = session.user.id;
  const hdrs = await headers();

  // Every widget's data is fetched once here (regardless of which widgets the
  // member has enabled), so toggling a widget on Home is instant. Each read is
  // the same source the matching tab uses, so Home can't drift from it.
  const [teams, tournamentItems, schedule, profile] = await Promise.all([
    listMyTeams(userId),
    listTournaments({ excludeDraft: true }),
    loadSchedule(userId, hdrs),
    getProfileCached(userId),
  ]);

  const tournaments: HomeTournament[] = tournamentItems
    .filter((t) => !isConcluded(t.status))
    .sort((a, b) => {
      const at = a.startsAt?.getTime() ?? null;
      const bt = b.startsAt?.getTime() ?? null;
      if (at == null) return 1;
      if (bt == null) return -1;
      return at - bt;
    })
    .slice(0, 8)
    .map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      statusLabel:
        TOURNAMENT_STATUS_LABELS[
          t.status as keyof typeof TOURNAMENT_STATUS_LABELS
        ] ?? t.status,
      live: t.status === "registration" || t.status === "active",
      startsAt: t.startsAt ? t.startsAt.getTime() : null,
      gameName: t.gameName,
      gameLogoUrl: t.gameLogoUrl,
    }));

  const layout = asHomeLayout(profile?.homeLayout ?? null);

  return (
    <DashboardShell active="home" setupUserId={userId}>
      <h1 className="screen-reader-text">Home</h1>
      <HomeBoard
        initialLayout={layout}
        tournaments={tournaments}
        matches={schedule.upcoming}
        teams={teams}
      />
    </DashboardShell>
  );
}
