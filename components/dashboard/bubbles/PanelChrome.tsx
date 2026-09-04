import type { ComponentPropsWithoutRef, ReactNode } from "react";

// ---------------------------------------------------------------------------
// The pinnable-panel contract.
//
// A "panel" is a bubble that can live on its own tab AND on the Home board. It
// renders its OWN <Bubble> — title, actions, body — so there is exactly one
// copy of the markup. The HOST decides the bubble's placement and hands it down
// as `chrome`:
//
//   tab:  <ResultsPanel data={…} />                       // no chrome
//   home: <ResultsPanel data={…} chrome={homeChrome} />   // span + drag + reorder
//
// This is what keeps "every bubble around the site is addable to Home" honest:
// Home never re-implements a condensed version of a tab's bubble, it mounts the
// same component. See lib/home-shared.ts for the registry that lists them.
// ---------------------------------------------------------------------------

/**
 * Bubble-level props a host supplies to a panel. Everything else (drag
 * handlers, aria-*, data-*) lands on the bubble's <section>, exactly as Bubble
 * already forwards it.
 */
export type PanelChrome = Omit<
  ComponentPropsWithoutRef<"section">,
  "id" | "title" | "className"
> & {
  /** "full" spans the grid. On Home this is the rotating row rhythm's call. */
  span?: "full";
  className?: string;
  /** The board's reorder grip, pinned bottom-right by Bubble. */
  dragHandle?: ReactNode;
  /** Host controls (the board's up/down buttons), placed BEFORE the panel's
      own actions so a panel's controls stay rightmost where members expect. */
  actions?: ReactNode;
};

/**
 * Merge a host's chrome with the panel's own bubble props.
 *
 * `span` is the one field the host fully OVERRIDES rather than merges: on a tab
 * the panel's own preference wins ("Calendar" is full-width on /schedule/), but
 * on Home the board's row rhythm decides, and a panel insisting on `full` there
 * would break the two-up rows. So chrome's span is used verbatim whenever
 * chrome is present — including `undefined`, which means "half".
 */
export function mergeChrome(
  chrome: PanelChrome | undefined,
  own: { span?: "full"; actions?: ReactNode; className?: string } = {},
) {
  const {
    actions: hostActions,
    className: hostClassName,
    span: hostSpan,
    ...rest
  } = chrome ?? {};

  const actions =
    hostActions || own.actions ? (
      <>
        {hostActions}
        {own.actions}
      </>
    ) : undefined;

  const className =
    [own.className, hostClassName].filter(Boolean).join(" ") || undefined;

  return {
    ...rest,
    span: chrome ? hostSpan : own.span,
    className,
    actions,
  };
}
