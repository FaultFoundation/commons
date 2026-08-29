"use client";

import type { CSSProperties } from "react";

import { TEAM_COLORS } from "@/lib/teams-shared";

/**
 * The team colour chooser — a row of preset swatches plus a native custom
 * picker. Shared by the create form, the Start a Team dialog, and team settings.
 * The value is always a hex string the parent owns; the accent shows up on the
 * team's card and hero (a stripe + logo ring), not as a full banner.
 */
export function TeamColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const current = value.toLowerCase();
  return (
    <div className="ff-color-picker">
      <div
        className="ff-color-swatches"
        role="radiogroup"
        aria-label="Team colour"
      >
        {TEAM_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={current === c}
            className={`ff-color-swatch${current === c ? " ff-color-swatch--on" : ""}`}
            style={{ "--swatch": c } as CSSProperties}
            title={c}
            disabled={disabled}
            onClick={() => onChange(c)}
          >
            <span className="screen-reader-text">{c}</span>
          </button>
        ))}
        <label className="ff-color-custom" title="Custom colour">
          <span className="screen-reader-text">Custom colour</span>
          <input
            type="color"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
