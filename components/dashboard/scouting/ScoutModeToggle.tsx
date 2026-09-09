"use client";

import type { ScoutMode } from "@/lib/faceit-scouting-shared";

// The Quick / Deep switch that sits left of the Scout button. Quick pulls the
// recent ~50 games fast (approximate); Deep waits behind a load screen until the
// full history is collected (accurate). A segmented two-option control.

export function ScoutModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: ScoutMode;
  onChange: (mode: ScoutMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="ff-scoutmode"
      role="radiogroup"
      aria-label="Search depth"
    >
      {(["quick", "deep"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          disabled={disabled}
          className={`ff-scoutmode__opt${mode === m ? " ff-scoutmode__opt--on" : ""}`}
          onClick={() => onChange(m)}
          title={
            m === "quick"
              ? "Fast — recent ~50 games"
              : "Thorough — waits for the full match history"
          }
        >
          {m === "quick" ? "Quick" : "Deep"}
        </button>
      ))}
    </div>
  );
}
