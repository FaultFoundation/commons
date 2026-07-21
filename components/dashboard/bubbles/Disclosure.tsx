import type { ReactNode } from "react";

/**
 * Collapsible row inside a Bubble — same visual shell as BubbleRow, but the
 * body expands on click. Native <details>, so it works without JS and needs
 * no client directive.
 */
export function Disclosure({
  label,
  note,
  children,
}: {
  label: string;
  /** Fine print on the closed row. */
  note?: string;
  children: ReactNode;
}) {
  return (
    <details className="ff-row ff-disclosure">
      <summary className="ff-disclosure__summary">
        <span className="ff-row__main">
          <span className="ff-row__value">{label}</span>
          {note ? <span className="ff-row__note">{note}</span> : null}
        </span>
        <span className="ff-disclosure__chevron" aria-hidden="true">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" width="12" height="12">
            <path d="M1.5 4L6 8L10.5 4" strokeWidth="1.5" />
          </svg>
        </span>
      </summary>
      <div className="ff-disclosure__body">{children}</div>
    </details>
  );
}
