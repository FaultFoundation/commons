"use client";

/**
 * A toggle switch — the standard on/off control across the dashboard, in place
 * of a "Turn on / Turn off" button. Drop it into a BubbleRow's `action` slot:
 *
 *   <BubbleRow label="Third-Place Match" note="…"
 *     action={<Switch checked={on} onChange={setOn} label="Third-place match" />} />
 *
 * Renders a real `role="switch"` so keyboard and screen readers get the right
 * semantics; the visible label lives on the row, so `label` is the a11y name.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — the row's visible label. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`ff-switch${checked ? " ff-switch--on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ff-switch__thumb" aria-hidden="true" />
    </button>
  );
}
