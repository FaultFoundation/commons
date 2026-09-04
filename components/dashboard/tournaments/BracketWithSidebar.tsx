"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { RecentResults } from "@/components/dashboard/tournaments/RecentResults";
import type { ResultRow } from "@/components/dashboard/tournaments/tournament-view-shared";

// The Bracket tab's layout: a Recent Results sidebar beside the bracket bubble.
// The bracket is the taller element, and we want the sidebar to fill exactly its
// height (its list scrolling inside) — which CSS alone can't do, because a grid
// `stretch` resolves to the TALLER child, so a sidebar rendering all 100+ matches
// would instead stretch the bracket. So we measure the bracket's rendered height
// (ResizeObserver — it changes as connectors draw, images load, or a pool tab is
// switched) and cap the sidebar card to it. "Show all N matches" clears the cap
// (expanded) so the card grows past the bracket instead.
export function BracketWithSidebar({
  results,
  children,
}: {
  results: ResultRow[];
  /** The bracket bubble (a client BracketView / ExternalBracket inside). */
  children: ReactNode;
}) {
  const bracketRef = useRef<HTMLDivElement>(null);
  const [bracketHeight, setBracketHeight] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const hasRecent = results.length > 0;

  useEffect(() => {
    const el = bracketRef.current;
    if (!el || !hasRecent) return;
    const measure = () => setBracketHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hasRecent]);

  return (
    <div className={`ff-tbracket${hasRecent ? "" : " ff-tbracket--solo"}`}>
      {hasRecent ? (
        <RecentResults
          results={results}
          cardMaxHeight={bracketHeight}
          expanded={expanded}
          footer={
            results.length > 4 ? (
              <button
                type="button"
                className="ff-recent__toggle"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show fewer" : `Show all ${results.length} matches`}
              </button>
            ) : null
          }
        />
      ) : null}
      <div className="ff-tbracket__main" ref={bracketRef}>
        {children}
      </div>
    </div>
  );
}
