"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { setHomeLayout } from "@/app/home/actions";
import { GameLogo } from "@/components/brand/GameLogo";
import { Avatar } from "@/components/dashboard/Avatar";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { DragGrip } from "@/components/dashboard/bubbles/DragGrip";
import { useReorderableGrid } from "@/components/dashboard/bubbles/useReorderableGrid";
import {
  HOME_WIDGETS,
  type HomeWidgetId,
} from "@/lib/home-shared";
import type { MyTeam } from "@/lib/teams";
import type { ScheduleEntry } from "@/lib/schedule-shared";
import { TEAM_ROLE_LABELS } from "@/lib/teams-shared";

// The Home tab: a customizable board of draggable widgets, each a condensed view
// of another tab. The server fetches ALL widget data once and hands it down, so
// toggling a widget on/off (the "+" customize popup) is instant and dragging
// only reorders. Layout persists to profiles.home_layout via setHomeLayout.
//
// Everything a widget shows reads the same source as the tab it mirrors, so the
// board can never drift from the real data — see lib/home-shared.ts for the rule
// that keeps new bubbles reachable from Home.

export type HomeTournament = {
  id: string;
  name: string;
  status: string;
  statusLabel: string;
  live: boolean;
  startsAt: number | null;
  gameName: string | null;
  gameLogoUrl: string | null;
};

const META = new Map(HOME_WIDGETS.map((w) => [w.id, w]));

export function HomeBoard({
  initialLayout,
  tournaments,
  matches,
  teams,
}: {
  initialLayout: HomeWidgetId[];
  tournaments: HomeTournament[];
  matches: ScheduleEntry[];
  teams: MyTeam[];
}) {
  // Local layout is the source of truth for what's shown and in what order;
  // reorder and customize both update it and persist. useReorderableGrid drives
  // the drag/keyboard reorder over the enabled widgets.
  const [layout, setLayout] = useState<HomeWidgetId[]>(initialLayout);
  const [customizing, setCustomizing] = useState(false);

  // Referentially stable except when `layout` actually changes — otherwise the
  // reorder hook's items-sync would reset the order on every render and fight
  // an in-progress drag.
  const items = useMemo(() => layout.map((id) => ({ id })), [layout]);
  const { order, error, reorder, bubbleProps, handleProps } = useReorderableGrid(
    {
      items,
      getId: (item) => item.id,
      onReorder: (ids) => {
        setLayout(ids as HomeWidgetId[]);
        return setHomeLayout(ids);
      },
    },
  );

  function toggleWidget(id: HomeWidgetId, on: boolean) {
    const next = on
      ? layout.includes(id)
        ? layout
        : [...layout, id]
      : layout.filter((w) => w !== id);
    setLayout(next);
    void setHomeLayout(next);
  }

  return (
    <>
      <div className="ff-actions">
        <div className="ff-actions__row ff-home-board__toolbar">
          <button
            type="button"
            className="ff-btn ff-btn--outline"
            aria-haspopup="dialog"
            onClick={() => setCustomizing(true)}
          >
            <PlusIcon />
            Customize Home
          </button>
        </div>
      </div>

      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {order.length === 0 ? (
        <div className="ff-bubble-grid">
          <Bubble title="Your Home Screen" span="full">
            <p className="ff-auth__hint">
              Your board is empty. Use <strong>Customize Home</strong> above to
              add widgets — tournaments, your schedule, and your teams.
            </p>
          </Bubble>
        </div>
      ) : (
        <div className="ff-bubble-grid">
          {order.map((item, index) => {
            const meta = META.get(item.id);
            if (!meta) return null;
            const bp = bubbleProps(index);
            return (
              <Bubble
                key={item.id}
                {...bp}
                // The universal top-bubble rule: whatever's first spans the grid.
                span={index === 0 ? "full" : undefined}
                title={meta.title}
                dragHandle={
                  <DragGrip {...handleProps(index)} label={`Move ${meta.title}`} />
                }
                actions={
                  <span className="ff-reorder" role="group" aria-label="Reorder">
                    <button
                      className="ff-reorder__btn"
                      type="button"
                      disabled={index === 0}
                      title="Move up"
                      onClick={() => reorder(index, index - 1)}
                    >
                      <span className="screen-reader-text">
                        Move {meta.title} up
                      </span>
                      <Chevron up />
                    </button>
                    <button
                      className="ff-reorder__btn"
                      type="button"
                      disabled={index === order.length - 1}
                      title="Move down"
                      onClick={() => reorder(index, index + 1)}
                    >
                      <span className="screen-reader-text">
                        Move {meta.title} down
                      </span>
                      <Chevron />
                    </button>
                  </span>
                }
              >
                <WidgetContent
                  id={item.id}
                  tournaments={tournaments}
                  matches={matches}
                  teams={teams}
                />
              </Bubble>
            );
          })}
        </div>
      )}

      <CustomizeDialog
        open={customizing}
        enabled={layout}
        onToggle={toggleWidget}
        onClose={() => setCustomizing(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

function WidgetContent({
  id,
  tournaments,
  matches,
  teams,
}: {
  id: HomeWidgetId;
  tournaments: HomeTournament[];
  matches: ScheduleEntry[];
  teams: MyTeam[];
}) {
  switch (id) {
    case "overview":
      return (
        <div className="ff-hw-cols">
          <section>
            <p className="ff-hw-col__label">Active Tournaments</p>
            <TournamentList tournaments={tournaments} limit={3} />
          </section>
          <section>
            <p className="ff-hw-col__label">Upcoming Matches</p>
            <MatchList matches={matches} limit={3} />
          </section>
        </div>
      );
    case "tournaments":
      return (
        <>
          <TournamentList tournaments={tournaments} limit={5} />
          <MoreLink href="/tournaments/" label="View all tournaments" />
        </>
      );
    case "schedule":
      return (
        <>
          <MatchList matches={matches} limit={5} />
          <MoreLink href="/schedule/" label="Open schedule" />
        </>
      );
    case "teams":
      return (
        <>
          <TeamList teams={teams} />
          <MoreLink href="/teams/" label="All teams" />
        </>
      );
    default:
      return null;
  }
}

function TournamentList({
  tournaments,
  limit,
}: {
  tournaments: HomeTournament[];
  limit: number;
}) {
  if (!tournaments.length) {
    return <p className="ff-hw-empty">Nothing active right now.</p>;
  }
  return (
    <div className="ff-hw-list">
      {tournaments.slice(0, limit).map((t) => (
        <Link
          key={t.id}
          className="ff-hw-row"
          href={`/tournaments/${encodeURIComponent(t.id)}/`}
          prefetch={false}
        >
          <span className="ff-hw-row__mark">
            <GameLogo name={t.gameName} logoUrl={t.gameLogoUrl} />
          </span>
          <span className="ff-hw-row__main">
            <span className="ff-hw-row__title">{t.name}</span>
            <span className="ff-hw-row__sub">{formatDate(t.startsAt)}</span>
          </span>
          <span
            className={`ff-hw-tag${t.live ? " ff-hw-tag--live" : ""}`}
          >
            {t.statusLabel}
          </span>
        </Link>
      ))}
    </div>
  );
}

function MatchList({
  matches,
  limit,
}: {
  matches: ScheduleEntry[];
  limit: number;
}) {
  if (!matches.length) {
    return <p className="ff-hw-empty">No upcoming matches.</p>;
  }
  return (
    <div className="ff-hw-list">
      {matches.slice(0, limit).map((m) => {
        const inner = (
          <>
            <span className="ff-hw-row__main">
              <span className="ff-hw-row__title">{m.title}</span>
              <span className="ff-hw-row__sub">
                {m.opponent ? `vs ${m.opponent}` : m.round ? m.round : " "}
              </span>
            </span>
            <span className="ff-hw-row__meta">{formatDateTime(m.scheduledAt)}</span>
          </>
        );
        if (m.href) {
          return (
            <Link
              key={m.id}
              className="ff-hw-row"
              href={m.href}
              prefetch={false}
            >
              {inner}
            </Link>
          );
        }
        if (m.url) {
          return (
            <a
              key={m.id}
              className="ff-hw-row"
              href={m.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {inner}
            </a>
          );
        }
        return (
          <div key={m.id} className="ff-hw-row ff-hw-row--static">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function TeamList({ teams }: { teams: MyTeam[] }) {
  if (!teams.length) {
    return (
      <p className="ff-hw-empty">
        You&rsquo;re not on a team yet.{" "}
        <Link href="/teams/" prefetch={false}>
          Create or join one
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="ff-hw-list">
      {teams.slice(0, 4).map((team) => (
        <Link
          key={team.id}
          className="ff-hw-row"
          href={`/teams/${team.id}/`}
          prefetch={false}
        >
          <span className="ff-hw-row__mark">
            <Avatar src={team.logoUrl} name={team.name} shape="team" size="sm" />
          </span>
          <span className="ff-hw-row__main">
            <span className="ff-hw-row__title">
              {team.tag ? `${team.name} [${team.tag}]` : team.name}
            </span>
            <span className="ff-hw-row__sub">
              {team.memberCount}{" "}
              {team.memberCount === 1 ? "member" : "members"}
              {team.avgSr != null ? ` · ${team.avgSr} avg SR` : ""}
            </span>
          </span>
          <span className={`ff-badge ff-badge--${team.role}`}>
            {TEAM_ROLE_LABELS[team.role]}
          </span>
        </Link>
      ))}
    </div>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="ff-hw-more" href={href} prefetch={false}>
      {label} →
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Customize popup
// ---------------------------------------------------------------------------

function CustomizeDialog({
  open,
  enabled,
  onToggle,
  onClose,
}: {
  open: boolean;
  enabled: HomeWidgetId[];
  onToggle: (id: HomeWidgetId, on: boolean) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="ff-dialog ff-dialog--customize" onClose={onClose}>
      <h2 className="ff-dialog__title">Customize Home</h2>
      <p className="ff-dialog__text">
        Choose what appears on your Home screen. Drag the cards to reorder them.
      </p>
      <ul className="ff-customize__list">
        {HOME_WIDGETS.map((w) => {
          const on = enabled.includes(w.id);
          return (
            <li key={w.id} className="ff-customize__item">
              <label className="ff-customize__label">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(event) => onToggle(w.id, event.target.checked)}
                />
                <span className="ff-customize__text">
                  <span className="ff-customize__name">{w.title}</span>
                  <span className="ff-customize__desc">{w.description}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="ff-dialog__actions">
        <button type="button" className="ff-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

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

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d={up ? "M1.5 8L6 4L10.5 8" : "M1.5 4L6 8L10.5 4"}
        strokeWidth="1.5"
      />
    </svg>
  );
}
