"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { reportScore } from "@/app/teams/actions";

export type ReportableGameView = {
  gameNumber: number;
  mapName: string | null;
  aScore: number;
  bScore: number;
  replayCode: string | null;
};

export type ReportableMatchView = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  round: number | null;
  bestOf: number;
  status: string;
  opponentName: string;
  /** This team is participant A — decides which score column is "us". */
  weAreA: boolean;
  games: ReportableGameView[];
};

type Row = {
  mapName: string;
  ourScore: string;
  theirScore: string;
  replayCode: string;
};

function emptyRow(): Row {
  return { mapName: "", ourScore: "", theirScore: "", replayCode: "" };
}

/** Prefills from whatever is already on record, so a correction is an edit. */
function rowsFor(match: ReportableMatchView | undefined): Row[] {
  if (!match) return [];
  return Array.from({ length: match.bestOf }, (_, index) => {
    const game = match.games.find((g) => g.gameNumber === index + 1);
    if (!game) return emptyRow();
    return {
      mapName: game.mapName ?? "",
      ourScore: String(match.weAreA ? game.aScore : game.bScore),
      theirScore: String(match.weAreA ? game.bScore : game.aScore),
      replayCode: game.replayCode ?? "",
    };
  });
}

/**
 * Report a match result: pick the tournament, pick the match, fill in the
 * games. Reports apply immediately and move the standings — there's no
 * opponent confirmation step — so re-reporting is how a mistake gets fixed.
 */
export function ScoreReporter({
  teamId,
  matches,
}: {
  teamId: string;
  matches: ReportableMatchView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tournaments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const match of matches) seen.set(match.tournamentId, match.tournamentName);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [matches]);

  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const inTournament = matches.filter((m) => m.tournamentId === tournamentId);
  const [matchId, setMatchId] = useState(inTournament[0]?.id ?? "");

  const match = matches.find((m) => m.id === matchId);
  const [rows, setRows] = useState<Row[]>(() => rowsFor(match));

  // Switching tournament or match reloads the form from that match's record.
  useEffect(() => {
    const first = matches.find((m) => m.tournamentId === tournamentId);
    setMatchId((current) =>
      matches.some((m) => m.id === current && m.tournamentId === tournamentId)
        ? current
        : (first?.id ?? ""),
    );
  }, [tournamentId, matches]);

  useEffect(() => {
    setRows(rowsFor(matches.find((m) => m.id === matchId)));
    setSaved(false);
    setError(null);
  }, [matchId, matches]);

  function setRow(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    setSaved(false);
  }

  function onSubmit() {
    if (!match) return;
    setError(null);
    // Only completed rows are sent: a Bo3 that ended 2-0 leaves game 3 blank.
    const games = rows
      .map((row, index) => ({ row, gameNumber: index + 1 }))
      .filter(({ row }) => row.ourScore !== "" && row.theirScore !== "")
      .map(({ row, gameNumber }) => {
        const ours = Number(row.ourScore);
        const theirs = Number(row.theirScore);
        return {
          gameNumber,
          mapName: row.mapName,
          participantAScore: match.weAreA ? ours : theirs,
          participantBScore: match.weAreA ? theirs : ours,
          replayCode: row.replayCode,
        };
      });

    if (!games.length) {
      setError("Enter the score for at least one game.");
      return;
    }

    startTransition(async () => {
      const result = await reportScore({ teamId, matchId: match.id, games });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  if (!matches.length) {
    return (
      <p className="ff-auth__hint">
        No matches yet. Enter a tournament and your schedule shows up here.
      </p>
    );
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <label className="ff-auth__field">
        <span className="ff-auth__label">Tournament</span>
        <select
          className="ff-auth__input"
          value={tournamentId}
          onChange={(event) => setTournamentId(event.target.value)}
        >
          {tournaments.map((tournament) => (
            <option key={tournament.id} value={tournament.id}>
              {tournament.name}
            </option>
          ))}
        </select>
      </label>

      <label className="ff-auth__field">
        <span className="ff-auth__label">Match</span>
        <select
          className="ff-auth__input"
          value={matchId}
          onChange={(event) => setMatchId(event.target.value)}
        >
          {inTournament.map((option) => (
            <option key={option.id} value={option.id}>
              {option.round ? `Round ${option.round} · ` : ""}vs {option.opponentName}
              {option.status === "confirmed" ? " (reported)" : ""}
            </option>
          ))}
        </select>
      </label>

      {match ? (
        <>
          <div className="ff-score">
            <div className="ff-score__head" aria-hidden="true">
              <span>Game</span>
              <span>Map</span>
              <span>Us</span>
              <span>{match.opponentName}</span>
              <span>Replay code</span>
            </div>
            {rows.map((row, index) => (
              <div className="ff-score__row" key={index}>
                <span className="ff-score__number">{index + 1}</span>
                <input
                  className="ff-auth__input"
                  type="text"
                  value={row.mapName}
                  maxLength={60}
                  placeholder="Map"
                  aria-label={`Game ${index + 1} map`}
                  onChange={(event) => setRow(index, { mapName: event.target.value })}
                />
                <input
                  className="ff-auth__input"
                  type="number"
                  min={0}
                  max={99}
                  value={row.ourScore}
                  aria-label={`Game ${index + 1} our score`}
                  onChange={(event) => setRow(index, { ourScore: event.target.value })}
                />
                <input
                  className="ff-auth__input"
                  type="number"
                  min={0}
                  max={99}
                  value={row.theirScore}
                  aria-label={`Game ${index + 1} opponent score`}
                  onChange={(event) => setRow(index, { theirScore: event.target.value })}
                />
                <input
                  className="ff-auth__input"
                  type="text"
                  value={row.replayCode}
                  maxLength={12}
                  placeholder="Optional"
                  aria-label={`Game ${index + 1} replay code`}
                  onChange={(event) =>
                    setRow(index, { replayCode: event.target.value })
                  }
                />
              </div>
            ))}
          </div>

          <div className="ff-row__buttons">
            <button
              className="ff-btn ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={onSubmit}
            >
              {pending ? "Reporting…" : saved ? "Reported" : "Report Score"}
            </button>
            <span className="ff-row__note">
              Standings update straight away. Report again to correct a mistake.
            </span>
          </div>
        </>
      ) : null}
    </>
  );
}
