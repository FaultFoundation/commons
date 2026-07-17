"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { InlineEditRow } from "./InlineEditRow";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { authClient } from "@/lib/auth-client";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export function NameRow({ initialName }: { initialName: string }) {
  const router = useRouter();
  return (
    <InlineEditRow
      label="Username"
      value={initialName}
      inputLabel="New username"
      autoComplete="name"
      maxLength={80}
      onSave={async (name) => {
        if (!name) return "Enter a username.";
        const result = await authClient.updateUser({ name });
        if (result.error) return result.error.message ?? GENERIC_ERROR;
        router.refresh();
        return null;
      }}
    />
  );
}

export function EmailRow({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  return (
    <InlineEditRow
      label="Email"
      value={initialEmail}
      inputLabel="New email"
      inputType="email"
      autoComplete="email"
      placeholder="you@example.com"
      onSave={async (email) => {
        if (email.toLowerCase() === initialEmail.toLowerCase()) return null;
        const result = await authClient.changeEmail({ newEmail: email });
        if (result.error) return result.error.message ?? GENERIC_ERROR;
        // Taken addresses report success without changing anything
        // (anti-enumeration) — trust only what the session now says.
        const session = await authClient.getSession();
        if (session.data?.user.email?.toLowerCase() !== email.toLowerCase()) {
          return "That email can't be used.";
        }
        router.refresh();
        return null;
      }}
    />
  );
}

export function PasswordRow() {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await authClient.changePassword({
      currentPassword: String(form.get("current") ?? ""),
      newPassword: String(form.get("next") ?? ""),
      revokeOtherSessions: true,
    });
    setPending(false);
    if (result.error) {
      setError(
        result.error.code === "INVALID_PASSWORD"
          ? "Current password is incorrect."
          : (result.error.message ?? GENERIC_ERROR),
      );
      return;
    }
    setEditing(false);
    setSaved(true);
  }

  return (
    <BubbleRow
      label="Password"
      value="••••••••"
      note={saved ? "Password updated — other devices were signed out" : undefined}
      action={
        !editing ? (
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={() => {
              setError(null);
              setSaved(false);
              setEditing(true);
            }}
          >
            Change
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <form onSubmit={onSubmit}>
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}
          <label className="ff-auth__field">
            <span className="ff-auth__label">Current password</span>
            <input
              className="ff-auth__input"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="ff-auth__field">
            <span className="ff-auth__label">New password</span>
            <input
              className="ff-auth__input"
              name="next"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>
          <div className="ff-row__buttons">
            <button className="ff-btn ff-btn--sm" type="submit" disabled={pending}>
              Save
            </button>
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : undefined}
    </BubbleRow>
  );
}
