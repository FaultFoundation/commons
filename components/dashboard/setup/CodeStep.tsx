"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { resendCode, verifyCode } from "@/app/account/setup/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { clearSetupDraft } from "@/components/dashboard/setup/draft";
import { CODE_LENGTH } from "@/lib/registration-shared";

/**
 * The screen between setup steps 1 and 2: enter the code we just mailed.
 * Deliberately one bubble with one field — every other affordance
 * (resend, change email) is secondary.
 */
export function CodeStep({
  email,
  attemptsRemaining: initialAttempts,
  cooldownSeconds,
}: {
  email: string;
  attemptsRemaining: number;
  cooldownSeconds: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(initialAttempts);
  const [cooldown, setCooldown] = useState(cooldownSeconds);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  function onVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyCode(code);
      if (result.ok) {
        // Verified — the D1 row is the source of truth from here on.
        clearSetupDraft();
        router.push("/account/setup/integrations/");
        return;
      }
      setError(result.error);
      if (typeof result.attemptsRemaining === "number") {
        setAttemptsRemaining(result.attemptsRemaining);
      }
    });
  }

  function onResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendCode();
      if (!result.ok) {
        setError(result.error);
        if (result.cooldownSeconds) setCooldown(result.cooldownSeconds);
        return;
      }
      setCode("");
      setAttemptsRemaining(5);
      setCooldown(60);
    });
  }

  return (
    <div className="ff-bubble-grid ff-bubble-grid--single">
      {error ? (
        <div className="ff-auth__error ff-bubble--full" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <Bubble title="Check Your Inbox" span="full">
        <p className="ff-auth__hint">
          We sent a {CODE_LENGTH}-character code to{" "}
          <strong>{email || "your academic email"}</strong>. It expires in 24
          hours.
          {attemptsRemaining < 5 ? (
            <>
              {" "}
              {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"}{" "}
              left.
            </>
          ) : null}
        </p>
        <label className="ff-auth__field">
          <span className="ff-auth__label">Verification code</span>
          <input
            className="ff-auth__input ff-reg__code"
            type="text"
            value={code}
            maxLength={CODE_LENGTH}
            placeholder="XXXXXX"
            autoComplete="one-time-code"
            autoFocus
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.trim() && !pending) onVerify();
            }}
          />
        </label>
        <div className="ff-reg__nav">
          <button
            className="ff-btn ff-btn--outline"
            type="button"
            disabled={pending || cooldown > 0}
            onClick={onResend}
          >
            {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend code"}
          </button>
          <button
            className="ff-btn"
            type="button"
            disabled={pending || !code.trim()}
            onClick={onVerify}
          >
            {pending ? "Checking…" : "Verify"}
          </button>
        </div>
        <p className="ff-auth__meta">
          Wrong address?{" "}
          <a className="ff-reg__alt ff-reg__alt--inline" href="/account/setup/academic/">
            Change email
          </a>
        </p>
      </Bubble>
    </div>
  );
}
