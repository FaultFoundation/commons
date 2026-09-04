"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  RecentResults,
  RecentResultsPopup,
} from "@/components/dashboard/tournaments/RecentResults";
import type { ResultRow } from "@/components/dashboard/tournaments/tournament-view-shared";

// The Overview body for an external tournament: the About bubble on the left,
// and a right rail stacking the Details facts bubble with the Recent Results
// card beneath it. Recent Results used to be a sidebar on the Bracket tab; it now
// lives here, capped so that Details + Recent stops at the About bubble's bottom
// (its list scrolling inside). CSS can't do that — a grid `stretch` sizes to the
// TALLER child — so we measure the About and Details bubbles (ResizeObserver:
// their heights change as prose reflows and images load) and cap the card to the
// leftover height. "Show all N matches" opens the full-list popup rather than
// expanding the rail past the About bubble.

/** Flex gap between Details and Recent in the right rail (keep in sync with the
    `.ff-toverview__side` gap in theme.css). */
const RAIL_GAP = 16;
/** Floor so the card never collapses to nothing when Details is nearly as tall
    as About (or there's no About to measure against). */
const MIN_RECENT_HEIGHT = 160;

export function TournamentOverview({
  about,
  details,
  results,
}: {
  /** The About bubble, or null when nothing has been published. */
  about: ReactNode | null;
  /** The Details facts bubble, or null. */
  details: ReactNode | null;
  results: ResultRow[];
}) {
  const aboutRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [recentMax, setRecentMax] = useState<number | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const hasRecent = results.length > 0;

  useEffect(() => {
    if (!hasRecent) return;
    const aboutEl = aboutRef.current;
    const detailsEl = detailsRef.current;
    const measure = () => {
      const aboutH = aboutEl?.offsetHeight ?? 0;
      const detailsH = detailsEl?.offsetHeight ?? 0;
      // Fill from the bottom of Details down to the bottom of About. With no
      // About to measure against (a details-only or recent-only Overview), fall
      // back to a comfortable fixed height so the card never runs the page long.
      const room =
        aboutH > 0
          ? aboutH - detailsH - (detailsH > 0 ? RAIL_GAP : 0)
          : 420;
      setRecentMax(Math.max(room, MIN_RECENT_HEIGHT));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (aboutEl) observer.observe(aboutEl);
    if (detailsEl) observer.observe(detailsEl);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hasRecent]);

  const recent = hasRecent ? (
    <RecentResults
      results={results}
      cardMaxHeight={recentMax}
      footer={
        results.length > 4 ? (
          <button
            type="button"
            className="ff-recent__toggle"
            onClick={() => setPopupOpen(true)}
          >
            Show all {results.length} matches
          </button>
        ) : null
      }
    />
  ) : null;

  // Nothing to show at all — the same placeholder the server used to render.
  if (!about && !details && !hasRecent) {
    return (
      <Bubble title="About" span="full">
        <p className="ff-auth__hint">No details have been published yet.</p>
      </Bubble>
    );
  }

  const side =
    details || recent ? (
      <div className="ff-toverview__side">
        {details ? <div ref={detailsRef}>{details}</div> : null}
        {recent}
      </div>
    ) : null;

  const single = !about || !side;

  return (
    <>
      <div className={`ff-toverview${single ? " ff-toverview--single" : ""}`}>
        {about ? <div ref={aboutRef}>{about}</div> : null}
        {side}
      </div>
      {popupOpen ? (
        <RecentResultsPopup
          results={results}
          onClose={() => setPopupOpen(false)}
        />
      ) : null}
    </>
  );
}
