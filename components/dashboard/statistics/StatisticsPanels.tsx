"use client";

import Link from "next/link";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  mergeChrome,
  type PanelChrome,
} from "@/components/dashboard/bubbles/PanelChrome";
import { PlayerDashboard } from "@/components/dashboard/statistics/PlayerDashboard";
import { StatLoading } from "@/components/dashboard/statistics/StatLoading";
import { playerPanelState } from "@/components/dashboard/statistics/StatisticsView";
import { usePlayerStats } from "@/components/dashboard/statistics/usePlayerStats";

/**
 * The Statistics tab's Overwatch career, as a pinnable bubble for Home.
 *
 * The TAB renders this content bare under its own profile header and Player /
 * Match tabs; a Home tile has no room for that chrome, so the panel wraps the
 * same `PlayerDashboard` and the same gate copy (`playerPanelState`) in one
 * bubble. Nothing here re-implements a stat — pinning it gets the real
 * dashboard, blur gate and all.
 *
 * Match Data has no wrapper of its own: `MatchPanel` already renders its bubble
 * and takes `chrome` directly.
 */
export function OverwatchPanel({
  linked,
  enabled,
  battletag,
  chrome,
}: {
  linked: boolean;
  enabled: boolean;
  battletag: string | null;
  chrome?: PanelChrome;
}) {
  // Same client-side fetch the tab does — never an SSR round-trip to OverFast.
  const { resp, loading, failed } = usePlayerStats(linked && enabled);

  const open = (
    <Link className="ff-btn ff-btn--outline ff-btn--sm" href="/statistics/">
      Open
    </Link>
  );

  if (!enabled || !linked) {
    return (
      <Bubble
        title="Overwatch Statistics"
        {...mergeChrome(chrome, { span: "full" })}
      >
        <p className="ff-bubble__lede">
          {enabled
            ? "Connect your Battle.net account to see your Overwatch player statistics here."
            : "Overwatch statistics are unavailable right now — Battle.net isn't configured."}
        </p>
        {enabled ? (
          <div className="ff-bubble__cta">
            <Link className="ff-btn ff-btn--outline" href="/account/">
              Connect Battle.net
            </Link>
          </div>
        ) : null}
      </Bubble>
    );
  }

  const state = playerPanelState({ resp, loading, failed });
  const title = state.kind === "message" ? state.title : "Overwatch Statistics";

  return (
    <Bubble
      title={title}
      {...mergeChrome(chrome, { span: "full", actions: open })}
    >
      {battletag ? <p className="ff-bubble__note">{battletag}</p> : null}
      {state.kind === "loading" ? (
        <StatLoading />
      ) : state.kind === "message" ? (
        state.body
      ) : (
        <PlayerDashboard
          data={state.data}
          heroes={state.heroes}
          stale={state.stale}
        />
      )}
    </Bubble>
  );
}
