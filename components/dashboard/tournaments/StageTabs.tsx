"use client";

import { type ReactNode } from "react";

import { usePersistentState } from "@/lib/view-state";

// A flat, browser-style tab strip over a tournament's stages/pools — the
// Bracket tab's top-level control when a tournament runs in more than one part.
// Each entry is an already-rendered node (a bracket bubble, one round-robin
// pool's matrix/graph/schedule, a swiss rounds list); only the active one is
// mounted, so a hidden polling/measuring panel does no work. Reuses the shared
// `.ff-bracket__tab*` chrome, the same idiom as the in-bracket phase/pool tabs.
//
// With a single entry there's nothing to switch, so the strip is omitted and the
// lone node renders bare (a single-stage tournament looks exactly as before).
//
// The open stage is remembered per tournament (lib/view-state.ts) by its `key`,
// never its index: a re-scrape can add, drop or reorder pools, and a stored
// index would then quietly select a different stage than the member left open.

export type StageTab = { key: string; label: string; node: ReactNode };

export function StageTabs({
  tabs,
  storageKey,
}: {
  tabs: StageTab[];
  /** What the remembered stage is filed under — the tournament id. Omit it and
      the stage simply doesn't persist. */
  storageKey?: string;
}) {
  const [active, setActive] = usePersistentState<string | null>(
    storageKey ? `tournament-stage:${storageKey}` : null,
    null,
    (stored) =>
      typeof stored === "string" && tabs.some((t) => t.key === stored)
        ? stored
        : undefined,
  );
  if (tabs.length === 0) return null;
  if (tabs.length === 1) return <div className="ff-rr">{tabs[0].node}</div>;

  const found = tabs.findIndex((t) => t.key === active);
  const index = found >= 0 ? found : 0;
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
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs[index].node}
    </div>
  );
}
