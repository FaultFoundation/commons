"use client";

import { useEffect, useMemo, useState } from "react";

import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  type TournamentFormat,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

export type TournamentListEntry = {
  id: string;
  name: string;
  format: string;
  status: string;
  entrantCount: number;
  maxParticipants: number | null;
  startsAt: number | null;
};

/** The filter chips, in the order a member actually looks for things. */
const VIEWS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "live", label: "Live" },
  { key: "done", label: "Finished" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];
type Layout = "modern" | "compact";

const LAYOUT_KEY = "ff-tournaments-layout";

/**
 * The member's tournament list, in two layouts: **modern** (a card grid, the
 * default) and **compact** (a dense table). The toggle sits top-right and the
 * choice is remembered in localStorage. Filtering is entirely client-side — the
 * server hands down every visible tournament once and the chips narrow what's
 * rendered; the list is small and bounded, so a round trip per chip would be a
 * billed request for work a `filter()` already does.
 */
export function TournamentList({
  tournaments,
}: {
  tournaments: TournamentListEntry[];
}) {
  const [view, setView] = useState<ViewKey>("all");
  const [layout, setLayout] = useState<Layout>("modern");

  // Restore the remembered layout after mount (SSR renders the default).
  useEffect(() => {
    const saved = window.localStorage.getItem(LAYOUT_KEY);
    if (saved === "modern" || saved === "compact") setLayout(saved);
  }, []);

  function chooseLayout(next: Layout) {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, next);
  }

  const visible = useMemo(() => {
    switch (view) {
      case "open":
        return tournaments.filter((t) => t.status === "registration");
      case "live":
        return tournaments.filter(
          (t) => t.status === "active" || t.status === "seeding",
        );
      case "done":
        return tournaments.filter(
          (t) => t.status === "completed" || t.status === "cancelled",
        );
      default:
        return tournaments;
    }
  }, [tournaments, view]);

  return (
    <>
      <div className="ff-list-head">
        <div className="ff-ticket-views">
          {VIEWS.map((option) => (
            <button
              key={option.key}
              className="ff-ticket-view"
              type="button"
              aria-current={view === option.key ? "page" : undefined}
              onClick={() => setView(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="ff-viewtoggle" role="group" aria-label="View style">
          <button
            className="ff-viewtoggle__btn"
            type="button"
            aria-pressed={layout === "modern"}
            title="Card view"
            onClick={() => chooseLayout("modern")}
          >
            <GridIcon />
            <span className="screen-reader-text">Card view</span>
          </button>
          <button
            className="ff-viewtoggle__btn"
            type="button"
            aria-pressed={layout === "compact"}
            title="Compact view"
            onClick={() => chooseLayout("compact")}
          >
            <RowsIcon />
            <span className="screen-reader-text">Compact view</span>
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="ff-ticket-empty">Nothing here right now.</p>
      ) : layout === "modern" ? (
        <div className="ff-tcard-grid">
          {visible.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      ) : (
        <CompactTable tournaments={visible} />
      )}
    </>
  );
}

function TournamentCard({ tournament: t }: { tournament: TournamentListEntry }) {
  const live = t.status === "registration" || t.status === "active";
  return (
    <a className="ff-tcard" href={`/tournaments/${t.id}/`} data-status={t.status}>
      <div className="ff-tcard__banner">
        <span className="ff-tcard__format">
          {TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat] ?? t.format}
        </span>
        <span
          className={`ff-tcard__status${live ? " ff-tcard__status--live" : ""}`}
        >
          {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus] ?? t.status}
        </span>
      </div>
      <div className="ff-tcard__body">
        <span className="ff-tcard__date">
          {t.startsAt
            ? new Date(t.startsAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : "Date TBD"}
        </span>
        <h3 className="ff-tcard__title">{t.name}</h3>
        <span className="ff-tcard__meta">
          {t.entrantCount}
          {t.maxParticipants ? ` / ${t.maxParticipants}` : ""}{" "}
          {t.entrantCount === 1 ? "team" : "teams"}
        </span>
      </div>
    </a>
  );
}

function CompactTable({
  tournaments,
}: {
  tournaments: TournamentListEntry[];
}) {
  return (
    <div className="ff-ticket-table-wrap">
      <table className="ff-ticket-table">
        <thead>
          <tr>
            <th scope="col">Tournament</th>
            <th scope="col">Format</th>
            <th scope="col">Entrants</th>
            <th scope="col">Starts</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {tournaments.map((t) => (
            <tr key={t.id}>
              <td>
                <a className="ff-ticket-subject" href={`/tournaments/${t.id}/`}>
                  {t.name}
                </a>
              </td>
              <td>
                {TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat] ??
                  t.format}
              </td>
              <td>
                {t.entrantCount}
                {t.maxParticipants ? ` / ${t.maxParticipants}` : ""}
              </td>
              <td>
                {t.startsAt
                  ? new Date(t.startsAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </td>
              <td>
                {t.status === "registration" || t.status === "active" ? (
                  <span className="ff-ticket-status ff-ticket-status--open">
                    {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus]}
                  </span>
                ) : (
                  <span className="ff-badge">
                    {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus] ??
                      t.status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="16" height="16">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="16" height="16">
      <rect x="1" y="2" width="14" height="3" rx="1.5" />
      <rect x="1" y="7" width="14" height="3" rx="1.5" />
      <rect x="1" y="12" width="14" height="3" rx="1.5" />
    </svg>
  );
}
