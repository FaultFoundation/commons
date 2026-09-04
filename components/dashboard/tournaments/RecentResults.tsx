"use client";

import { useState } from "react";

import type { ResultRow } from "@/components/dashboard/tournaments/tournament-view-shared";

// The "Recent Results" sidebar shown beside the bracket: the most recent decided
// matches (finals first), each a compact two-line score card with the entrants'
// small logos, deep-linking to the provider match page when there is one. It
// DEFAULTS to filling the height of the bracket bubble beside it — the list
// scrolls inside that height — and "Show all N matches" expands it to the full
// list inline (the grid drops its stretch via :has(.ff-recent--expanded)).
// Renders nothing when there are no decided matches yet.

function ResultCard({ row }: { row: ResultRow }) {
  const inner = (
    <>
      <div className="ff-recent__meta">
        {row.round ? <span className="ff-recent__round">{row.round}</span> : null}
        {row.dateLabel ? (
          <span className="ff-recent__date">{row.dateLabel}</span>
        ) : null}
      </div>
      <ResultSideRow side={row.a} />
      <ResultSideRow side={row.b} />
    </>
  );
  return row.url ? (
    <a
      className="ff-recent__row ff-recent__row--link"
      href={row.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      {inner}
    </a>
  ) : (
    <div className="ff-recent__row">{inner}</div>
  );
}

function ResultSideRow({ side }: { side: ResultRow["a"] }) {
  return (
    <div
      className={`ff-recent__side${side.winner ? " ff-recent__side--win" : ""}`}
    >
      <span className="ff-recent__entrant">
        {side.logoUrl ? (
          <img
            className="ff-recent__logo"
            src={side.logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <span className="ff-recent__name">{side.name}</span>
      </span>
      <span className="ff-recent__score">{side.score}</span>
    </div>
  );
}

export function RecentResults({ results }: { results: ResultRow[] }) {
  const [expanded, setExpanded] = useState(false);
  if (results.length === 0) return null;

  // The full list always renders; height is CSS-driven — collapsed the list
  // scrolls within the bracket's height, expanded the card grows to show all.
  const hasMore = results.length > 4;

  return (
    <aside
      className={`ff-recent${expanded ? " ff-recent--expanded" : ""}`}
      aria-label="Recent results"
    >
      <h3 className="ff-recent__title">Recent Results</h3>
      <div className="ff-recent__list">
        {results.map((row) => (
          <ResultCard key={row.id} row={row} />
        ))}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="ff-recent__toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show fewer" : `Show all ${results.length} matches`}
        </button>
      ) : null}
    </aside>
  );
}
