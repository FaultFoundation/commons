"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { TwoFactorChallenge } from "./TwoFactorChallenge";
import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";
import { withNext } from "@/lib/next-path";

type Props = {
  mode: "login" | "signup";
  /** Server-decided: Discord OAuth secrets are configured. */
  discordEnabled: boolean;
  /** Where to land afterwards instead of the default, e.g. an invite the
      member opened while signed out. Already sanitized by the page. */
  next?: string;
};

/**
 * Sign-in responses carry `twoFactorRedirect` instead of a session when the
 * account has a second factor. The client plugin's own redirect options are
 * deliberately unused (see lib/auth-client.ts), so this reads the flag off the
 * body and swaps in the challenge step in place.
 */
function twoFactorMethodsOf(data: unknown): string[] | null {
  if (!data || typeof data !== "object") return null;
  const body = data as { twoFactorRedirect?: boolean; twoFactorMethods?: unknown };
  if (!body.twoFactorRedirect) return null;
  return Array.isArray(body.twoFactorMethods)
    ? body.twoFactorMethods.filter((m): m is string => typeof m === "string")
    : [];
}

export function AuthForm({ mode, discordEnabled, next }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Set once the password checks out but a second factor is still owed. Holds
  // the email too, so the challenge can say where its codes are going.
  const [challenge, setChallenge] = useState<{
    methods: string[];
    email: string;
  } | null>(null);

  /**
   * Full navigation (like the rest of the site's links); the hint makes the
   * destination paint the avatar immediately. A brand-new account goes straight
   * into setup; returning members land on the portal home. Either is overridden
   * by a `next` (an invite link, say), which then explains for itself whatever
   * is still missing.
   */
  function land() {
    setAuthHint(true);
    window.location.assign(
      next ?? (mode === "signup" ? "/account/setup/" : "/home/"),
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    // Login skips native field validation (those hints belong to
    // registration); just make sure something was entered.
    if (mode === "login" && (!email || !password)) {
      setError("Enter your email and password.");
      return;
    }

    setPending(true);
    const result =
      mode === "signup"
        ? await authClient.signUp.email({
            name: String(form.get("name") ?? "").trim(),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Something went wrong. Please try again.");
      setPending(false);
      return;
    }

    const methods = twoFactorMethodsOf(result.data);
    if (methods) {
      setPending(false);
      setChallenge({ methods, email });
      return;
    }

    land();
  }

  if (challenge) {
    return (
      <TwoFactorChallenge
        methods={challenge.methods}
        email={challenge.email}
        onVerified={land}
      />
    );
  }

  async function onDiscord() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.signIn.social({
      provider: "discord",
      // Can't tell a new Discord user from a returning one here; the
      // "action required" banner on /home catches anyone still unset-up.
      callbackURL: next ?? "/home/",
    });
    if (result.error) {
      setError(result.error.message ?? "Discord sign-in failed. Please try again.");
      setPending(false);
    }
    // On success the browser navigates to Discord; no state to reset.
  }

  return (
    <form onSubmit={onSubmit} noValidate={mode === "login"}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
          {mode === "login" ? (
            <p>
              Don&rsquo;t have an account?{" "}
              <Link href={withNext("/signup/", next)}>Register one here</Link>.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "signup" ? (
        <label className="ff-auth__field">
          <span className="ff-auth__label">Display name</span>
          <input
            className="ff-auth__input"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Your display name"
            required
            maxLength={80}
          />
        </label>
      ) : null}

      <label className="ff-auth__field">
        <span className="ff-auth__label">Email</span>
        <input
          className="ff-auth__input"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </label>

      <label className="ff-auth__field">
        <span className="ff-auth__label">Password</span>
        <input
          className="ff-auth__input"
          type="password"
          name="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
        />
      </label>

      <button className="ff-btn ff-auth__submit" type="submit" disabled={pending}>
        {mode === "signup" ? "Create account" : "Sign in"}
      </button>

      {discordEnabled ? (
        <>
          <div className="ff-auth__divider" aria-hidden="true">
            or
          </div>
          <button
            className="ff-btn ff-btn--outline ff-auth__submit"
            type="button"
            onClick={onDiscord}
            disabled={pending}
          >
            Continue with Discord
          </button>
        </>
      ) : null}
    </form>
  );
}
