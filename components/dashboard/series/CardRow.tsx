"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The horizontal card scroller (`.ff-scardrow`): one row of cards with
 * left/right buttons that appear only when the row overflows and disable at
 * each end.
 *
 * One mechanism, two callers — the Series & Leagues row on `/series/` and the
 * tournament strip under a series profile's hero. It was written for the
 * former; extracting it was the alternative to a second copy of the same
 * overflow/scroll bookkeeping drifting out of step with it.
 */
export function CardRow({
  children,
  label,
  /** When set, the card carrying `data-active="true"` is centred in the track
      on mount and whenever this changes — how the strip reveals the tournament
      the page opened on. It scrolls the TRACK only, never the page. */
  activeKey,
}: {
  children: ReactNode;
  label?: string;
  activeKey?: string | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState({ prev: false, next: false });

  const updateNav = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const prev = el.scrollLeft > 4;
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setNav((n) => (n.prev === prev && n.next === next ? n : { prev, next }));
  }, []);

  useEffect(() => {
    updateNav();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateNav, { passive: true });
    window.addEventListener("resize", updateNav);
    return () => {
      el.removeEventListener("scroll", updateNav);
      window.removeEventListener("resize", updateNav);
    };
  }, [updateNav, children]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || activeKey == null) return;
    const active = track.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    // Centre it WITHIN the track. scrollIntoView would also scroll the page,
    // yanking the member away from the hero they just landed on.
    const offset = active.offsetLeft - track.clientWidth / 2 + active.offsetWidth / 2;
    const left = Math.max(0, offset);
    if (Math.abs(track.scrollLeft - left) < 8) return;
    track.scrollTo({ left, behavior: "smooth" });
  }, [activeKey]);

  function scrollBy(dir: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(280, el.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  const overflow = nav.prev || nav.next;
  return (
    <div className="ff-scardrow">
      {overflow ? (
        <button
          type="button"
          className="ff-scardrow__nav ff-scardrow__nav--prev"
          onClick={() => scrollBy(-1)}
          disabled={!nav.prev}
          aria-label={label ? `Scroll ${label} left` : "Scroll left"}
        >
          ‹
        </button>
      ) : null}
      <div className="ff-scardrow__track" ref={trackRef}>
        {children}
      </div>
      {overflow ? (
        <button
          type="button"
          className="ff-scardrow__nav ff-scardrow__nav--next"
          onClick={() => scrollBy(1)}
          disabled={!nav.next}
          aria-label={label ? `Scroll ${label} right` : "Scroll right"}
        >
          ›
        </button>
      ) : null}
    </div>
  );
}
