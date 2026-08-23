import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TournamentList } from "@/components/dashboard/tournaments/TournamentList";
import { getAuth } from "@/lib/auth";
import { listTournaments } from "@/lib/tournaments";

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

  const tournaments = await listTournaments({ excludeDraft: true });

  return (
    <DashboardShell active="tournaments" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Tournaments</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Tournaments" span="full">
          <TournamentList
            tournaments={tournaments.map((t) => ({
              id: t.id,
              name: t.name,
              format: t.format,
              status: t.status,
              entrantCount: t.entrantCount,
              maxParticipants: t.maxParticipants,
              startsAt: t.startsAt ? t.startsAt.getTime() : null,
              bannerUrl: t.bannerUrl,
            }))}
          />
        </Bubble>
      </div>
    </DashboardShell>
  );
}
