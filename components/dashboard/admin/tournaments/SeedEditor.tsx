"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { saveSeeds } from "@/app/admin/tournaments/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

export type SeedEntry = { id: string; label: string };

/**
 * Sets the seed order that gets pushed to Challonge on Start. A reorderable
 * list (▲▼) rather than free-typed seed numbers: the order is always a valid
 * permutation, so there's nothing to validate and no way to leave two entrants
 * fighting over seed 3. Seeds are 1..N top-to-bottom.
 *
 * Only editable while seeding; once the bracket is started, Challonge owns the
 * ordering and this renders read-only.
 */
export function SeedEditor({
  tournamentId,
  entrants,
  editable,
}: {
  tournamentId: string;
  entrants: SeedEntry[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<SeedEntry[]>(entrants);

  function swap(i: number, j: number) {
    if (j < 0 || j >= order.length) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveSeeds(
        tournamentId,
        order.map((e) => e.id),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!order.length) {
    return <p className="ff-auth__hint">No entrants yet.</p>;
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {order.map((entry, i) => (
        <BubbleRow
          key={entry.id}
          label={`${i + 1}. ${entry.label}`}
          action={
            editable ? (
              <div className="ff-row__buttons">
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending || i === 0}
                  aria-label={`Move ${entry.label} up`}
                  onClick={() => swap(i, i - 1)}
                >
                  ▲
                </button>
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending || i === order.length - 1}
                  aria-label={`Move ${entry.label} down`}
                  onClick={() => swap(i, i + 1)}
                >
                  ▼
                </button>
              </div>
            ) : undefined
          }
        />
      ))}

      {editable ? (
        <div className="ff-row__buttons">
          <button className="ff-btn ff-btn--sm" type="button" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save seeds"}
          </button>
        </div>
      ) : (
        <p className="ff-auth__hint">Seeding is locked — the bracket has started.</p>
      )}
    </>
  );
}
