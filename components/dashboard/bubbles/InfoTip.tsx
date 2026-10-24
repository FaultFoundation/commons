"use client";

import { useId } from "react";

/**
 * An ⓘ that reveals a short explanation on hover or focus — for rows that
 * should read as a name and a control, with the "what does this do" one hover
 * away instead of a line of fine print under every row.
 *
 * The trigger is a real button, so keyboard and touch users reach it (focus
 * shows the tip, a tap focuses it), and the tip is wired as its description
 * rather than living only in a `title`.
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const id = useId();
  return (
    <span className="ff-info">
      <button
        type="button"
        className="ff-info__btn"
        aria-label={`About ${label}`}
        aria-describedby={id}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.95" fill="currentColor" />
        </svg>
      </button>
      <span role="tooltip" id={id} className="ff-info__tip">
        {text}
      </span>
    </span>
  );
}
