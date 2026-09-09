import type { ConsistencyStat } from "@/lib/faceit-scouting-shared";

// Coefficient of variation (stddev / mean) per stat — a shorter bar is a steadier
// player. Bars are normalised to the noisiest stat so the relative spread reads
// even when the raw CVs are small.

export function ConsistencyBars({ data }: { data: ConsistencyStat[] }) {
  if (!data.length) {
    return <p className="ff-owchart__empty">Not enough data yet.</p>;
  }
  const max = Math.max(...data.map((s) => s.cv ?? 0), 0.01);
  return (
    <div className="ff-scoutcv">
      {data.map((s) => {
        const cv = s.cv ?? 0;
        return (
          <div className="ff-scoutcv__row" key={s.key}>
            <span className="ff-scoutcv__label">{s.stat}</span>
            <span className="ff-scoutcv__track">
              <span
                className="ff-scoutcv__bar"
                style={{ width: `${Math.max(2, (cv / max) * 100)}%` }}
              />
            </span>
            <span className="ff-scoutcv__val">{Math.round(cv * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}
