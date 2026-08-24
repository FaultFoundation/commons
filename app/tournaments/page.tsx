import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TournamentList } from "@/components/dashboard/tournaments/TournamentList";
import { getAuth } from "@/lib/auth";
import { listExternalTournaments } from "@/lib/external-tournaments";
import { listTournaments } from "@/lib/tournaments";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";

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

  // Internal (Challonge-backed) + external (cen-sql projection) tournaments,
  // merged into one unified list. External reads degrade to [] when cen-sql
  // isn't there, so the tab still renders the internal ones.
  const [internal, external] = await Promise.all([
    listTournaments({ excludeDraft: true }),
    listExternalTournaments(),
  ]);

  const internalEntries: TournamentListEntry[] = internal.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    status: t.status,
    entrantCount: t.entrantCount,
    maxParticipants: t.maxParticipants,
    startsAt: t.startsAt ? t.startsAt.getTime() : null,
    bannerUrl: t.bannerUrl,
  }));

  const externalEntries: TournamentListEntry[] = external.map((t) => ({
    id: t.id,
    name: t.name,
    format: "",
    status: t.status,
    entrantCount: t.numAttendees ?? 0,
    maxParticipants: null,
    startsAt: t.startAt ? t.startAt.getTime() : null,
    bannerUrl: null,
    source: t.source,
    externalUrl: t.url,
    game: t.game,
  }));

  // Newest first across both, undated last.
  const tournaments = [...internalEntries, ...externalEntries].sort(
    (a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0),
  );

  return (
    <DashboardShell active="tournaments" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Tournaments</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Tournaments" span="full">
          <TournamentList tournaments={tournaments} />
        </Bubble>
      </div>
    </DashboardShell>
  );
}
