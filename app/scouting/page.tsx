import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ScoutingView } from "@/components/dashboard/scouting/ScoutingView";
import { faceitSearchConfigured } from "@/lib/faceit-scouting";
import { getPlatformIdentityCached } from "@/lib/platform-identities";
import { getSessionCached } from "@/lib/session";

// Session-gated. Like Statistics, the heavy work (the FACEIT search + read)
// happens client-side behind a loading bar via /api/scouting/*; this page only
// renders the shell instantly and seeds the search box with the member's own
// linked FACEIT handle (a convenient default — they can search anyone).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scouting",
  robots: { index: false },
};

export default async function ScoutingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = await searchParams;
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const identity = await getPlatformIdentityCached(session.user.id, "faceit");

  return (
    <DashboardShell active="experimental" activeChild="scouting" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Scouting</h1>
      <ScoutingView
        // An explicit ?q= wins; otherwise seed with the member's own FACEIT
        // nickname if they've linked one, so the first search has a target.
        initialQuery={query.q ?? identity?.handle ?? ""}
        searchEnabled={faceitSearchConfigured()}
      />
    </DashboardShell>
  );
}
