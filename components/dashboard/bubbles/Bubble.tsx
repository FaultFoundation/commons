import type { ComponentPropsWithoutRef, ReactNode } from "react";

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
  className,
  media,
  actions,
  dragHandle,
  children,
  ...rest
}: {
  /** Anchor target, for pages that get deep-linked to a specific card. */
  id?: string;
  title: string;
  /** "danger" = red destructive card, "wip" = dimmed placeholder card. */
  variant?: "default" | "danger" | "wip";
  /** "full" spans the whole bubble grid row. Universal rule: the FIRST bubble
      on a page is always "full" — a tab opens on one thing, not two half
      things. Also used for Danger Zone-style footers. */
  span?: "full";
  /** Extra classes on the card itself, for per-page state (drag, drop target).
      Never for spacing — that comes from the density tokens. */
  className?: string;
  /** Leading visual beside the title — a team logo or avatar. Identity, not
      decoration: it belongs next to the name, not out in the action slot. */
  media?: ReactNode;
  /** Right side of the header: a badge, count, or small button. */
  actions?: ReactNode;
  /** A reorder grip, pinned bottom-right. Pass a <DragGrip> from a
      useReorderableGrid() when this bubble is one of a draggable set — the
      standard "drag to move this tile" affordance. Presence alone shows it. */
  dragHandle?: ReactNode;
  children?: ReactNode;
  /** Anything else lands on the <section>: drag handlers, aria-*, data-*. */
} & Omit<ComponentPropsWithoutRef<"section">, "id" | "title" | "className">) {
  const classes = ["ff-card", "ff-bubble"];
  if (variant !== "default") classes.push(`ff-bubble--${variant}`);
  if (span === "full") classes.push("ff-bubble--full");
  if (dragHandle) classes.push("ff-bubble--has-grip");
  if (className) classes.push(className);

  return (
    <section id={id} className={classes.join(" ")} {...rest}>
      <header className="ff-bubble__head">
        <div className="ff-bubble__heading">
          {media}
          <h2 className="ff-bubble__title">{title}</h2>
        </div>
        {actions ? <div className="ff-bubble__actions">{actions}</div> : null}
      </header>
      <div className="ff-bubble__body">{children}</div>
      {dragHandle ? <div className="ff-bubble__grip">{dragHandle}</div> : null}
    </section>
  );
}
