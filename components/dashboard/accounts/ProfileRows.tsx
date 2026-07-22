"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AvatarUploadRow } from "./AvatarUploadRow";
import {
  discardAvatar,
  setAccountPassword,
  uploadAvatar,
} from "@/app/account/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import { authClient } from "@/lib/auth-client";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/**
 * The member's profile picture — three steps, in this order.
 *
 * The server action only writes the new object to R2; `user.image` is moved by
 * authClient.updateUser exactly like the rows below it. That is what makes the
 * header avatar repaint immediately: Better Auth invalidates its cached session
 * on a client /update-user call, and nothing else does. Only once the pointer
 * has moved is the previous object discarded, so a failure at any step leaves a
 * harmless orphan rather than a broken image.
 */
export function AvatarRow({
  name,
  initialImage,
}: {
  name: string;
  initialImage: string | null;
}) {
  const router = useRouter();

  async function point(at: string | null): Promise<string | null> {
    const result = await authClient.updateUser({ image: at });
    return result.error ? (result.error.message ?? GENERIC_ERROR) : null;
  }

  return (
    <AvatarUploadRow
      label="Profile picture"
      name={name}
      currentUrl={initialImage}
      onSave={async (file) => {
        const body = new FormData();
        body.set("file", file);
        const stored = await uploadAvatar(body);
        if (!stored.ok) return stored.error;

        const sameBytes = stored.url === initialImage;

        const failure = await point(stored.url);
        if (failure) {
          // The pointer never moved, so the bytes we just wrote are garbage —
          // unless they were already the live ones.
          if (!sameBytes) await discardAvatar(stored.url);
          return failure;
        }

        // Keys are content-addressed: re-cropping to the identical result
        // returns the key we just wrote, and discarding "the old one" would
        // delete the live object out from under the row.
        if (initialImage && !sameBytes) await discardAvatar(initialImage);
        router.refresh();
        return null;
      }}
      onRemove={async () => {
        const failure = await point(null);
        if (failure) return failure;
        if (initialImage) await discardAvatar(initialImage);
        router.refresh();
        return null;
      }}
    />
  );
}

export function NameRow({ initialName }: { initialName: string }) {
  const router = useRouter();
  return (
    <FieldRow
      label="Username"
      value={initialName}
      inputLabel="Username"
      placeholder="Your display name"
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

/**
 * The account's email address, and whether it has been confirmed.
 *
 * Changing it never takes effect here. Better Auth mails a link to the *new*
 * address and only swaps the row when that link is opened, so the honest thing
 * to report is "check your inbox" — never a value the field could show. An
 * address that already belongs to someone else takes the same path and reports
 * the same thing, deliberately: telling them apart would turn this field into
 * an "is this person a member?" oracle.
 */
export function EmailRow({
  initialEmail,
  verified,
}: {
  initialEmail: string;
  verified: boolean;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [resent, setResent] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  async function resend() {
    if (resending) return;
    setResending(true);
    const result = await authClient.sendVerificationEmail({
      email: initialEmail,
      callbackURL: "/account/",
    });
    setResending(false);
    setResent(
      result.error
        ? (result.error.message ?? GENERIC_ERROR)
        : `Verification link sent to ${initialEmail}.`,
    );
  }

  return (
    <FieldRow
      label="Email"
      value={initialEmail}
      inputLabel="Email"
      inputType="email"
      // No autoComplete: FieldRow defaults it to "off". `email` here made
      // password managers treat this settings row as a sign-in form and offer
      // to fill credentials on a page you are already signed in to.
      placeholder="you@example.com"
      // No note: same rule as the locked rows. The warning glyph's hover says
      // what's wrong and the link below says what to do about it, so a line of
      // prose between them would only repeat both.
      status={verified ? "verified" : "warning"}
      statusLabel={verified ? "Verified" : "Not verified yet"}
      savedNote={
        sent ? `Check ${sent} for a link to confirm the change.` : undefined
      }
      onSave={async (email) => {
        if (email.toLowerCase() === initialEmail.toLowerCase()) {
          return "That's already your email.";
        }
        const result = await authClient.changeEmail({
          newEmail: email,
          callbackURL: "/account/",
        });
        if (result.error) return result.error.message ?? GENERIC_ERROR;
        setSent(email);
        // Deliberately no router.refresh(): nothing has changed server-side
        // yet, and refreshing would reset the field and hide the message.
        return null;
      }}
    >
      {verified ? null : (
        <p className="ff-row__hint">
          <button
            className="ff-link-btn"
            type="button"
            onClick={resend}
            disabled={resending}
          >
            {resending ? "Sending…" : "Resend verification email"}
          </button>
        </p>
      )}
      {resent ? (
        <p className="ff-row__saved" role="status">
          {resent}
        </p>
      ) : null}
    </FieldRow>
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

/**
 * First password for an account that has only ever signed in with Discord.
 *
 * Worth offering rather than leaving those accounts as "Password: not set":
 * two-factor authentication hangs off the credential provider, so without a
 * password there is no second factor to add. Goes through a server action
 * because Better Auth marks /set-password server-only (see
 * app/account/actions.ts).
 */
export function SetPasswordRow() {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const next = String(new FormData(event.currentTarget).get("next") ?? "");
    setPending(true);
    const result = await setAccountPassword(next);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <BubbleRow
      label="Password"
      value="Not set"
      note="You signed in with Discord. Add a password to sign in with your email — and to turn on two-factor authentication."
      action={
        !editing ? (
          <button
            className="ff-btn ff-btn--sm"
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Set password
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
