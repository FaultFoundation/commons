import type { ReactNode } from "react";

// One collapsible analytics card in the Overview left column: a title, a muted
// caption headline (e.g. "1.48 avg · last 20"), and a chevron; the body expands
// on click. Native <details>, so no client directive — the toggle works without
// JS and the chart children are pure. `tone` colours the caption (a win streak
// green, flagged anomalies pink).

export function ScoutGraphCard({
  title,
  caption,
  tone,
  defaultOpen,
  children,
}: {
  title: string;
  caption?: string;
  tone?: "pos" | "neg" | "warn";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="ff-card ff-scoutgraph" open={defaultOpen}>
      <summary className="ff-scoutgraph__summary">
        <span className="ff-scoutgraph__title">{title}</span>
        {caption ? (
          <span
            className={`ff-scoutgraph__caption${tone ? ` ff-scoutgraph__caption--${tone}` : ""}`}
          >
            {caption}
          </span>
        ) : null}
        <span className="ff-scoutgraph__chev" aria-hidden="true">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" width="13" height="13">
            <path d="M1.5 4L6 8L10.5 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className="ff-scoutgraph__body">{children}</div>
    </details>
  );
}
