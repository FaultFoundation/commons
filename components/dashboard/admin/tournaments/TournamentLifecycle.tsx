"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setTournamentStatus } from "@/app/admin/tournaments/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import {
  TOURNAMENT_STATUS_LABELS,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

/**
 * The status transitions available from here. Mirrors `allowedTransitions` in
 * the action — the server refuses anything not on its own list, so this only
 * decides what to *offer*. `active` is deliberately absent: a tournament
 * becomes active by starting its bracket (the Bracket card), never by a status
 * button.
 */
const NEXT: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ["registration", "cancelled"],
  registration: ["seeding", "draft", "cancelled"],
  seeding: ["registration", "cancelled"],
  active: ["completed", "cancelled"],
  completed: ["active"],
  cancelled: ["draft"],
};

/** What each move actually does, in the staff member's terms. */
const EXPLAIN: Partial<Record<TournamentStatus, string>> = {
  registration: "Opens entries and makes the tournament publicly visible.",
  seeding: "Closes entries and locks entered rosters so seeds can be set.",
  draft: "Hides the tournament from members again.",
  completed: "Finalizes the bracket on Challonge and freezes standings.",
  cancelled: "Freezes everything. Entries and results stop.",
  active: "Reopens the finalized bracket to correct a result.",
};

export function TournamentLifecycle({
  tournamentId,
  status,
  entrantCount,
}: {
  tournamentId: string;
  status: TournamentStatus;
  entrantCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const options = NEXT[status] ?? [];

  function move(to: TournamentStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setTournamentStatus(tournamentId, to);
      if (!result.ok) {
        setError(result.error);
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

      <BubbleRow
        label="Status"
        value={TOURNAMENT_STATUS_LABELS[status] ?? status}
        note={
          status === "registration" && entrantCount < 2
            ? "At least 2 entrants are needed before seeding."
            : undefined
        }
      />

      {options.length ? (
        <div className="ff-row__buttons">
          {options.map((to) => (
            <button
              key={to}
              className="ff-btn ff-btn--soft ff-btn--sm"
              type="button"
              disabled={pending || (to === "seeding" && entrantCount < 2)}
              title={EXPLAIN[to]}
              onClick={() => move(to)}
            >
              {TOURNAMENT_STATUS_LABELS[to] ?? to}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
