"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MATCH_STATUS_LABELS,
  type BracketSnapshot,
  type SnapshotMatch,
  type SnapshotParticipant,
  type TournamentFormat,
} from "@/lib/tournaments-shared";

// ---------------------------------------------------------------------------
// The public bracket, rendered from a Challonge-fed snapshot.
//
// Polls `/api/tournaments/[id]/bracket` on the interval the *server* names in
// `nextPollMs` — the client never picks its own cadence, because on Workers
// every poll is a billed request whether it hits cache or not, and a page full
// of self-directed pollers is how a daily allowance disappears during a final.
// `null` stops polling (a completed tournament). Polling also pauses while the
// tab is hidden, and the stored ETag lets the server answer 304 with no body.
// ---------------------------------------------------------------------------

const ELIMINATION: ReadonlySet<TournamentFormat> = new Set([
  "single_elim",
  "double_elim",
]);

export function BracketView({
  tournamentId,
  initial,
}: {
  tournamentId: string;
  initial: BracketSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<BracketSnapshot>(initial);
  const etagRef = useRef<string>(`"v${initial.version}"`);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/bracket`, {
        headers: { "If-None-Match": etagRef.current },
        cache: "no-store",
      });
      if (res.status === 304) return;
      if (!res.ok) return;
      const etag = res.headers.get("ETag");
      if (etag) etagRef.current = etag;
      const next = (await res.json()) as BracketSnapshot;
      setSnapshot(next);
    } catch {
      // A failed poll just means we keep the last good snapshot.
    }
  }, [tournamentId]);

  useEffect(() => {
    function schedule(ms: number | null) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (ms == null) return;
      timerRef.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await poll();
        schedule(snapshot.nextPollMs);
      }, ms);
    }
    schedule(snapshot.nextPollMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll, snapshot.nextPollMs]);

  const nameById = useMemo(() => {
    const m = new Map<string, SnapshotParticipant>();
    for (const p of snapshot.participants) m.set(p.id, p);
    return m;
  }, [snapshot.participants]);

  const isElim = ELIMINATION.has(snapshot.tournament.format);

  return (
    <div className="ff-bracket">
      {snapshot.tournament.challongeUrl ? (
        <p className="ff-bracket__source">
          <a
            className="ff-btn ff-btn--soft ff-btn--sm"
            href={snapshot.tournament.challongeUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            View on Challonge
          </a>
        </p>
      ) : null}

      {snapshot.matches.length === 0 ? (
        <p className="ff-ticket-empty">
          The bracket isn&apos;t live yet — check back once play begins.
        </p>
      ) : isElim ? (
        <EliminationBracket matches={snapshot.matches} nameById={nameById} />
      ) : (
        <RoundList matches={snapshot.matches} nameById={nameById} />
      )}

      <Standings
        participants={snapshot.participants}
        completed={snapshot.tournament.status === "completed"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elimination — winners (and, for double-elim, losers) brackets as columns.
// ---------------------------------------------------------------------------

function EliminationBracket({
  matches,
  nameById,
}: {
  matches: SnapshotMatch[];
  nameById: Map<string, SnapshotParticipant>;
}) {
  const winners = matches.filter((m) => m.side !== "L");
  const losers = matches.filter((m) => m.side === "L");

  return (
    <>
      <BracketColumns
        title="Winners"
        matches={winners}
        nameById={nameById}
        byRound={(r) => r}
      />
      {losers.length ? (
        <BracketColumns
          title="Losers"
          matches={losers}
          nameById={nameById}
          byRound={(r) => Math.abs(r)}
        />
      ) : null}
    </>
  );
}

function BracketColumns({
  title,
  matches,
  nameById,
  byRound,
}: {
  title: string;
  matches: SnapshotMatch[];
  nameById: Map<string, SnapshotParticipant>;
  byRound: (round: number) => number;
}) {
  const rounds = useMemo(() => {
    const groups = new Map<number, SnapshotMatch[]>();
    for (const m of matches) {
      const key = byRound(m.round);
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, list]) => ({
        round,
        matches: list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }));
  }, [matches, byRound]);

  return (
    <section className="ff-bracket__section">
      <h2 className="ff-bracket__section-title">{title}</h2>
      <div className="ff-bracket__rounds">
        {rounds.map(({ round, matches: list }) => (
          <div className="ff-bracket__round" key={round}>
            <div className="ff-bracket__round-label">Round {round}</div>
            {list.map((m) => (
              <MatchCard key={m.id} match={m} nameById={nameById} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Round robin / swiss — matches grouped by round.
// ---------------------------------------------------------------------------

function RoundList({
  matches,
  nameById,
}: {
  matches: SnapshotMatch[];
  nameById: Map<string, SnapshotParticipant>;
}) {
  const rounds = useMemo(() => {
    const groups = new Map<number, SnapshotMatch[]>();
    for (const m of matches) {
      const list = groups.get(m.round) ?? [];
      list.push(m);
      groups.set(m.round, list);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, list]) => ({
        round,
        matches: list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }));
  }, [matches]);

  return (
    <div className="ff-bracket__rounds">
      {rounds.map(({ round, matches: list }) => (
        <div className="ff-bracket__round" key={round}>
          <div className="ff-bracket__round-label">Round {round}</div>
          {list.map((m) => (
            <MatchCard key={m.id} match={m} nameById={nameById} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function MatchCard({
  match,
  nameById,
}: {
  match: SnapshotMatch;
  nameById: Map<string, SnapshotParticipant>;
}) {
  const [a, b] = splitScores(match.scores);
  return (
    <div className="ff-bracket__match" data-state={match.state}>
      <Slot
        name={nameById.get(match.player1Id ?? "")?.name ?? "TBD"}
        score={a}
        winner={!!match.winnerId && match.winnerId === match.player1Id}
      />
      <Slot
        name={nameById.get(match.player2Id ?? "")?.name ?? "TBD"}
        score={b}
        winner={!!match.winnerId && match.winnerId === match.player2Id}
      />
      {match.state !== "complete" ? (
        <div className="ff-bracket__match-state">
          {MATCH_STATUS_LABELS[match.state]}
        </div>
      ) : null}
    </div>
  );
}

function Slot({
  name,
  score,
  winner,
}: {
  name: string;
  score: string;
  winner: boolean;
}) {
  return (
    <div className={`ff-bracket__slot${winner ? " ff-bracket__slot--winner" : ""}`}>
      <span className="ff-bracket__slot-name">{name}</span>
      <span className="ff-bracket__slot-score">{score}</span>
    </div>
  );
}

function Standings({
  participants,
  completed,
}: {
  participants: SnapshotParticipant[];
  completed: boolean;
}) {
  if (!participants.length) return null;
  const ranked = [...participants].sort((a, b) => {
    if (a.finalRank != null && b.finalRank != null) return a.finalRank - b.finalRank;
    if (a.finalRank != null) return -1;
    if (b.finalRank != null) return 1;
    return (a.seed ?? 999) - (b.seed ?? 999);
  });

  return (
    <section className="ff-bracket__section">
      <h2 className="ff-bracket__section-title">
        {completed ? "Final Standings" : "Entrants"}
      </h2>
      <div className="ff-ticket-table-wrap">
        <table className="ff-ticket-table">
          <thead>
            <tr>
              <th scope="col">{completed ? "Place" : "Seed"}</th>
              <th scope="col">Entrant</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => (
              <tr key={p.id}>
                <td>{completed ? (p.finalRank ?? "—") : (p.seed ?? "—")}</td>
                <td>{p.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Sum a Challonge scores_csv ("3-1,2-3,3-0") into set wins per side. */
function splitScores(scores: string | null): [string, string] {
  if (!scores) return ["", ""];
  let a = 0;
  let b = 0;
  for (const set of scores.split(",")) {
    const [x, y] = set.split("-").map((n) => Number(n.trim()));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x > y) a += 1;
      else if (y > x) b += 1;
    }
  }
  return [String(a), String(b)];
}
