import {
  formatCompact,
  formatKd,
  type AnomalyMetric,
  type PerformanceAnomalies,
} from "@/lib/faceit-scouting-shared";

// Outlier games — matches where K/D, damage or healing sits ≥2 SD from the
// player's own mean, most extreme first. A direction arrow, the metric + value,
// the map, and the signed z-score.

const METRIC_LABEL: Record<AnomalyMetric, string> = {
  kd: "K/D",
  damage: "Damage",
  healing: "Healing",
};

function fmtValue(metric: AnomalyMetric, value: number): string {
  return metric === "kd" ? formatKd(value) : formatCompact(value);
}

function when(at: number | null): string {
  if (!at) return "—";
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AnomaliesList({ data }: { data: PerformanceAnomalies }) {
  if (data.sampleSize < 3) {
    return <p className="ff-owchart__empty">Not enough matches to spot outliers yet.</p>;
  }
  if (!data.flagged.length) {
    return (
      <p className="ff-owchart__empty">
        No outlier games — steady across {data.sampleSize} matches.
      </p>
    );
  }
  return (
    <ul className="ff-scoutanom">
      {data.flagged.slice(0, 8).map((a, i) => (
        <li className="ff-scoutanom__row" key={`${a.matchId}-${a.metric}-${i}`}>
          <span className={`ff-scoutanom__dir ff-scoutanom__dir--${a.z >= 0 ? "up" : "down"}`}>
            {a.z >= 0 ? "▲" : "▼"}
          </span>
          <span className="ff-scoutanom__metric">{METRIC_LABEL[a.metric]}</span>
          <span className="ff-scoutanom__val">{fmtValue(a.metric, a.value)}</span>
          <span className="ff-scoutanom__map">{a.mapName ?? "—"}</span>
          <span className="ff-scoutanom__z">
            {a.z >= 0 ? "+" : ""}
            {a.z.toFixed(1)} SD
          </span>
          <span className="ff-scoutanom__when">{when(a.at)}</span>
        </li>
      ))}
    </ul>
  );
}
