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
  titleHidden,
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
  /** Keep the title for assistive tech but take it out of the layout, for the
      rare bubble whose BODY already carries the same heading as its own
      section head (the tournaments list). The card still has exactly one
      visible heading — it just lives with the content it names. Not a way to
      ship an unlabelled card: the title stays required and is still read. */
  titleHidden?: boolean;
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

  // With the title hidden and nothing else to place, the header row would
  // contribute only its gap, so it is dropped and the clipped heading stands
  // alone. Any host chrome (Home's reorder buttons) keeps the row, where the
  // zero-width heading lets space-between hold the actions right as usual.
  const headerless = titleHidden && !media && !actions;
  const heading = (
    <h2 className={titleHidden ? "screen-reader-text" : "ff-bubble__title"}>
      {title}
    </h2>
  );

  return (
    <section id={id} className={classes.join(" ")} {...rest}>
      {headerless ? (
        heading
      ) : (
        <header className="ff-bubble__head">
          <div className="ff-bubble__heading">
            {media}
            {heading}
          </div>
          {actions ? <div className="ff-bubble__actions">{actions}</div> : null}
        </header>
      )}
      <div className="ff-bubble__body">{children}</div>
      {dragHandle ? <div className="ff-bubble__grip">{dragHandle}</div> : null}
    </section>
  );
}
