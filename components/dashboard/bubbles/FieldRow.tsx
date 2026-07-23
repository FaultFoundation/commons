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
  belowField,
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
  /** Defaults to "off". Only set this when the field really is a credential —
      anything else invites a password manager to offer a login. */
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  /** Set false for fields that may be cleared (a team's tag, say). */
  required?: boolean;
  note?: string;
  /** Trailing glyph inside the field: confirmed vs needs attention. */
  status?: "verified" | "warning";
  /** What the glyph means, e.g. "Verified". Required with `status`. */
  statusLabel?: string;
  /** Read-only: disabled input plus a lock glyph beside any `status`. The row
      keeps the ordinary background — the glyph carries the meaning. */
  locked?: boolean;
  /** Why it's locked. Surfaces on hover over the lock, and as its accessible
      name, so a locked row needs no explanatory note of its own. */
  lockTitle?: string;
  saveLabel?: string;
  /** Shown after a successful save, until the field is edited again. Use it
      when success isn't visible in the field itself — "check your inbox". */
  savedNote?: string;
  /** A follow-up control that sits directly under the field, in the note's
      place — no dashed separator. For something that belongs *with* the field,
      like "Resend verification email". Transient save feedback (`children`,
      errors, `savedNote`) still renders in the editor area below. */
  belowField?: ReactNode;
  /** Resolves to an error message to display, or null on success. Omit on
      locked rows. */
  onSave?: (value: string) => Promise<string | null>;
  /** Extra controls in the editor area under the field, behind a dashed
      separator (transient feedback). */
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
      belowField={belowField}
      field={
        // autoComplete="off" on the form as well as the input: password
        // managers read the form, not just the field.
        <form id={formId} onSubmit={onSubmit} autoComplete="off">
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
            // Defaults to "off". A settings field is never a credential:
            // advertising `email`/`username` here is what makes browsers and
            // password managers offer to fill a *login*, which on the Account
            // tab is a sign-in prompt over a page you're already signed in to.
            autoComplete={autoComplete ?? "off"}
            // autocomplete alone doesn't stop the extensions — each honours its
            // own opt-out attribute, and Chrome ignores "off" on fields it has
            // decided look like a login.
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            minLength={minLength}
            maxLength={maxLength}
            placeholder={placeholder}
            required={required}
            disabled={locked || pending}
          />
          {/* Trailing glyphs, in the field's right edge. A locked field can
              also carry a status (a verified school email is both), so this is
              a stack rather than one slot. The lock goes first because the CSS
              puts the first glyph outermost — that keeps it in the same column
              on a locked row with a status and one without, which is what makes
              School and School email line up. */}
          {locked ? (
            <StatusIcon
              kind="locked"
              label={lockTitle ?? "Locked — contact support to change"}
            />
          ) : null}
          {status ? (
            <StatusIcon kind={status} label={statusLabel ?? status} />
          ) : null}
        </form>
      }
      action={
        onSave ? (
          <button
            // Outline while there is nothing to save, blue once there is: the
            // colour is the affordance, so a page of live fields still reads
            // as settled. See docs/dashboard-guide.md.
            className={
              dirty ? "ff-btn ff-btn--sm" : "ff-btn ff-btn--outline ff-btn--sm"
            }
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

const ICONS: Record<FieldIcon, string> = {
  verified: "M6.2 11.9 2.6 8.3l1.2-1.2 2.4 2.4 6-6 1.2 1.2z",
  warning:
    "M7.1 1.9a1 1 0 0 1 1.8 0l6 11.2a1 1 0 0 1-.9 1.5H2a1 1 0 0 1-.9-1.5zM8 5.5a.9.9 0 0 0-.9 1l.3 3a.6.6 0 0 0 1.2 0l.3-3a.9.9 0 0 0-.9-1M8 11a.9.9 0 1 0 0 1.8A.9.9 0 0 0 8 11",
  locked:
    "M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z",
};

type FieldIcon = "verified" | "warning" | "locked";

/**
 * Sits inside the field's right edge.
 *
 * `<title>` is doing real work here: it is both the pointer-hover tooltip and,
 * with `aria-label`, the accessible name. For a locked field that tooltip is
 * the *only* place the reason lives — the explanatory note under the field was
 * removed, because five rows each repeating "contact support" was most of the
 * card's height and none of its meaning.
 */
function StatusIcon({ kind, label }: { kind: FieldIcon; label: string }) {
  return (
    <svg
      className={`ff-row__status ff-row__status--${kind}`}
      viewBox="0 0 16 16"
      fill="currentColor"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path fillRule="evenodd" d={ICONS[kind]} />
    </svg>
  );
}
