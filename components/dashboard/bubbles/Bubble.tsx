import type { ReactNode } from "react";

/**
 * Universal dashboard card. Every tab is a .ff-bubble-grid of these —
 * pages have no visible titles of their own. Shared component (no
 * directive): usable from server pages and client components alike.
 * Titles are authored in Title Case at the call site.
 */
export function Bubble({
  id,
  title,
  variant = "default",
  span,
  actions,
  children,
}: {
  /** Anchor target, for pages that get deep-linked to a specific card. */
  id?: string;
  title: string;
  /** "danger" = red destructive card, "wip" = dimmed placeholder card. */
  variant?: "default" | "danger" | "wip";
  /** "full" spans the whole bubble grid row. */
  span?: "full";
  /** Right side of the header: a badge, count, or small button. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const classes = ["ff-card", "ff-bubble"];
  if (variant !== "default") classes.push(`ff-bubble--${variant}`);
  if (span === "full") classes.push("ff-bubble--full");

  return (
    <section id={id} className={classes.join(" ")}>
      <header className="ff-bubble__head">
        <h2 className="ff-bubble__title">{title}</h2>
        {actions ? <div className="ff-bubble__actions">{actions}</div> : null}
      </header>
      <div className="ff-bubble__body">{children}</div>
    </section>
  );
}
