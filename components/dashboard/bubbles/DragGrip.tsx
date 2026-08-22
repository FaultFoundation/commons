"use client";

import type { ComponentPropsWithoutRef } from "react";

/**
 * The reorder grip — a 9-dot "move" affordance pinned to a bubble's bottom-right
 * (via the Bubble `dragHandle` slot). Grabbing it arms the tile for dragging;
 * spread a `handleProps(index)` from useReorderableGrid onto it. Keyboard users
 * reorder with the section's up/down buttons, so the grip is aria-hidden.
 */
export function DragGrip({
  label,
  ...props
}: { label: string } & ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className="ff-drag-grip"
      title="Drag to reorder"
      aria-hidden="true"
      {...props}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        {[3, 8, 13].map((y) =>
          [4, 8, 12].map((x) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" />
          )),
        )}
      </svg>
      <span className="screen-reader-text">{label}</span>
    </span>
  );
}
