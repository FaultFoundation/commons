"use client";

import { useEffect, type ReactNode } from "react";

import type {
  ResultRow,
  ResultSide,
} from "@/components/dashboard/tournaments/tournament-view-shared";

// The "Recent Results" card — a column of broadcast-style scoreboard cards, each
// a header row (round + date) over a hairline, a centred "Final" status, then the
// two entrants with their logos and scores, the winner emphasised. Presentational
// and CONTROLLED: the host caps the card's height (`cardMaxHeight`, e.g. to the
// About bubble's bottom) so its list scrolls inside, and supplies the `footer`
// button (which opens the full-list popup on the Overview, or expands in place in
// the internal bracket sidebar). Renders nothing when there are no decided
// matches. `RecentResultsPopup` shows the whole list in a modal.

function ScoreLine({
  side,
  position,
}: {
  side: ResultSide;
  position: "left" | "right";
}) {
  // No mark at all when the entrant has none — an empty placeholder box read as
  // a broken image beside teams that simply have no logo.
  const logo = side.logoUrl ? (
    <img
      className="ff-recent__logo"
      src={side.logoUrl}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  ) : null;

  return (
    <div
      className={`ff-recent__team ff-recent__team--${position}${side.winner ? " ff-recent__team--win" : ""}`}
    >
      {position === "right" ? logo : null}
      <span className="ff-recent__name">{side.name}</span>
      {position === "left" ? logo : null}
    </div>
  );
}

export function ResultCard({ row }: { row: ResultRow }) {
  const inner = (
    <>
      <div className="ff-recent__head">
        <span className="ff-recent__round">{row.round ?? "Match"}</span>
        {row.dateLabel ? (
          <span className="ff-recent__date">{row.dateLabel}</span>
        ) : null}
      </div>
      <div className="ff-recent__status">Final</div>
      <div className="ff-recent__match">
        <ScoreLine side={row.a} position="left" />
        <div
          className="ff-recent__scoreline"
          aria-label={`${row.a.score} to ${row.b.score}`}
        >
          <span className={row.a.winner ? "ff-recent__score ff-recent__score--win" : "ff-recent__score"}>
            {row.a.score}
          </span>
          <span className="ff-recent__score-separator" aria-hidden="true">-</span>
          <span className={row.b.winner ? "ff-recent__score ff-recent__score--win" : "ff-recent__score"}>
            {row.b.score}
          </span>
        </div>
        <ScoreLine side={row.b} position="right" />
      </div>
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

export function RecentResults({
  results,
  cardMaxHeight,
  expanded,
  footer,
}: {
  results: ResultRow[];
  /** Cap the card's height (e.g. to the About bubble's) so its list scrolls;
      null (or `expanded`) leaves it uncapped. */
  cardMaxHeight: number | null;
  /** When true, ignore the cap and grow to show every row (internal sidebar's
      "Show fewer" state). */
  expanded?: boolean;
  /** The footer control (a "Show all N" button), built by the host so it can
      open a popup or expand in place. */
  footer?: ReactNode;
}) {
  if (results.length === 0) return null;
  const capped = !expanded && cardMaxHeight != null;

  return (
    <aside
      className={`ff-recent${expanded ? " ff-recent--expanded" : ""}`}
      aria-label="Recent results"
      style={capped ? { maxHeight: cardMaxHeight } : undefined}
    >
      <h3 className="ff-recent__title">Recent Results</h3>
      <div className="ff-recent__list">
        {results.map((row) => (
          <ResultCard key={row.id} row={row} />
        ))}
      </div>
      {footer}
    </aside>
  );
}

/** The full-list popup opened by the Overview's "Show all N matches" — every
    decided match as a scoreboard card in a scrolling grid; closes on backdrop
    click or Escape (the shared ff-daypop overlay). */
export function RecentResultsPopup({
  results,
  onClose,
}: {
  results: ResultRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ff-daypop"
      role="dialog"
      aria-modal="true"
      aria-label="Recent results"
      onClick={onClose}
    >
      <div
        className="ff-daypop__panel ff-recentpop__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ff-daypop__head">
          <h2 className="ff-daypop__title">Recent Results</h2>
          <button
            className="ff-daypop__close"
            type="button"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="ff-daypop__body ff-recentpop__body">
          {results.map((row) => (
            <ResultCard key={row.id} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}
