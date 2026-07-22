"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enterTournament, withdrawFromTournament } from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { can, type TeamRole } from "@/lib/teams-shared";

export type TeamEntry = {
  tournamentId: string;
  tournamentName: string;
  status: string;
  wins: number;
  losses: number;
  mapDiff: number;
  points: number;
};

/**
 * Entering and leaving tournaments. The one-team-per-tournament rule is
 * enforced server-side (lib/teams.ts `entryConflicts`); when it bites, the
 * error names the players who are already entered elsewhere, so the manager
 * knows exactly what to fix.
 */
export function TournamentPanel({
  teamId,
  entries,
  openTournaments,
  viewerRole,
}: {
  teamId: string;
  entries: TeamEntry[];
  openTournaments: { id: string; name: string }[];
  viewerRole: TeamRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const manages = can(viewerRole, "enterTournaments");

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {entries.map((entry) => (
        <BubbleRow
          key={entry.tournamentId}
          label={entry.tournamentName}
          value={`${entry.wins}W – ${entry.losses}L`}
          note={`${entry.points} ${entry.points === 1 ? "point" : "points"} · map diff ${
            entry.mapDiff > 0 ? `+${entry.mapDiff}` : entry.mapDiff
          }`}
          action={
            manages ? (
              <button
                className="ff-btn ff-btn--outline ff-btn--sm"
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => withdrawFromTournament(teamId, entry.tournamentId))
                }
              >
                Withdraw
              </button>
            ) : undefined
          }
        />
      ))}

      {openTournaments.map((tournament) => (
        <BubbleRow
          key={tournament.id}
          label={tournament.name}
          value="Open for registration"
          action={
            manages ? (
              <button
                className="ff-btn ff-btn--sm"
                type="button"
                disabled={pending}
                onClick={() => run(() => enterTournament(teamId, tournament.id))}
              >
                Enter
              </button>
            ) : undefined
          }
        />
      ))}

      {!entries.length && !openTournaments.length ? (
        <p className="ff-auth__hint">
          Nothing is taking entries right now. Watch the{" "}
          <a href="/tournaments/">Tournaments</a> tab.
        </p>
      ) : null}
    </>
  );
}
