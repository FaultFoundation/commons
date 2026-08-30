import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { PlayerStatsView } from "@/components/dashboard/statistics/PlayerStatsView";
import { battlenetAuthEnabled } from "@/lib/auth";
import {
  captureSnapshot,
  getOwVisibility,
  loadPlayerStats,
} from "@/lib/ow-stats";
import { getPlatformIdentityCached } from "@/lib/platform-identities";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request (also does the lazy snapshot).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Player Statistics",
  robots: { index: false },
};

export default async function PlayerStatsPage() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const userId = session.user.id;

  const battlenet = await getPlatformIdentityCached(userId, "battlenet");
  const battletag = battlenet?.handle ?? null;

  return (
    <DashboardShell active="statistics" activeChild="player" setupUserId={userId}>
      <h1 className="screen-reader-text">Overwatch Player Statistics</h1>
      <div className="ff-bubble-grid">{await content(userId, battletag)}</div>
    </DashboardShell>
  );
}

async function content(userId: string, battletag: string | null) {
  if (!battletag) {
    return (
      <Bubble title="Overwatch Statistics" span="full">
        <p className="ff-bubble__lede">
          {battlenetAuthEnabled()
            ? "Connect your Battle.net account to see your Overwatch player statistics here."
            : "Overwatch statistics are unavailable right now. Battle.net isn't configured."}
        </p>
        {battlenetAuthEnabled() ? (
          <div className="ff-bubble__cta">
            <Link className="ff-btn ff-btn--outline" href="/account/">
              Connect Battle.net
            </Link>
          </div>
        ) : null}
      </Bubble>
    );
  }

  const visibility = await getOwVisibility(userId, battletag);

  if (visibility === "not_found") {
    return (
      <Bubble title="Overwatch Statistics" span="full">
        <p className="ff-bubble__lede">
          We couldn&apos;t find an Overwatch profile for{" "}
          <strong>{battletag}</strong>.
        </p>
        <p className="ff-bubble__note">
          Double-check the BattleTag on your account is correct and that
          you&apos;ve played Overwatch on it. If you just linked Battle.net, the
          profile may take a little while to appear.
        </p>
        <div className="ff-bubble__cta">
          <Link className="ff-btn ff-btn--outline" href="/account/">
            Check your Battle.net link
          </Link>
        </div>
      </Bubble>
    );
  }

  if (visibility === "private") {
    return (
      <Bubble title="Your Overwatch Profile Is Private" span="full">
        <p className="ff-bubble__lede">
          To view your player statistics, set your Overwatch career profile to
          public.
        </p>
        <p className="ff-bubble__note">
          In Overwatch: <strong>Options → Social → Career Profile Visibility →
          Everyone</strong>. If you&apos;ve already made it public, it can take up
          to an hour for the data source to catch up — check back a little later.
        </p>
      </Bubble>
    );
  }

  if (visibility === "unknown") {
    // Couldn't reach the data source — show the last snapshot if we have one
    // rather than a hard error.
    const data = await loadPlayerStats(userId);
    if (data) {
      return <PlayerStatsView data={data} battletag={battletag} stale />;
    }
    return (
      <Bubble title="Overwatch Statistics" span="full">
        <p className="ff-bubble__lede">
          We couldn&apos;t reach the Overwatch statistics service just now.
        </p>
        <p className="ff-bubble__note">
          This is usually temporary — refresh in a few minutes.
        </p>
      </Bubble>
    );
  }

  // public — take/refresh a snapshot (guarded to ~1/day) then render.
  await captureSnapshot(userId, battletag);
  const data = await loadPlayerStats(userId);

  if (!data) {
    return (
      <Bubble title="Overwatch Statistics" span="full">
        <p className="ff-bubble__lede">
          We&apos;re collecting your first snapshot for{" "}
          <strong>{battletag}</strong>.
        </p>
        <p className="ff-bubble__note">
          Check back in a moment — your statistics will appear here, and we&apos;ll
          keep taking a snapshot each day so you can track your progress over time.
        </p>
      </Bubble>
    );
  }

  return <PlayerStatsView data={data} battletag={battletag} />;
}
