"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enterTournament, withdrawFromTournament } from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import { can, type TeamRole } from "@/lib/teams-shared";
import { TOURNAMENT_STATUS_LABELS } from "@/lib/tournaments-shared";

export type TeamEntry = {
  tournamentId: string;
  tournamentName: string;
  status: string;
};

/**
 * Entering and leaving tournaments. Entering adds the team as a participant on
 * Challonge (and links the captain's Challonge account, if connected); the
 * one-team-per-tournament rule is enforced server-side (lib/teams.ts
 * `entryConflicts`). Standings and results live on the public bracket, not
 * here — this panel is just the entry control.
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
  const [confirming, setConfirming] = useState<TeamEntry | null>(null);

  const manages = can(viewerRole, "enterTournaments");

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    after?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <>
      {error && !confirming ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {entries.map((entry) => (
        <BubbleRow
          key={entry.tournamentId}
          label={entry.tournamentName}
          value={
            TOURNAMENT_STATUS_LABELS[
              entry.status as keyof typeof TOURNAMENT_STATUS_LABELS
            ] ?? entry.status
          }
          action={
            manages ? (
              <button
                className="ff-btn ff-btn--outline ff-btn--sm"
                type="button"
                disabled={pending}
                onClick={() => setConfirming(entry)}
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

      <ConfirmDialog
        open={confirming !== null}
        title="Withdraw From Tournament"
        description={
          confirming
            ? `Withdraw this team from ${confirming.tournamentName}? If play has started, this may disqualify the team and prevent re-entry.`
            : undefined
        }
        confirmLabel={pending ? "Withdrawing…" : "Withdraw"}
        danger
        busy={pending}
        error={error}
        onConfirm={() => {
          if (!confirming) return;
          run(
            () => withdrawFromTournament(teamId, confirming.tournamentId),
            () => setConfirming(null),
          );
        }}
        onClose={() => {
          if (!pending) setConfirming(null);
        }}
      />
    </>
  );
}
