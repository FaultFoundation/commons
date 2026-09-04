"use client";

import Link from "next/link";

import { GameLogo } from "@/components/brand/GameLogo";
import {
  DisplayPanel,
  IntegrationsPanel,
  ProfilePanel,
  SecurityPanel,
  type IntegrationsPanelData,
  type ProfilePanelData,
  type SecurityPanelData,
} from "@/components/dashboard/accounts/AccountPanels";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import type { PanelChrome } from "@/components/dashboard/bubbles/PanelChrome";
import { mergeChrome } from "@/components/dashboard/bubbles/PanelChrome";
import {
  CalendarPanel,
  ResultsPanel,
} from "@/components/dashboard/schedule/ScheduleView";
import { MatchPanel } from "@/components/dashboard/statistics/MatchPanel";
import { OverwatchPanel } from "@/components/dashboard/statistics/StatisticsPanels";
import { TeamsPanel } from "@/components/dashboard/teams/TeamsPanel";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { TournamentsPanel } from "@/components/dashboard/tournaments/TournamentsPanel";
import type { Density } from "@/lib/density";
import type { HomeWidgetId } from "@/lib/home-shared";
import type { ExternalTeamSummary } from "@/lib/player-data-shared";
import type { ScheduleEntry } from "@/lib/schedule-shared";
import type { MyTeam } from "@/lib/teams";
import type { TournamentLayout } from "@/lib/tournaments-shared";
import {
  TOURNAMENT_LAYOUT_DEFAULT,
  TOURNAMENT_STATUS_LABELS,
} from "@/lib/tournaments-shared";

// ---------------------------------------------------------------------------
// The Home board's widget map: widget id -> the REAL bubble from its own tab.
//
// Every case below mounts the same panel component the tab renders, handing it
// the board's `chrome` (span from the row rhythm, drag grip, reorder buttons).
// Nothing here re-implements a tab's bubble — that was the point of the panel
// refactor, and it's what keeps a change to a tab's card visible on Home for
// free. The lone exception is "At a Glance", which is a composite by design and
// has no tab of its own.
//
// Data arrives pre-fetched from app/home/page.tsx, which loads ONLY the sources
// the member's enabled widgets declare (lib/home-shared.ts `homeSourcesFor`).
// Every slice is optional for that reason: a widget whose source wasn't loaded
// renders its own empty state rather than throwing.
// ---------------------------------------------------------------------------

export type HomeData = {
  tournaments?: {
    entries: TournamentListEntry[];
    layout: TournamentLayout;
  };
  schedule?: {
    allUpcoming: ScheduleEntry[];
    upcoming: ScheduleEntry[];
    past: ScheduleEntry[];
    anyConnected: boolean;
  };
  teams?: { teams: MyTeam[]; external: ExternalTeamSummary[] };
  battlenet?: { linked: boolean; enabled: boolean; battletag: string | null };
  profile?: ProfilePanelData;
  security?: SecurityPanelData;
  display?: { density: Density };
  integrations?: IntegrationsPanelData;
};

export function HomeWidget({
  id,
  data,
  chrome,
}: {
  id: HomeWidgetId;
  data: HomeData;
  chrome: PanelChrome;
}) {
  switch (id) {
    case "overview":
      return <OverviewPanel data={data} chrome={chrome} />;

    case "tournaments":
      return (
        <TournamentsPanel
          tournaments={data.tournaments?.entries ?? []}
          initialLayout={data.tournaments?.layout ?? TOURNAMENT_LAYOUT_DEFAULT}
          chrome={chrome}
        />
      );

    case "schedule":
      return (
        <CalendarPanel
          allUpcoming={data.schedule?.allUpcoming ?? []}
          upcoming={data.schedule?.upcoming ?? []}
          anyConnected={data.schedule?.anyConnected ?? false}
          chrome={chrome}
        />
      );

    case "results":
      return (
        <ResultsPanel
          past={data.schedule?.past ?? []}
          anyConnected={data.schedule?.anyConnected ?? false}
          chrome={chrome}
        />
      );

    case "teams":
      return (
        <TeamsPanel
          teams={data.teams?.teams ?? []}
          external={data.teams?.external ?? []}
          chrome={chrome}
        />
      );

    case "statistics":
      return (
        <OverwatchPanel
          linked={data.battlenet?.linked ?? false}
          enabled={data.battlenet?.enabled ?? false}
          battletag={data.battlenet?.battletag ?? null}
          chrome={chrome}
        />
      );

    case "matches":
      return <MatchPanel chrome={chrome} />;

    case "profile":
      return data.profile ? (
        <ProfilePanel data={data.profile} chrome={chrome} />
      ) : null;

    case "security":
      return data.security ? (
        <SecurityPanel data={data.security} chrome={chrome} />
      ) : null;

    case "display":
      return data.display ? (
        <DisplayPanel density={data.display.density} chrome={chrome} />
      ) : null;

    case "integrations":
      return data.integrations ? (
        <IntegrationsPanel
          data={data.integrations}
          // Link from Home and the OAuth popup returns to Home, not Settings.
          callbackURL="/home/"
          chrome={chrome}
        />
      ) : null;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// At a Glance — the one composite widget, and the only place on the board that
// renders its own condensed rows. It exists because no single tab shows
// "what's live AND what's next" together; everything else on the board is a
// real bubble lifted from its tab.
// ---------------------------------------------------------------------------

function OverviewPanel({
  data,
  chrome,
}: {
  data: HomeData;
  chrome?: PanelChrome;
}) {
  const tournaments = (data.tournaments?.entries ?? [])
    .filter((t) => !isConcluded(t.status))
    .sort(byStart)
    .slice(0, 3);
  const matches = (data.schedule?.upcoming ?? []).slice(0, 3);

  return (
    <Bubble title="At a Glance" {...mergeChrome(chrome, { span: "full" })}>
      <div className="ff-hw-cols">
        <section>
          <p className="ff-hw-col__label">Active Tournaments</p>
          {tournaments.length ? (
            <div className="ff-hw-list">
              {tournaments.map((t) => (
                <Link
                  key={t.id}
                  className="ff-hw-row"
                  href={`/tournaments/${encodeURIComponent(t.id)}/`}
                  prefetch={false}
                >
                  <span className="ff-hw-row__mark">
                    <GameLogo name={t.game ?? null} logoUrl={t.gameLogoUrl ?? null} />
                  </span>
                  <span className="ff-hw-row__main">
                    <span className="ff-hw-row__title">{t.name}</span>
                    <span className="ff-hw-row__sub">
                      {formatDate(t.startsAt)}
                    </span>
                  </span>
                  <span
                    className={`ff-hw-tag${isLive(t.status) ? " ff-hw-tag--live" : ""}`}
                  >
                    {statusLabel(t.status)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="ff-hw-empty">Nothing active right now.</p>
          )}
          <Link className="ff-hw-more" href="/tournaments/" prefetch={false}>
            View all tournaments →
          </Link>
        </section>

        <section>
          <p className="ff-hw-col__label">Upcoming Matches</p>
          {matches.length ? (
            <div className="ff-hw-list">
              {matches.map((m) => (
                <MatchRow key={m.id} entry={m} />
              ))}
            </div>
          ) : (
            <p className="ff-hw-empty">No upcoming matches.</p>
          )}
          <Link className="ff-hw-more" href="/schedule/" prefetch={false}>
            Open schedule →
          </Link>
        </section>
      </div>
    </Bubble>
  );
}

/** One upcoming match. Links internally when we own the page, out to the
    provider when we don't, and stays inert when there's nowhere to go. */
function MatchRow({ entry }: { entry: ScheduleEntry }) {
  const inner = (
    <>
      <span className="ff-hw-row__main">
        <span className="ff-hw-row__title">{entry.title}</span>
        <span className="ff-hw-row__sub">
          {entry.opponent ? `vs ${entry.opponent}` : (entry.round ?? " ")}
        </span>
      </span>
      <span className="ff-hw-row__meta">{formatDateTime(entry.scheduledAt)}</span>
    </>
  );

  if (entry.href) {
    return (
      <Link className="ff-hw-row" href={entry.href} prefetch={false}>
        {inner}
      </Link>
    );
  }
  if (entry.url) {
    return (
      <a
        className="ff-hw-row"
        href={entry.url}
        target="_blank"
        rel="noreferrer noopener"
      >
        {inner}
      </a>
    );
  }
  return <div className="ff-hw-row ff-hw-row--static">{inner}</div>;
}

/** completed/cancelled are the concluded states; everything else is active. */
function isConcluded(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

function isLive(status: string): boolean {
  return status === "registration" || status === "active";
}

function statusLabel(status: string): string {
  return (
    TOURNAMENT_STATUS_LABELS[
      status as keyof typeof TOURNAMENT_STATUS_LABELS
    ] ?? status
  );
}

/** Undated entries sort last — a TBD date shouldn't outrank a real one. */
function byStart(a: TournamentListEntry, b: TournamentListEntry): number {
  if (a.startsAt == null) return 1;
  if (b.startsAt == null) return -1;
  return a.startsAt - b.startsAt;
}

function formatDate(ms: number | null): string {
  return ms
    ? new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date TBD";
}

function formatDateTime(ms: number | null): string {
  return ms
    ? new Date(ms).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date TBD";
}
