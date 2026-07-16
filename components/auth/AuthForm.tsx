"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

type Props = {
  mode: "login" | "signup";
  /** Server-decided: Discord OAuth secrets are configured. */
  discordEnabled: boolean;
};

export function AuthForm({ mode, discordEnabled }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

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

    router.push("/dashboard/");
    router.refresh();
  }

  async function onDiscord() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.signIn.social({
      provider: "discord",
      callbackURL: "/dashboard/",
    });
    if (result.error) {
      setError(result.error.message ?? "Discord sign-in failed. Please try again.");
      setPending(false);
    }
    // On success the browser navigates to Discord; no state to reset.
  }

  return (
    <form onSubmit={onSubmit} noValidate={false}>
      {error ? (
        <p className="ff-auth__error" role="alert">
          {error}
        </p>
      ) : null}

      {mode === "signup" ? (
        <label className="ff-auth__field">
          <span className="ff-auth__label">Display name</span>
          <input
            className="ff-auth__input"
            type="text"
            name="name"
            autoComplete="name"
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
          required
          minLength={8}
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
