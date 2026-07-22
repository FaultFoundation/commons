"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setDensity } from "@/app/account/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import {
  DENSITIES,
  DENSITY_HINTS,
  DENSITY_LABELS,
  type Density,
} from "@/lib/density";

/**
 * How tightly bubbles pack their rows, as a segmented control.
 *
 * The preview is immediate and local: flipping data-density on the enclosing
 * .ff-dash re-resolves every spacing token in styles/theme.css, so the whole
 * portal reflows before the action has even been sent. The action then makes it
 * durable (D1 + cookie) and router.refresh() re-renders the tree so a reload
 * doesn't snap back.
 */
export function DensityRow({ initial }: { initial: Density }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [density, setLocal] = useState<Density>(initial);
  const [error, setError] = useState<string | null>(null);

  function choose(next: Density) {
    if (next === density) return;
    const previous = density;
    setLocal(next);
    setError(null);
    // The shell owns this attribute on the server; mirror it here so the change
    // is visible on this paint rather than after the round trip.
    document.querySelector(".ff-dash")?.setAttribute("data-density", next);

    startTransition(async () => {
      const result = await setDensity(next);
      if (!result.ok) {
        setLocal(previous);
        document
          .querySelector(".ff-dash")
          ?.setAttribute("data-density", previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <BubbleRow
      label="Bubble density"
      value={DENSITY_LABELS[density]}
      note={DENSITY_HINTS[density]}
      action={
        <div className="ff-segment" role="group" aria-label="Bubble density">
          {DENSITIES.map((option) => (
            <button
              key={option}
              className="ff-segment__btn"
              type="button"
              // A radio group's semantics, without leaving the button styling.
              aria-pressed={option === density}
              title={DENSITY_HINTS[option]}
              disabled={pending}
              onClick={() => choose(option)}
            >
              {DENSITY_LABELS[option]}
            </button>
          ))}
        </div>
      }
    >
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : undefined}
    </BubbleRow>
  );
}
