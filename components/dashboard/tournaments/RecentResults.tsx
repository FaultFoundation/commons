"use client";

import type {
  ResultRow,
  ResultSide,
} from "@/components/dashboard/tournaments/tournament-view-shared";

// The "Recent Results" sidebar shown beside the bracket. Each result is a
// scoreboard card modelled on a broadcast score bug: a header row (round + date)
// over a hairline, a centred "Final" status, then the two entrants with their
// logos and scores, the winner emphasised. It's a CONTROLLED component — the
// BracketWithSidebar wrapper measures the bracket's height and hands it down as
// `cardMaxHeight` so the card fills to the bracket's bottom and its list scrolls
// inside; "Show all N" clears the cap (expanded) so the card grows past it.
// Renders nothing when there are no decided matches yet.

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

function ResultCard({ row }: { row: ResultRow }) {
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
  onToggle,
}: {
  results: ResultRow[];
  /** Cap the card's height (to the bracket's) so its list scrolls; null when
      expanded (grow to show every row). */
  cardMaxHeight: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (results.length === 0) return null;
  const hasMore = results.length > 4;

  return (
    <aside
      className={`ff-recent${expanded ? " ff-recent--expanded" : ""}`}
      aria-label="Recent results"
      style={cardMaxHeight != null ? { maxHeight: cardMaxHeight } : undefined}
    >
      <h3 className="ff-recent__title">Recent Results</h3>
      <div className="ff-recent__list">
        {results.map((row) => (
          <ResultCard key={row.id} row={row} />
        ))}
      </div>
      {hasMore ? (
        <button type="button" className="ff-recent__toggle" onClick={onToggle}>
          {expanded ? "Show fewer" : `Show all ${results.length} matches`}
        </button>
      ) : null}
    </aside>
  );
}
