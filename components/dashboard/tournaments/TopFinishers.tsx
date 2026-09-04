"use client";

import { TrophyIcon } from "@/components/dashboard/tournaments/TrophyIcon";
import { useTournamentTabs } from "@/components/dashboard/tournaments/TournamentChrome";
import type { FinisherEntry } from "@/components/dashboard/tournaments/tournament-view-shared";

// The finishers row atop the Overview tab. Two modes, driven by the data:
//   • podium — a single bracket's gold/silver/bronze top-3;
//   • advancing — a pool stage's advancing entrants, each tagged with its pool
//     ("Pool A1"), kept in pool order (place is the rank WITHIN the pool).
// Plus a "Full standings →" control that jumps to the Standings tab (client,
// because it switches tabs through the TournamentChrome context). Renders
// nothing when there are no placed finishers yet.

export function TopFinishers({ finishers }: { finishers: FinisherEntry[] }) {
  const tabs = useTournamentTabs();
  const isPools = finishers.some((f) => f.poolLabel);
  // Pool mode: already ordered by pool (place is within-pool) — show all.
  // Podium mode: overall top-3 by place.
  const shown = isPools
    ? finishers
    : finishers
        .filter((f) => f.place >= 1 && f.place <= 3)
        .sort((a, b) => a.place - b.place)
        .slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <div className="ff-tfin" aria-label={isPools ? "Advancing" : "Top finishers"}>
      <span className="ff-tfin__label">{isPools ? "Advancing" : "Top Finishers"}</span>
      <ol className="ff-tfin__list">
        {shown.map((f, index) => (
          <li
            className="ff-tfin__item"
            key={`${f.poolLabel ?? ""}-${f.place}-${f.name}-${index}`}
          >
            <TrophyIcon place={f.place} size={18} />
            <span className="ff-tfin__entrant">
              {f.logoUrl ? (
                <img
                  className="ff-tfin__logo"
                  src={f.logoUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : null}
              <span className="ff-tfin__name">{f.name}</span>
              {f.poolLabel ? (
                <span className="ff-tfin__pool">{f.poolLabel}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {tabs ? (
        <button
          type="button"
          className="ff-tfin__more"
          onClick={() => tabs.setTab("standings")}
        >
          Full standings →
        </button>
      ) : null}
    </div>
  );
}
