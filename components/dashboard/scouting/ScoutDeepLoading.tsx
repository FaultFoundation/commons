"use client";

// The Deep-search load screen: unlike StatLoading's fake climb, this shows real
// progress — how many of the player's matches have their scoreboard collected —
// because the deep loop reports it. Falls back to a gentle indeterminate crawl
// before the first count lands.

export function ScoutDeepLoading({
  total,
  detailed,
}: {
  total: number | null;
  detailed: number | null;
}) {
  const known = total != null && total > 0;
  const pct = known ? Math.min(99, Math.round(((detailed ?? 0) / total) * 100)) : null;

  return (
    <section
      className="ff-card ff-bubble ff-bubble--full ff-owload"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="ff-owload__label">
        Deep scan — collecting the full match history…
      </p>
      <div className="ff-owload__track">
        <div
          className={`ff-owload__bar${pct == null ? " ff-owload__bar--indeterminate" : ""}`}
          style={pct != null ? { width: `${Math.max(4, pct)}%` } : undefined}
        />
      </div>
      <p className="ff-owload__hint">
        {known
          ? `Detailed ${detailed ?? 0} of ${total} matches — pulling every map and scoreboard so the stats are exact.`
          : "Resolving the player and paging their history — this can take a little while for a full career."}
        {" Temporary connection delays are retried automatically — keep this search open."}
      </p>
    </section>
  );
}
