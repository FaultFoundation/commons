"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
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
        matches={snapshot.matches}
        completed={snapshot.tournament.status === "completed"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Elimination — winners (and, for double-elim, losers) brackets as columns.
// ---------------------------------------------------------------------------

type RoundGroup = { round: number; matches: SnapshotMatch[] };
type RoundKind = "winners" | "losers" | "rr";

/** Group matches into rounds (winners keep their round; losers use |round|),
    each round's matches in play order. */
function groupRounds(
  matches: SnapshotMatch[],
  byRound: (round: number) => number,
): RoundGroup[] {
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
}

/** The last round is the Finals and the one before it the Semifinals; earlier
    (and all round-robin / losers) rounds are just numbered. */
function roundLabel(index: number, total: number, kind: RoundKind): string {
  if (kind === "winners") {
    if (index === total - 1) return "Finals";
    if (index === total - 2 && total > 1) return "Semifinals";
  }
  return `Round ${index + 1}`;
}

function EliminationBracket({
  matches,
  nameById,
}: {
  matches: SnapshotMatch[];
  nameById: Map<string, SnapshotParticipant>;
}) {
  const winners = useMemo(
    () => groupRounds(matches.filter((m) => m.side !== "L"), (r) => r),
    [matches],
  );
  const losers = useMemo(
    () => groupRounds(matches.filter((m) => m.side === "L"), (r) => Math.abs(r)),
    [matches],
  );

  return (
    <>
      {/* No title here — the page's "Bracket" bubble already names it. */}
      <RoundGrid rounds={winners} nameById={nameById} kind="winners" />
      {losers.length ? (
        <section className="ff-bracket__section">
          <h2 className="ff-bracket__section-title">Losers Bracket</h2>
          <RoundGrid rounds={losers} nameById={nameById} kind="losers" />
        </section>
      ) : null}
    </>
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
  const rounds = useMemo(() => groupRounds(matches, (r) => r), [matches]);
  return <RoundGrid rounds={rounds} nameById={nameById} kind="rr" />;
}

/**
 * The scrollable round columns. Round headers sit at the top, centered over each
 * column and aligned across columns. On load the container scrolls so the
 * *current* round (the earliest with an open match) is centered — clamped so a
 * short bracket never leaves white space on the right.
 *
 * Elbow connectors (elimination only) are drawn as an SVG overlay measured from
 * the rendered match positions: round-N match `m` feeds round-(N+1) match
 * `floor(m/2)` — the standard single-elimination tree — so each match's line
 * runs right → to the mid-gap → up/down to its successor's centre → into it.
 */
function RoundGrid({
  rounds,
  nameById,
  kind,
}: {
  rounds: RoundGroup[];
  nameById: Map<string, SnapshotParticipant>;
  kind: RoundKind;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [connectors, setConnectors] = useState<{
    width: number;
    height: number;
    paths: string[];
  }>({ width: 0, height: 0, paths: [] });

  const currentIndex = useMemo(() => {
    const i = rounds.findIndex((r) => r.matches.some((m) => m.state === "open"));
    return i >= 0 ? i : rounds.length - 1;
  }, [rounds]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const col = container.querySelector<HTMLElement>(
      `[data-round-index="${currentIndex}"]`,
    );
    if (!col) return;
    const target = col.offsetLeft + col.offsetWidth / 2 - container.clientWidth / 2;
    const max = container.scrollWidth - container.clientWidth;
    container.scrollLeft = Math.max(0, Math.min(target, max));
  }, [currentIndex]);

  // Measure match rects and draw the elbows. Recomputed on resize/reflow.
  useEffect(() => {
    if (kind === "rr" || rounds.length < 2) {
      setConnectors({ width: 0, height: 0, paths: [] });
      return;
    }
    const container = scrollRef.current;
    if (!container) return;

    function compute() {
      const cont = scrollRef.current;
      if (!cont) return;
      const base = cont.getBoundingClientRect();
      const rects = new Map<string, { x: number; y: number; w: number; h: number }>();
      cont
        .querySelectorAll<HTMLElement>(".ff-bracket__match[data-r]")
        .forEach((el) => {
          const rect = el.getBoundingClientRect();
          rects.set(`${el.dataset.r}:${el.dataset.m}`, {
            x: rect.left - base.left + cont.scrollLeft,
            y: rect.top - base.top + cont.scrollTop,
            w: rect.width,
            h: rect.height,
          });
        });

      const paths: string[] = [];
      for (let r = 0; r < rounds.length - 1; r += 1) {
        for (let m = 0; m < rounds[r].matches.length; m += 1) {
          const from = rects.get(`${r}:${m}`);
          const to = rects.get(`${r + 1}:${Math.floor(m / 2)}`);
          if (!from || !to) continue;
          // Center-to-center: from the middle of one match to the middle of its
          // successor. The match cards sit above the SVG (z-index), and their
          // fill is opaque, so the portion of the line that runs inside a card
          // is hidden — what shows is a clean curve spanning the gap, anchored
          // on each card's centre rather than clipped to its edge.
          const startX = from.x + from.w / 2;
          const startY = from.y + from.h / 2;
          const endX = to.x + to.w / 2;
          const endY = to.y + to.h / 2;
          // A smooth S-curve: a cubic Bézier whose control points sit at the
          // horizontal midpoint, so the line leaves the match horizontally,
          // eases up/down, and arrives horizontally at its successor.
          const midX = (startX + endX) / 2;
          paths.push(
            `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`,
          );
        }
      }
      setConnectors({
        width: cont.scrollWidth,
        height: cont.scrollHeight,
        paths,
      });
    }

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [rounds, kind]);

  return (
    <div className="ff-bracket__rounds" ref={scrollRef}>
      {connectors.paths.length ? (
        <svg
          className="ff-bracket__connectors"
          width={connectors.width}
          height={connectors.height}
          aria-hidden="true"
        >
          {connectors.paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      ) : null}
      {rounds.map((r, index) => (
        <div
          className="ff-bracket__round"
          data-round-index={index}
          data-current={index === currentIndex ? "" : undefined}
          key={r.round}
        >
          <div className="ff-bracket__round-label">
            {roundLabel(index, rounds.length, kind)}
          </div>
          <div className="ff-bracket__round-matches">
            {r.matches.map((m, matchIndex) => (
              <MatchCard
                key={m.id}
                match={m}
                nameById={nameById}
                roundIndex={index}
                matchIndex={matchIndex}
              />
            ))}
          </div>
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
  roundIndex,
  matchIndex,
}: {
  match: SnapshotMatch;
  nameById: Map<string, SnapshotParticipant>;
  /** Position in the grid, for the connector overlay to measure by. */
  roundIndex?: number;
  matchIndex?: number;
}) {
  const [a, b] = splitScores(match.scores);
  return (
    <div
      className="ff-bracket__match"
      data-state={match.state}
      data-r={roundIndex}
      data-m={matchIndex}
    >
      {match.order != null ? (
        <span className="ff-bracket__match-no" title={`Match ${match.order}`}>
          {match.order}
        </span>
      ) : null}
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

/**
 * A Challonge-style results table: rank, team, match record, points. Records
 * are computed from the completed matches in the snapshot — we track teams, not
 * individual players, so none are listed. Points = match wins.
 */
function Standings({
  participants,
  matches,
  completed,
}: {
  participants: SnapshotParticipant[];
  matches: SnapshotMatch[];
  completed: boolean;
}) {
  if (!participants.length) return null;

  const record = new Map<string, { w: number; l: number }>();
  for (const p of participants) record.set(p.id, { w: 0, l: 0 });
  for (const m of matches) {
    if (m.state !== "complete" || !m.winnerId) continue;
    const won = record.get(m.winnerId);
    if (won) won.w += 1;
    const loserId =
      m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
    const lost = loserId ? record.get(loserId) : undefined;
    if (lost) lost.l += 1;
  }

  const anyPlayed = matches.some((m) => m.state === "complete");
  const rows = participants
    .map((p) => {
      const r = record.get(p.id) ?? { w: 0, l: 0 };
      return { ...p, w: r.w, l: r.l };
    })
    .sort((a, b) => {
      if (a.finalRank != null && b.finalRank != null) {
        return a.finalRank - b.finalRank;
      }
      if (a.finalRank != null) return -1;
      if (b.finalRank != null) return 1;
      if (b.w !== a.w) return b.w - a.w;
      if (a.l !== b.l) return a.l - b.l;
      return (a.seed ?? 999) - (b.seed ?? 999);
    });

  return (
    <section className="ff-bracket__section">
      <h2 className="ff-bracket__section-title">Results</h2>
      <div className="ff-ticket-table-wrap">
        <table className="ff-ticket-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col">W–L</th>
              <th scope="col">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, index) => (
              <tr key={p.id}>
                <td>
                  {completed && p.finalRank != null ? p.finalRank : index + 1}
                </td>
                <td>{p.name}</td>
                <td>{anyPlayed ? `${p.w}–${p.l}` : "—"}</td>
                <td>{anyPlayed ? p.w : "—"}</td>
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
