"use client";

import { useState, type ReactNode } from "react";

// A flat, browser-style tab strip over a tournament's stages/pools — the
// Bracket tab's top-level control when a tournament runs in more than one part.
// Each entry is an already-rendered node (a bracket bubble, one round-robin
// pool's matrix/graph/schedule, a swiss rounds list); only the active one is
// mounted, so a hidden polling/measuring panel does no work. Reuses the shared
// `.ff-bracket__tab*` chrome, the same idiom as the in-bracket phase/pool tabs.
//
// With a single entry there's nothing to switch, so the strip is omitted and the
// lone node renders bare (a single-stage tournament looks exactly as before).

export type StageTab = { key: string; label: string; node: ReactNode };

export function StageTabs({ tabs }: { tabs: StageTab[] }) {
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;
  if (tabs.length === 1) return <div className="ff-rr">{tabs[0].node}</div>;

  const index = Math.min(active, tabs.length - 1);
  return (
    <div className="ff-rr">
      <div className="ff-bracket__tabs" role="tablist" aria-label="Stages">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`ff-bracket__tab${i === index ? " ff-bracket__tab--active" : ""}`}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs[index].node}
    </div>
  );
}
