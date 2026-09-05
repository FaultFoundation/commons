import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { StatisticsView } from "@/components/dashboard/statistics/StatisticsView";
import { getAccountLinksCached } from "@/lib/account-links";
import { battlenetAuthEnabled } from "@/lib/auth";
import { getPlatformIdentityCached } from "@/lib/platform-identities";
import { getSessionCached } from "@/lib/session";

// Session-gated. The heavy OverFast work happens client-side (behind a loading
// bar) via /api/statistics/player — this page only renders the shell instantly
// and hands the client what it needs to avoid a flash: whether Battle.net is
// linked/enabled and the BattleTag (so the profile header can show a name while
// the rest loads).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Statistics",
  robots: { index: false },
};

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ tab?: string; team?: string }> }) {
  const query = await searchParams;
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const userId = session.user.id;

  const [links, identity] = await Promise.all([
    getAccountLinksCached(userId),
    getPlatformIdentityCached(userId, "battlenet"),
  ]);
  const linked = links.some((r) => r.providerId === "battlenet");

  return (
    <DashboardShell active="statistics" setupUserId={userId}>
      <h1 className="screen-reader-text">Statistics</h1>
      <StatisticsView
        initialTab={query.tab === "team" || query.team ? "team" : query.tab === "match" ? "match" : "player"}
        initialTeam={query.team ?? ""}
        linked={linked}
        enabled={battlenetAuthEnabled()}
        battletag={identity?.handle ?? null}
      />
    </DashboardShell>
  );
}
