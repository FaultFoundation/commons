"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { redeemInvite } from "@/app/teams/actions";

/**
 * Join from a pasted invite. Accepts the whole link or just the token, because
 * people paste whatever their captain sent them.
 */
export function JoinByLinkForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");

  function tokenFrom(input: string): string {
    const raw = input.trim();
    const match = raw.match(/\/join\/([^/?#\s]+)/);
    return match ? match[1] : raw;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await redeemInvite(tokenFrom(value));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${result.teamId}/`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <label className="ff-auth__field">
        <span className="ff-auth__label">Invite link</span>
        <input
          className="ff-auth__input"
          type="text"
          value={value}
          maxLength={300}
          placeholder="https://commons.fault.foundation/join/…"
          onChange={(event) => setValue(event.target.value)}
          required
        />
      </label>
      <div className="ff-row__buttons">
        <button
          className="ff-btn ff-btn--sm"
          type="submit"
          disabled={pending || !value.trim()}
        >
          {pending ? "Joining…" : "Join Team"}
        </button>
      </div>
    </form>
  );
}
