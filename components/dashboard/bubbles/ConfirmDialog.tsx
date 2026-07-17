"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal confirmation for destructive actions, built on native <dialog>
 * (Esc dismissal and focus trapping come free; showModal focuses the
 * first field). The parent owns all state — including any input rendered
 * as children — and Enter anywhere in the form confirms.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  /** Disables both buttons and blocks Esc while a request is in flight. */
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="ff-dialog"
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <h2 className="ff-dialog__title">{title}</h2>
      {description ? <p className="ff-dialog__text">{description}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        {children}
        {error ? (
          <div className="ff-auth__error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <div className="ff-dialog__actions">
          <button
            type="button"
            className="ff-btn ff-btn--outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={danger ? "ff-btn ff-btn--danger" : "ff-btn"}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
