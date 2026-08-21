"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { reportResult, startTournament } from "@/app/admin/tournaments/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import type {
  SnapshotMatch,
  SnapshotParticipant,
} from "@/lib/tournaments-shared";

/**
 * The bracket's staff controls. Before start, a single "Start Bracket" button
 * (which calls Challonge's change_state). Once active, a per-match result-entry
 * row — Challonge is the scorer, so this just posts the set scores and the
 * winner to it and rebuilds the snapshot the public bracket reads.
 */
export function BracketControl({
  tournamentId,
  status,
  entrantCount,
  participants,
  matches,
}: {
  tournamentId: string;
  status: string;
  entrantCount: number;
  participants: SnapshotParticipant[];
  matches: SnapshotMatch[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.name);
    return m;
  }, [participants]);

  // Only matches with both entrants decided are reportable; sort by play order.
  const playable = useMemo(
    () =>
      matches
        .filter((m) => m.player1Id && m.player2Id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.round - b.round),
    [matches],
  );

  function start() {
    setError(null);
    startTransition(async () => {
      const result = await startTournament(tournamentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (status === "seeding" || status === "registration" || status === "draft") {
    return (
      <>
        {error ? (
          <div className="ff-auth__error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        <p className="ff-row__note">
          Starting generates the bracket on Challonge and opens the tournament
          for play. Set the seed order first — it can&apos;t be changed after.
        </p>
        <div className="ff-row__buttons">
          <button
            className="ff-btn ff-btn--sm"
            type="button"
            disabled={pending || status !== "seeding" || entrantCount < 2}
            onClick={start}
          >
            {pending ? "Starting…" : "Start Bracket"}
          </button>
        </div>
        {status !== "seeding" ? (
          <p className="ff-auth__hint">Move the tournament to seeding to start.</p>
        ) : entrantCount < 2 ? (
          <p className="ff-auth__hint">At least 2 entrants are needed.</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {playable.length === 0 ? (
        <p className="ff-auth__hint">No playable matches yet.</p>
      ) : (
        playable.map((match) => (
          <ResultRow
            key={match.id}
            tournamentId={tournamentId}
            match={match}
            aName={nameById.get(match.player1Id!) ?? "TBD"}
            bName={nameById.get(match.player2Id!) ?? "TBD"}
            readOnly={status === "completed"}
          />
        ))
      )}
    </>
  );
}

function ResultRow({
  tournamentId,
  match,
  aName,
  bName,
  readOnly,
}: {
  tournamentId: string;
  match: SnapshotMatch;
  aName: string;
  bName: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState(match.scores ?? "");
  const [winner, setWinner] = useState(match.winnerId ?? "");

  function report() {
    setError(null);
    if (!winner) {
      setError("Pick the winner.");
      return;
    }
    startTransition(async () => {
      const result = await reportResult(tournamentId, {
        matchId: match.id,
        scoresCsv: scores,
        winnerId: winner,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const done = match.state === "complete";

  return (
    <BubbleRow
      label={`${aName} vs ${bName}`}
      note={error ?? (done ? `Final · ${match.scores ?? "reported"}` : undefined)}
      field={
        readOnly ? undefined : (
          <div className="ff-row__buttons">
            <input
              className="ff-auth__input"
              type="text"
              value={scores}
              placeholder="3-1"
              aria-label={`Scores for ${aName} vs ${bName}`}
              disabled={pending}
              onChange={(e) => setScores(e.target.value)}
              style={{ maxWidth: "8rem" }}
            />
            <select
              className="ff-auth__input"
              value={winner}
              aria-label="Winner"
              disabled={pending}
              onChange={(e) => setWinner(e.target.value)}
            >
              <option value="">Winner…</option>
              <option value={match.player1Id!}>{aName}</option>
              <option value={match.player2Id!}>{bName}</option>
            </select>
            <button
              className="ff-btn ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={report}
            >
              {pending ? "…" : done ? "Update" : "Report"}
            </button>
          </div>
        )
      }
    />
  );
}
