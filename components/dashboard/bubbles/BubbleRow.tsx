import type { ReactNode } from "react";

/**
 * Label / value / action row inside a Bubble — the universal shape for
 * settings-style content (Profile fields, Integrations, …). Shared
 * component: client editors wrap it and pass their editor UI as
 * `children`, which renders full-width below the row.
 */
export function BubbleRow({
  label,
  value,
  locked,
  lockTitle,
  note,
  action,
  children,
}: {
  label: string;
  value?: ReactNode;
  /** Read-only row: lock icon + muted background + default note. */
  locked?: boolean;
  /** Hover text on the lock icon; defaults to the note. */
  lockTitle?: string;
  /** Fine print under the value; locked rows get a default. */
  note?: string;
  /** Right-aligned control (Edit / Unlink / Connect button). */
  action?: ReactNode;
  /** Expanded editor area, full-width below the row. */
  children?: ReactNode;
}) {
  const noteText = note ?? (locked ? "Locked — contact support to change" : undefined);

  return (
    <div className={locked ? "ff-row ff-row--locked" : "ff-row"}>
      <div className="ff-row__main">
        <span className="ff-row__label">
          {label}
          {locked ? <LockIcon title={lockTitle ?? noteText} /> : null}
        </span>
        <span className="ff-row__value">{value ?? "—"}</span>
        {noteText ? <span className="ff-row__note">{noteText}</span> : null}
      </div>
      {action ? <div className="ff-row__action">{action}</div> : null}
      {children ? <div className="ff-row__editor">{children}</div> : null}
    </div>
  );
}

/** The adjacent note carries the accessible explanation; `title` is the
    pointer-hover affordance on top of it. */
function LockIcon({ title }: { title?: string }) {
  return (
    <svg
      className="ff-row__lock"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      {title ? <title>{title}</title> : null}
      <path
        fillRule="evenodd"
        d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z"
      />
    </svg>
  );
}
