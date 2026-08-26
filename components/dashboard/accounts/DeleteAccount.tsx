"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";

export function DeleteAccount({
  hasPassword,
}: {
  /** Credential account exists — deletion must be confirmed with it. */
  hasPassword: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  async function onConfirm() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.deleteUser(hasPassword ? { password } : {});
    if (result.error) {
      setPending(false);
      // Password-less deletion needs a fresh (<24h) session.
      setError(
        result.error.status === 403
          ? "For security, sign out and back in, then try again."
          : (result.error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    setAuthHint(false);
    window.location.assign("/");
  }

  function onClose() {
    if (pending) return;
    setOpen(false);
    setError(null);
    setPassword("");
  }

  return (
    <>
      <button
        className="ff-btn ff-btn--outline ff-btn--sm"
        type="button"
        onClick={() => setOpen(true)}
      >
        Delete Account
      </button>
      <ConfirmDialog
        open={open}
        title="Delete Your Account"
        description="This permanently deletes your account and signs you out everywhere. School verification can't be transferred to another account."
        confirmLabel="Delete Account"
        danger
        busy={pending}
        error={error}
        onConfirm={onConfirm}
        onClose={onClose}
      >
        {hasPassword ? (
          <label className="ff-auth__field">
            <span className="ff-auth__label">Confirm your password</span>
            <input
              className="ff-auth__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
