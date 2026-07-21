"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";

type Props = {
  mode: "login" | "signup";
  /** Server-decided: Discord OAuth secrets are configured. */
  discordEnabled: boolean;
};

export function AuthForm({ mode, discordEnabled }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

    // Full navigation (like the rest of the site's links); the hint makes
    // the destination paint the avatar immediately. A brand-new account
    // goes straight into setup; returning members land on the portal home.
    setAuthHint(true);
    window.location.assign(mode === "signup" ? "/account/setup/" : "/home/");
  }

  async function onDiscord() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.signIn.social({
      provider: "discord",
      // Can't tell a new Discord user from a returning one here; the
      // "action required" banner on /home catches anyone still unset-up.
      callbackURL: "/home/",
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
              <Link href="/signup/">Register one here</Link>.
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
