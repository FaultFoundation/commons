import { formatKd, type KdOverTime } from "@/lib/faceit-scouting-shared";

// K/D over the recent detailed matches: an area+line plot with a dashed
// least-squares trend line. Inline SVG, no chart lib — the same idiom as the
// Statistics "Progress Over Time" charts (reusing the ff-owchart__* line/area
// classes), sized to sit inside a collapsed analytics card.

export function KdOverTimeChart({ data }: { data: KdOverTime }) {
  const { points, avg, trend } = data;
  if (points.length < 2) {
    return <p className="ff-owchart__empty">Not enough detailed matches yet.</p>;
  }

  const W = 320;
  const H = 120;
  const padX = 6;
  const padY = 12;
  const vals = points.map((p) => p.kd);
  let min = Math.min(...vals, 0);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const n = points.length;
  const x = (i: number) => padX + (i / (n - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (H - padY * 2);

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.kd).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${(H - padY).toFixed(1)} ${line} ${x(n - 1).toFixed(1)},${(H - padY).toFixed(1)}`;
  const trendLine = trend
    ? `${x(0).toFixed(1)},${y(trend.intercept).toFixed(1)} ${x(n - 1).toFixed(1)},${y(trend.intercept + trend.slope * (n - 1)).toFixed(1)}`
    : null;

  return (
    <div className="ff-scoutchart">
      <svg
        className="ff-owchart__svg ff-scoutchart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="K/D ratio over recent matches"
      >
        <polyline className="ff-owchart__area" points={area} />
        <polyline className="ff-owchart__line" points={line} vectorEffect="non-scaling-stroke" />
        {trendLine ? (
          <polyline
            className="ff-scoutchart__trend"
            points={trendLine}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <div className="ff-owchart__axis">
        <span>oldest</span>
        {avg != null ? <span>avg {formatKd(avg)}</span> : null}
        <span>latest</span>
      </div>
    </div>
  );
}
