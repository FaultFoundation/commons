import {
  formatRecord,
  formatWinratePct,
  type MapWinrate,
} from "@/lib/faceit-scouting-shared";

// The headline scouting graphic: a thin horizontal bar per map, sorted by win
// rate, the bar width tracking the win rate against a 0–100% scale. Presentational
// only — the host (ScoutingView) passes the already-derived rows. Inline
// CSS-track bars (no chart lib), the same approach as the OW dashboard's
// Time Played / Hero Comparison meters.

/** Below this sample size a map's bar is muted — one lucky game shouldn't read
 *  as loud as a 40-game trend. The row still shows so the data isn't hidden. */
const LOW_SAMPLE = 3;

export function MapWinrateChart({ rows }: { rows: MapWinrate[] }) {
  if (rows.length === 0) {
    return (
      <p className="ff-bubble__note">
        No map data yet — win rates appear here as each match&apos;s map is
        collected. Give it a moment and refresh.
      </p>
    );
  }

  // Sort by win rate for the "best maps first" read (the reference layout);
  // undecided maps (draws only) sink to the bottom, ties broken by games played.
  const sorted = [...rows].sort(
    (a, b) => (b.winrate ?? -1) - (a.winrate ?? -1) || b.total - a.total,
  );

  return (
    <div className="ff-scoutmap" role="img" aria-label="Win rate by map">
      {sorted.map((row) => {
        const pct = row.winrate == null ? 0 : row.winrate * 100;
        const low = row.total < LOW_SAMPLE;
        return (
          <div
            className={`ff-scoutmap__row${low ? " ff-scoutmap__row--low" : ""}`}
            key={row.map}
          >
            <div className="ff-scoutmap__label">
              <span className="ff-scoutmap__map">{row.map}</span>
              {row.mapMode ? (
                <span className="ff-scoutmap__mode">{row.mapMode}</span>
              ) : null}
            </div>
            <div className="ff-scoutmap__track">
              <div
                className="ff-scoutmap__bar"
                style={{ width: `${Math.max(1.5, pct)}%` }}
              />
            </div>
            <div className="ff-scoutmap__value">
              <span className="ff-scoutmap__pct">{formatWinratePct(row.winrate)}</span>
              <span className="ff-scoutmap__record">
                {formatRecord(row)} · {row.total} {row.total === 1 ? "game" : "games"}
              </span>
            </div>
          </div>
        );
      })}
      <div className="ff-scoutmap__axis" aria-hidden="true">
        <span className="ff-scoutmap__ticks">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </span>
      </div>
    </div>
  );
}
