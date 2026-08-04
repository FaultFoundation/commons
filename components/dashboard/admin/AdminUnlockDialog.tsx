"use client";

import { useEffect, useRef, useState } from "react";

import { getUnlockPrompt, type UnlockPrompt } from "@/app/admin/actions";
import { AdminUnlock } from "@/components/dashboard/admin/AdminUnlock";

/**
 * The two-factor step-up, as a modal.
 *
 * It used to render in place of the admin page's content, which meant every
 * route into admin went through a full page that looked like a dead end. As a
 * dialog the member stays where they are: the rail opens it before expanding
 * the Admin group, and a direct hit on an admin URL bounces to Home with it
 * already open (see AdminGate).
 *
 * Built on native <dialog> like ConfirmDialog — Esc dismissal and focus
 * trapping come free. It is **not** ConfirmDialog itself: there is no
 * Cancel/Confirm pair here, the body owns its own submit button and its own
 * alternate-method links.
 *
 * Nothing about this dialog is a security boundary. It exists so staff aren't
 * sent somewhere confusing; the actual gate is AdminGate plus the
 * requireAdminUnlock check that opens every privileged server action.
 */
export function AdminUnlockDialog({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after the unlock cookie is set — the caller decides where to go. */
  onUnlocked: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState<UnlockPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Fetch on open, not on mount: the shell renders this on every portal page
  // and the query is only worth paying for once someone actually asks to
  // unlock. Re-fetched each time it opens so enrolling in another tab is
  // picked up without a reload.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setPrompt(null);
    void (async () => {
      const result = await getUnlockPrompt();
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPrompt(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <dialog ref={ref} className="ff-dialog ff-dialog--unlock" onClose={onClose}>
      <h2 className="ff-dialog__title">
        {prompt && !prompt.twoFactorEnabled
          ? "Two-Factor Required"
          : "Verify to Continue"}
      </h2>

      {error ? (
        <>
          <div className="ff-auth__error" role="alert">
            <p>{error}</p>
          </div>
          <div className="ff-dialog__actions">
            <button
              type="button"
              className="ff-btn ff-btn--outline"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </>
      ) : !prompt ? (
        <p className="ff-dialog__text">Checking your account…</p>
      ) : !prompt.twoFactorEnabled ? (
        <>
          <p className="ff-dialog__text">
            Admin access needs two-factor authentication. Turn it on in your
            account, then come back.
          </p>
          <div className="ff-dialog__actions">
            <button
              type="button"
              className="ff-btn ff-btn--outline"
              onClick={onClose}
            >
              Not now
            </button>
            <a className="ff-btn" href="/account/">
              Go to Account
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="ff-dialog__text">
            Confirm it&rsquo;s you. This keeps admin unlocked for a short while.
          </p>
          <AdminUnlock
            methods={prompt.methods}
            email={prompt.email}
            onUnlocked={onUnlocked}
            onCancel={onClose}
          />
        </>
      )}
    </dialog>
  );
}
