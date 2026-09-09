import type { WinLossStrip as WinLossStripData } from "@/lib/faceit-scouting-shared";

// A strip of colored cells, one per recent decided match (oldest → newest, left
// to right), so a run of form reads at a glance. Green win, red loss, grey draw.

export function WinLossStrip({ data }: { data: WinLossStripData }) {
  if (!data.results.length) {
    return <p className="ff-owchart__empty">No decided matches yet.</p>;
  }
  // Stored newest-first; show oldest → newest for a left-to-right timeline.
  const cells = [...data.results].reverse();
  const hasDraw = cells.some((r) => r === "draw");
  return (
    <div className="ff-scoutstrip">
      <div
        className="ff-scoutstrip__cells"
        role="img"
        aria-label="Recent win/loss timeline"
      >
        {cells.map((r, i) => (
          <span
            key={i}
            className={`ff-scoutstrip__cell ff-scoutstrip__cell--${r}`}
            title={r}
          />
        ))}
      </div>
      <div className="ff-scoutstrip__legend">
        <span className="ff-scoutstrip__key ff-scoutstrip__key--win">Win</span>
        <span className="ff-scoutstrip__key ff-scoutstrip__key--loss">Loss</span>
        {hasDraw ? (
          <span className="ff-scoutstrip__key ff-scoutstrip__key--draw">Draw</span>
        ) : null}
      </div>
    </div>
  );
}
