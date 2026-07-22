"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

/**
 * BubbleRow whose value slot is a live text field, prefilled with what's
 * already stored, plus a Save Changes button in the action slot.
 *
 * This replaced an "Edit →" button that expanded a one-field form: the extra
 * click bought nothing, and a settings page reads better when the current value
 * is legible and selectable without entering a mode. Save Changes stays
 * disabled until the field actually differs, which is what keeps a page of
 * always-live inputs from looking like a page of pending edits.
 *
 * The `<form>` lives in the field slot while its submit button lives in the
 * action slot, wired together by `form={id}` — the two are in different grid
 * columns, so one can't wrap the other. That also means Enter in the input
 * submits this row and only this row.
 *
 * Multi-field editors (password, two-factor enrollment) are written bespoke on
 * top of `BubbleRow` instead; this is deliberately the single-value shape.
 */
export function FieldRow({
  label,
  value,
  inputLabel,
  inputType = "text",
  autoComplete,
  minLength,
  maxLength,
  placeholder,
  required = true,
  note,
  status,
  statusLabel,
  locked,
  lockTitle,
  saveLabel = "Save Changes",
  savedNote,
  onSave,
  children,
}: {
  label: string;
  /** The stored value. Pass "" for unset — never a placeholder like "—", or
      the member has to delete it before they can type. */
  value: string;
  /** Accessible name for the input; defaults to `label`. */
  inputLabel?: string;
  inputType?: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  /** Set false for fields that may be cleared (a team's tag, say). */
  required?: boolean;
  note?: string;
  /** Trailing indicator inside the field: confirmed vs needs attention. */
  status?: "verified" | "warning";
  /** What the indicator means, e.g. "Verified". Required with `status`. */
  statusLabel?: string;
  /** Read-only: disabled input, lock icon, muted row. */
  locked?: boolean;
  lockTitle?: string;
  saveLabel?: string;
  /** Shown after a successful save, until the field is edited again. Use it
      when success isn't visible in the field itself — "check your inbox". */
  savedNote?: string;
  /** Resolves to an error message to display, or null on success. Omit on
      locked rows. */
  onSave?: (value: string) => Promise<string | null>;
  /** Extra controls under the field (a Resend button, say). */
  children?: ReactNode;
}) {
  const formId = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  // The server is the source of truth: when a save lands and the page
  // re-renders, adopt the new value rather than keeping a stale draft. Done in
  // render rather than an effect so there's no frame showing the old text.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
    setError(null);
  }

  const dirty = draft !== value;

  // BubbleRow draws the editor area — a top margin and a dashed rule — for any
  // truthy `children`, and a fragment of three nulls is still truthy. Without
  // this every quiet field row would carry an empty dashed box.
  const showSaved = saved && Boolean(savedNote);
  const hasFooter = Boolean(error) || showSaved || Boolean(children);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !onSave) return;
    setError(null);
    setSaved(false);
    setPending(true);
    const failure = await onSave(draft.trim());
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSaved(true);
  }

  return (
    <BubbleRow
      label={label}
      note={note}
      locked={locked}
      lockTitle={lockTitle}
      field={
        <form id={formId} onSubmit={onSubmit}>
          <label className="screen-reader-text" htmlFor={`${formId}-input`}>
            {inputLabel ?? label}
          </label>
          <input
            id={`${formId}-input`}
            className="ff-auth__input"
            type={inputType}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
              setError(null);
            }}
            autoComplete={autoComplete}
            minLength={minLength}
            maxLength={maxLength}
            placeholder={placeholder}
            required={required}
            disabled={locked || pending}
          />
          {status ? (
            <StatusIcon kind={status} label={statusLabel ?? status} />
          ) : null}
        </form>
      }
      action={
        onSave ? (
          <button
            className="ff-btn ff-btn--sm"
            type="submit"
            form={formId}
            disabled={!dirty || pending}
          >
            {pending ? "Saving…" : saveLabel}
          </button>
        ) : undefined
      }
    >
      {hasFooter ? (
        <>
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}
          {showSaved ? (
            <p className="ff-row__saved" role="status">
              {savedNote}
            </p>
          ) : null}
          {children}
        </>
      ) : undefined}
    </BubbleRow>
  );
}

/** Sits inside the field's right edge. The label is the accessible text —
    the shape alone must not be the only thing carrying the meaning. */
function StatusIcon({
  kind,
  label,
}: {
  kind: "verified" | "warning";
  label: string;
}) {
  return (
    <svg
      className={`ff-row__status ff-row__status--${kind}`}
      viewBox="0 0 16 16"
      fill="currentColor"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {kind === "verified" ? (
        <path d="M6.2 11.9 2.6 8.3l1.2-1.2 2.4 2.4 6-6 1.2 1.2z" />
      ) : (
        <path
          fillRule="evenodd"
          d="M7.1 1.9a1 1 0 0 1 1.8 0l6 11.2a1 1 0 0 1-.9 1.5H2a1 1 0 0 1-.9-1.5zM8 5.5a.9.9 0 0 0-.9 1l.3 3a.6.6 0 0 0 1.2 0l.3-3a.9.9 0 0 0-.9-1M8 11a.9.9 0 1 0 0 1.8A.9.9 0 0 0 8 11"
        />
      )}
    </svg>
  );
}
