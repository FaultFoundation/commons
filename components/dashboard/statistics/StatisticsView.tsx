"use client";
import { TeamStatisticsPanel } from "@/components/dashboard/statistics/TeamStatisticsPanel";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { MatchPanel } from "@/components/dashboard/statistics/MatchPanel";
import { PlayerDashboard } from "@/components/dashboard/statistics/PlayerDashboard";
import { StatLoading } from "@/components/dashboard/statistics/StatLoading";
import { usePlayerStats } from "@/components/dashboard/statistics/usePlayerStats";
import type { OverfastSummary } from "@/lib/overfast";
import {
  OW_ROLES,
  ROLE_LABELS,
  formatRank,
  type PlayerSnapshot,
  type PlayerStatsResponse,
} from "@/lib/ow-stats-shared";

// The whole Statistics surface. Replaces the old rail slide-out: Statistics is
// now a plain top-level tab, and the Player Data / Match Data switch is
// browser-style tabs INSIDE the page, under the shared profile header. The heavy
// OverFast work runs behind a loading bar (StatLoading) via the API route, so
// the page never freezes on an SSR render.

type Tab = "player" | "match" | "team";

export function StatisticsView({
  initialTab = "player",
  initialTeam = "",
  linked,
  enabled,
  battletag,
}: {
  initialTab?: Tab;
  initialTeam?: string;
  linked: boolean;
  enabled: boolean;
  battletag: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const { resp, loading, failed } = usePlayerStats(linked && tab === "player");

  // Battle.net gates only the PLAYER tab (it's the Overwatch data source);
  // Match Data aggregates FACEIT / start.gg / Challonge and must stay reachable
  // for a member who linked those but not Battle.net — so the unconfigured /
  // unlinked states render as the Player Data panel body, never a page-level
  // early return that would hide the tabs.
  const playerGate = !enabled ? (
    <Bubble title="Overwatch Statistics" span="full">
      <p className="ff-bubble__lede">
        Overwatch statistics are unavailable right now — Battle.net isn&apos;t
        configured.
      </p>
    </Bubble>
  ) : !linked ? (
    <Bubble title="Overwatch Statistics" span="full">
      <p className="ff-bubble__lede">
        Connect your Battle.net account to see your Overwatch player statistics
        here.
      </p>
      <div className="ff-bubble__cta">
        <Link className="ff-btn ff-btn--outline" href="/account/">
          Connect Battle.net
        </Link>
      </div>
    </Bubble>
  ) : null;

  return (
    <div className="ff-owpage">
      {linked && tab === "player" ? (
        <ProfileHeader resp={resp} loading={loading} battletag={battletag} />
      ) : null}

      <div className="ff-owtabs" role="tablist" aria-label="Statistics views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "player"}
          className={`ff-owtab${tab === "player" ? " ff-owtab--active" : ""}`}
          onClick={() => setTab("player")}
        >
          Player Data
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "match"}
          className={`ff-owtab${tab === "match" ? " ff-owtab--active" : ""}`}
          onClick={() => setTab("match")}
        >
          Match Data
        </button>
        <button type="button" role="tab" aria-selected={tab === "team"} className={`ff-owtab${tab === "team" ? " ff-owtab--active" : ""}`} onClick={() => setTab("team")}>Team Data</button>
      </div>

      {tab === "team" ? <TeamStatisticsPanel initialTeam={initialTeam} /> : tab === "player" ? (
        (playerGate ?? (
          <PlayerPanel resp={resp} loading={loading} failed={failed} />
        ))
      ) : (
        // Cross-platform match history (FACEIT / start.gg / Challonge) — not
        // tied to Battle.net, so it renders regardless of the OW link state.
        <MatchPanel />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile header — shared across both tabs. Shows the BattleTag immediately
// (from the server), then fills in avatar / title / endorsement / a compact stat
// strip once the fetch lands.
// ---------------------------------------------------------------------------

function ProfileHeader({
  resp,
  loading,
  battletag,
}: {
  resp: PlayerStatsResponse | null;
  loading: boolean;
  battletag: string | null;
}) {
  const latest = resp?.data?.latest ?? null;
  const name = latest?.battletag ?? battletag ?? "Your Overwatch Profile";

  return (
    <section
      className="ff-card ff-bubble ff-bubble--full ff-owprofile"
      style={
        latest?.namecardUrl
          ? { backgroundImage: `url(${JSON.stringify(latest.namecardUrl)})` }
          : undefined
      }
    >
      <div className="ff-owprofile__scrim" />
      <div className="ff-owprofile__body">
        {latest?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="ff-owprofile__avatar"
            src={latest.avatarUrl}
            alt=""
            width={72}
            height={72}
          />
        ) : (
          <div
            className={`ff-owprofile__avatar ff-owprofile__avatar--empty${loading ? " ff-owskel" : ""}`}
            aria-hidden="true"
          />
        )}
        <div className="ff-owprofile__meta">
          <h2 className="ff-owprofile__name">{name}</h2>
          <div className="ff-owprofile__sub">
            {latest?.title ? (
              <span className="ff-owprofile__title">{latest.title}</span>
            ) : null}
            {latest?.endorsementLevel != null ? (
              <span className="ff-owbadge">
                Endorsement {latest.endorsementLevel}
              </span>
            ) : null}
            {latest?.compSeason != null ? (
              <span className="ff-owprofile__season">
                Season {latest.compSeason}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {/* Competitive ranks — the one accurate thing Blizzard's public data still
          reports — sit under the endorsement row as the header's headline. */}
      {latest ? (
        <HeaderRanks latest={latest} summary={resp?.data?.summary ?? null} />
      ) : null}
    </section>
  );
}

/** The per-role competitive rank badges shown in the profile header. */
function HeaderRanks({
  latest,
  summary,
}: {
  latest: PlayerSnapshot;
  summary: OverfastSummary | null;
}) {
  const platform = latest.platform === "console" ? "console" : "pc";
  const comp = summary?.competitive?.[platform] ?? null;
  const ranked = OW_ROLES.map((role) => ({
    role,
    rank: latest.ranks[role],
    icon: comp?.[role]?.rank_icon ?? comp?.[role]?.tier_icon ?? null,
  })).filter((r) => r.rank.division);

  if (ranked.length === 0) {
    return (
      <p className="ff-owprofile__norank">No competitive rank this season.</p>
    );
  }

  return (
    <div className="ff-owprofile__ranks">
      {ranked.map(({ role, rank, icon }) => (
        <div className="ff-owrankbadge" data-role={role} key={role}>
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ff-owrankbadge__icon" src={icon} alt="" />
          ) : null}
          <div className="ff-owrankbadge__text">
            <span className="ff-owrankbadge__role">{ROLE_LABELS[role]}</span>
            <span className="ff-owrankbadge__rank">{formatRank(rank)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Player Data body: loading bar → gate states → the dashboard.
//
// Resolved as a STATE rather than rendered inline, because two hosts show it:
// this tab (bare, under the profile header) and the Home board's pinned
// "Overwatch Statistics" bubble. Keeping the copy here means the gate wording
// can't drift between the two — see StatisticsPanels.tsx.
// ---------------------------------------------------------------------------

export type PlayerPanelState =
  | { kind: "loading" }
  | { kind: "message"; title: string; body: ReactNode }
  | {
      kind: "dashboard";
      data: NonNullable<PlayerStatsResponse["data"]>;
      heroes: PlayerStatsResponse["heroes"];
      stale: boolean;
    };

export function playerPanelState({
  resp,
  loading,
  failed,
}: {
  resp: PlayerStatsResponse | null;
  loading: boolean;
  failed: boolean;
}): PlayerPanelState {
  if (loading) return { kind: "loading" };

  if (failed || !resp) {
    return {
      kind: "message",
      title: "Overwatch Statistics",
      body: (
        <>
          <p className="ff-bubble__lede">
            We couldn&apos;t load your statistics just now.
          </p>
          <p className="ff-bubble__note">
            This is usually temporary — reload the page in a moment.
          </p>
        </>
      ),
    };
  }

  if (resp.visibility === "not_found") {
    return {
      kind: "message",
      title: "Overwatch Statistics",
      body: (
        <>
          <p className="ff-bubble__lede">
            We couldn&apos;t find an Overwatch profile for{" "}
            <strong>{resp.battletag}</strong>.
          </p>
          <p className="ff-bubble__note">
            Double-check the BattleTag on your account, and that you&apos;ve
            played Overwatch on it. If you just linked Battle.net, it may take a
            little while to appear.
          </p>
          <div className="ff-bubble__cta">
            <Link className="ff-btn ff-btn--outline" href="/account/">
              Check your Battle.net link
            </Link>
          </div>
        </>
      ),
    };
  }

  if (resp.visibility === "private") {
    return {
      kind: "message",
      title: "Your Overwatch Profile Is Private",
      body: (
        <>
          <p className="ff-bubble__lede">
            To view your player statistics, set your Overwatch career profile to
            public.
          </p>
          <p className="ff-bubble__note">
            In Overwatch:{" "}
            <strong>
              Options → Social → Career Profile Visibility → Everyone
            </strong>
            . If you&apos;ve already made it public, it can take up to an hour
            for the data source to catch up — check back a little later.
          </p>
        </>
      ),
    };
  }

  if (!resp.data) {
    return {
      kind: "message",
      title: "Overwatch Statistics",
      body: (
        <>
          <p className="ff-bubble__lede">
            {resp.visibility === "unknown"
              ? "We couldn't reach the Overwatch statistics service just now."
              : "We're collecting your first snapshot."}
          </p>
          <p className="ff-bubble__note">
            Check back in a moment — your statistics will appear here, and
            we&apos;ll keep a daily snapshot so you can track your progress over
            time.
          </p>
        </>
      ),
    };
  }

  return {
    kind: "dashboard",
    data: resp.data,
    heroes: resp.heroes,
    stale: resp.visibility !== "public",
  };
}

function PlayerPanel(props: {
  resp: PlayerStatsResponse | null;
  loading: boolean;
  failed: boolean;
}) {
  const state = playerPanelState(props);
  if (state.kind === "loading") return <StatLoading />;
  if (state.kind === "message") {
    return (
      <Bubble title={state.title} span="full">
        {state.body}
      </Bubble>
    );
  }
  return (
    <PlayerDashboard
      data={state.data}
      heroes={state.heroes}
      stale={state.stale}
    />
  );
}
