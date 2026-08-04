"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { unlockAdmin } from "@/app/admin/actions";
import { authClient } from "@/lib/auth-client";
import { twoFactorError } from "@/lib/two-factor";

type Mode = "totp" | "otp";

/**
 * The two-factor step-up form. Rendered inside AdminUnlockDialog — it is the
 * body of the modal, not a page of its own. On success the server sets the
 * short-lived unlock cookie (app/admin/actions.ts) and `onUnlocked` decides
 * where the member goes: back to the admin URL they asked for, or just into
 * the newly-expanded Admin menu.
 *
 * Mirrors the sign-in TwoFactorChallenge, minus backup codes and trust-device:
 * this is a periodic re-proof by someone already signed in, not account
 * recovery. `methods` is server-reported so an email-only account never sees an
 * authenticator prompt it can't answer.
 */
export function AdminUnlock({
  methods,
  email,
  onUnlocked,
  onCancel,
}: {
  methods: string[];
  email: string;
  onUnlocked: () => void;
  /** Rendered beside Unlock so the dialog has one action row, not two. */
  onCancel: () => void;
}) {
  const hasTotp = methods.includes("totp");
  const hasOtp = methods.includes("otp");

  const [mode, setMode] = useState<Mode>(hasTotp ? "totp" : "otp");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);

  // Email-only accounts have nothing to type until a code has been sent, so
  // send one when the gate opens — exactly once (effects run twice in dev).
  const autoSent = useRef(false);
  useEffect(() => {
    if (hasTotp || !hasOtp || autoSent.current) return;
    autoSent.current = true;
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTotp, hasOtp]);

  async function sendCode() {
    if (sending) return;
    setSending(true);
    setError(null);
    const result = await authClient.twoFactor.sendOtp();
    setSending(false);
    if (result.error) {
      setError(twoFactorError(result.error));
      return;
    }
    setMode("otp");
    setNotice(`We sent a code to ${email}. It expires in five minutes.`);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).trim();

    setPending(true);
    const result = await unlockAdmin({ code, method: mode });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    // The unlock cookie is set. Leave `pending` true: the caller navigates or
    // refreshes from here, and re-enabling the button first only invites a
    // second submit against an already-spent code.
    onUnlocked();
  }

  return (
    <form className="ff-admin-unlock" onSubmit={onSubmit}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <p className="ff-auth__hint">
        {mode === "totp"
          ? "Enter the six-digit code from your authenticator app to make changes."
          : (notice ?? `We sent a code to ${email}.`)}
      </p>

      <label className="ff-auth__field">
        <span className="ff-auth__label">Code</span>
        <input
          key={mode}
          className="ff-auth__input"
          name="code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          autoFocus
          required
        />
      </label>

      <p className="ff-auth__hint ff-auth__alts">
        {hasOtp && mode !== "otp" ? (
          <button
            className="ff-link-btn"
            type="button"
            onClick={sendCode}
            disabled={sending}
          >
            {sending ? "Sending…" : `Email a code to ${email}`}
          </button>
        ) : null}
        {mode === "otp" ? (
          <button
            className="ff-link-btn"
            type="button"
            onClick={sendCode}
            disabled={sending}
          >
            {sending ? "Sending…" : "Send a new code"}
          </button>
        ) : null}
        {hasTotp && mode !== "totp" ? (
          <button
            className="ff-link-btn"
            type="button"
            onClick={() => {
              setError(null);
              setMode("totp");
            }}
          >
            Use your authenticator app
          </button>
        ) : null}
      </p>

      <div className="ff-dialog__actions">
        <button
          type="button"
          className="ff-btn ff-btn--outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
        <button className="ff-btn" type="submit" disabled={pending}>
          {pending ? "Verifying…" : "Unlock admin"}
        </button>
      </div>
    </form>
  );
}
