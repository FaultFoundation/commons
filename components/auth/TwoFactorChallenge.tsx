"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { twoFactorError } from "@/lib/two-factor";

type Mode = "totp" | "otp" | "backup";

/**
 * The second step of signing in, shown in place of the email/password form.
 *
 * At this point there is deliberately no session — Better Auth deleted the one
 * the password earned and left a short-lived challenge cookie in its place, so
 * everything here rides on that cookie and it expires in ten minutes. Failing
 * past the attempt budget consumes it outright, which is why the errors
 * distinguish "try again" from "start over" (see lib/two-factor.ts).
 *
 * Which factors are on offer comes from the server, not from us: `methods` is
 * what the sign-in response reported, so an account that enrolled by email
 * never sees an authenticator prompt it couldn't answer.
 */
export function TwoFactorChallenge({
  methods,
  email,
  onVerified,
}: {
  /** Server-reported: some subset of ["totp", "otp"]. */
  methods: string[];
  email: string;
  onVerified: () => void;
}) {
  const hasTotp = methods.includes("totp");
  const hasOtp = methods.includes("otp");

  const [mode, setMode] = useState<Mode>(hasTotp ? "totp" : "otp");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);

  // Email-only accounts have nothing to type until a code has been sent, so
  // send one the moment the step opens. The ref makes that exactly once —
  // React runs effects twice in development, and a second send would invalidate
  // the code already sitting in the member's inbox.
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

    const form = new FormData(event.currentTarget);
    // Backup codes are mixed case and compared exactly, so only whitespace is
    // safe to strip.
    const code = String(form.get("code") ?? "").trim();
    const trustDevice = form.get("trustDevice") === "on";

    setPending(true);
    const result =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : mode === "otp"
          ? await authClient.twoFactor.verifyOtp({ code, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (result.error) {
      setPending(false);
      setError(twoFactorError(result.error));
      return;
    }
    onVerified();
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <p className="ff-auth__hint">
        {mode === "totp"
          ? "Enter the six-digit code from your authenticator app."
          : mode === "otp"
            ? (notice ?? `We sent a code to ${email}.`)
            : "Enter one of the backup codes you saved when you turned on two-factor authentication."}
      </p>

      <label className="ff-auth__field">
        <span className="ff-auth__label">
          {mode === "backup" ? "Backup code" : "Code"}
        </span>
        <input
          // Remounts on a mode change, so switching factors clears whatever
          // was half-typed for the previous one.
          key={mode}
          className="ff-auth__input"
          name="code"
          type="text"
          autoComplete={mode === "backup" ? "off" : "one-time-code"}
          inputMode={mode === "backup" ? "text" : "numeric"}
          maxLength={mode === "backup" ? 11 : 6}
          placeholder={mode === "backup" ? "abcde-12345" : "123456"}
          autoFocus
          required
        />
      </label>

      <label className="ff-auth__field ff-auth__check">
        <input type="checkbox" name="trustDevice" />
        <span>Trust this device for 30 days</span>
      </label>

      <button className="ff-btn ff-auth__submit" type="submit" disabled={pending}>
        {pending ? "Verifying…" : "Verify"}
      </button>

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
        {/* Always reachable: a lost phone and an unreachable inbox are exactly
            when this is needed, and there is no admin tooling to recover an
            account by hand. */}
        {mode === "backup" ? null : (
          <button
            className="ff-link-btn"
            type="button"
            onClick={() => {
              setError(null);
              setMode("backup");
            }}
          >
            Use a backup code
          </button>
        )}
      </p>
    </form>
  );
}
