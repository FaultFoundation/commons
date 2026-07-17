"use client";

import { useState, type FormEvent } from "react";

import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

/**
 * BubbleRow with an Edit button that expands into a single-field inline
 * editor (the mockup's edit-in-place pattern). The caller owns the save
 * behavior; multi-field editors (password) are bespoke instead.
 */
export function InlineEditRow({
  label,
  value,
  inputLabel,
  inputType = "text",
  autoComplete,
  minLength,
  maxLength,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  /** Field label inside the editor, e.g. "New username". */
  inputLabel: string;
  inputType?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  /** Resolves to an error message to display, or null on success. */
  onSave: (value: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const next = String(new FormData(event.currentTarget).get("value") ?? "").trim();
    setPending(true);
    const failure = await onSave(next);
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setEditing(false);
  }

  return (
    <BubbleRow
      label={label}
      value={value}
      action={
        !editing ? (
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form onSubmit={onSubmit}>
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}
          <label className="ff-auth__field">
            <span className="ff-auth__label">{inputLabel}</span>
            <input
              className="ff-auth__input"
              name="value"
              type={inputType}
              defaultValue={value}
              autoComplete={autoComplete}
              minLength={minLength}
              maxLength={maxLength}
              placeholder={placeholder}
              required
            />
          </label>
          <div className="ff-row__buttons">
            <button className="ff-btn ff-btn--sm" type="submit" disabled={pending}>
              Save
            </button>
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : undefined}
    </BubbleRow>
  );
}
