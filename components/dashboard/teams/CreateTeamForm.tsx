"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { createTeam } from "@/app/teams/actions";
import { browserTimezone } from "@/components/dashboard/teams/TimezoneRow";
import { TEAM_NAME_MAX, TEAM_TAG_MAX } from "@/lib/teams-shared";

/**
 * Create a team in one submit. Lands on the new team's page with the invite
 * link already expanded (`?invited=1`) — that's the second of the two clicks
 * the Teams tab promises: create, then copy the link.
 *
 * Region and timezone are never asked for: the server takes the region from
 * the creator's verified school, and the browser's own zone rides along here.
 *
 * Used on both the Teams tab and setup step 3.
 */
export function CreateTeamForm({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await createTeam({ name, tag, timezone: browserTimezone() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/teams/${result.teamId}/?invited=1`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {compact ? null : (
        <p className="ff-auth__hint">
          You&rsquo;ll be its manager, and you can invite your players with a
          link on the next screen.
        </p>
      )}
      <label className="ff-auth__field">
        <span className="ff-auth__label">Team name</span>
        <input
          className="ff-auth__input"
          type="text"
          value={name}
          maxLength={TEAM_NAME_MAX}
          placeholder="Fault University Esports"
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="ff-auth__field">
        <span className="ff-auth__label">Tag (optional)</span>
        <input
          className="ff-auth__input"
          type="text"
          value={tag}
          maxLength={TEAM_TAG_MAX}
          placeholder="FLT"
          onChange={(event) => setTag(event.target.value)}
        />
      </label>
      <div className="ff-row__buttons">
        <button
          className="ff-btn"
          type="submit"
          disabled={pending || name.trim().length < 2}
        >
          {pending ? "Creating…" : "Create Team"}
        </button>
      </div>
    </form>
  );
}
