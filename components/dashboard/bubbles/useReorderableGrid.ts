"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type DragEvent } from "react";

// ---------------------------------------------------------------------------
// Reusable "drag a tile to reorder" template for any .ff-bubble-grid.
//
// The standard pattern: a section renders its bubbles from `order`, spreads
// `bubbleProps(index)` onto each Bubble, and passes `<DragGrip {...handleProps(
// index)} />` as the bubble's `dragHandle`. Every bubble is then *movable*, but
// a drag only starts when the pointer is pressed on the grip — the section's
// `draggable` attribute is armed by the handle and disarmed on drop/end, so the
// rest of the card (links, buttons) behaves normally.
//
// Reordering is optimistic: the grid rearranges immediately and rolls back only
// if the server refuses. Keyboard/screen-reader users move tiles with the
// section's own up/down buttons (which call `reorder`), never the pointer grip.
// ---------------------------------------------------------------------------

export type ReorderResult = { ok: boolean; error?: string };

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function useReorderableGrid<T>({
  items,
  getId,
  onReorder,
}: {
  items: T[];
  getId: (item: T) => string;
  /** Persists the new order server-side; receives ids in their new order. */
  onReorder: (orderedIds: string[]) => Promise<ReorderResult>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [order, setOrder] = useState(items);
  // The id whose grip is currently pressed — the only tile allowed to drag.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Router refreshes deliver a new server-owned list after creates, joins, and
  // successful reorders. Keep the local drag order in sync with that source.
  useEffect(() => {
    setOrder(items);
  }, [items]);

  function commit(next: T[]) {
    if (next === order) return;
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await onReorder(next.map(getId));
      if (!result.ok) {
        setOrder(previous);
        setError(result.error ?? "Couldn't save the new order.");
        return;
      }
      router.refresh();
    });
  }

  function reorder(from: number, to: number) {
    commit(moveItem(order, from, to));
  }

  function reset() {
    setDragging(null);
    setOver(null);
    setArmed(null);
  }

  /** Spread onto each Bubble in `order`. */
  function bubbleProps(index: number) {
    const id = getId(order[index]);
    const classes = ["ff-bubble--draggable"];
    if (id === dragging) classes.push("ff-bubble--dragging");
    if (id === over && id !== dragging) classes.push("ff-bubble--dropzone");
    return {
      className: classes.join(" "),
      draggable: armed === id,
      onDragStart: () => setDragging(id),
      onDragEnd: reset,
      onDragOver: (event: DragEvent) => {
        event.preventDefault();
        setOver(id);
      },
      onDragLeave: () => setOver((current) => (current === id ? null : current)),
      onDrop: (event: DragEvent) => {
        event.preventDefault();
        const from = order.findIndex((item) => getId(item) === dragging);
        reset();
        if (from !== -1) reorder(from, index);
      },
    };
  }

  /** Spread onto the <DragGrip> for the same index. */
  function handleProps(index: number) {
    const id = getId(order[index]);
    return {
      onPointerDown: () => setArmed(id),
      onPointerUp: () => setArmed((current) => (current === id ? null : current)),
    };
  }

  return { order, error, reorder, bubbleProps, handleProps };
}
