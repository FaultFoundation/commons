"use client";

import { TrophyIcon } from "@/components/dashboard/tournaments/TrophyIcon";
import { useTournamentTabs } from "@/components/dashboard/tournaments/TournamentChrome";
import type { FinisherEntry } from "@/components/dashboard/tournaments/tournament-view-shared";

// The "Top finishers" row that sits atop the Overview tab: the podium (gold /
// silver / bronze trophies) with each finisher's small logo + name, and a
// "Full standings →" control that jumps to the Standings tab. Client because it
// switches tabs through the TournamentChrome context; renders nothing when there
// are no placed finishers yet (an event still in progress).

export function TopFinishers({ finishers }: { finishers: FinisherEntry[] }) {
  const tabs = useTournamentTabs();
  const top = finishers
    .filter((f) => f.place >= 1 && f.place <= 3)
    .sort((a, b) => a.place - b.place)
    .slice(0, 3);
  if (top.length === 0) return null;

  return (
    <div className="ff-tfin" aria-label="Top finishers">
      <span className="ff-tfin__label">Top Finishers</span>
      <ol className="ff-tfin__list">
        {top.map((f) => (
          <li className="ff-tfin__item" key={`${f.place}-${f.name}`}>
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
