"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { redeemInvite } from "@/app/teams/actions";

/** The single control on the invite landing page. */
export function JoinTeamButton({
  token,
  teamName,
}: {
  token: string;
  teamName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onJoin() {
    setError(null);
    startTransition(async () => {
      const result = await redeemInvite(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${result.teamId}/`);
    });
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="ff-row__buttons">
        <button
          className="ff-btn"
          type="button"
          disabled={pending}
          onClick={onJoin}
        >
          {pending ? "Joining…" : `Join ${teamName}`}
        </button>
        <a className="ff-btn ff-btn--outline" href="/teams/">
          Not now
        </a>
      </div>
    </>
  );
}
