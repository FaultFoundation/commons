"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";

// The branded bracket for an external (start.gg / FACEIT) tournament. It reuses
// the internal BracketView's column + connector styling (the ff-bracket__*
// classes), but is driven by the scraped matches: the ROUND NAMES are the
// provider's own ("Winners Round 1", "Grand Final", "Round 3"), each side shows
// its score, the winner is highlighted, and every card deep-links to the
// provider's own match/result page.
//
// Feed-forward connectors are the same elbow overlay the internal bracket draws
// — round-r match m feeds round-(r+1) match floor(m/2) — but here they are drawn
// only between two adjacent columns that ACTUALLY merge 2:1 (next has
// ceil(cur/2) matches). Real brackets are messy (play-ins, byes, grand-final
// resets, losers-bracket zig-zags), so this guard means a clean single/double
// elim gets its tree while swiss/league (and the odd non-merging column) render
// as honest plain columns rather than wrong lines.

const LOSERS_RE = /los(?:er|ers|ing)?|lower|\blb\b/i;

function isLosers(m: ExternalTournamentMatch): boolean {
  if (m.roundOrder != null) return m.roundOrder < 0;
  return LOSERS_RE.test(m.round ?? "");
}

/** Natural order for start.gg set identifiers ("A".."Z".."AA".."AB"): shorter
    first, then lexical, so "B" sorts before "AA". Null keys sort last. */
function compareOrderKeys(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

function roundTimeLabel(matches: ExternalTournamentMatch[]): string {
  const times = matches
    .map((m) => m.scheduledAt?.getTime())
    .filter((t): t is number => t != null);
  if (!times.length) return "Time unavailable";
  return new Date(Math.min(...times)).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scoreText(s: number | null): string {
  // Default to a dash whenever there's no real score to show — unplayed, TBD,
  // or a forfeit/DQ side (negative) — never a blank cell.
  if (s == null || !Number.isFinite(s) || s < 0) return "–";
  return String(s);
}

type BracketColumn = {
  key: string;
  label: string;
  timeLabel: string;
  matches: ExternalTournamentMatch[];
};

/** A column's display label and sort position. One column per distinct round
    NAME (the display unit): that's equivalent to grouping by round for clean
    data but far more robust when `round_order` is missing or junk. Columns sort
    by |roundOrder| when it's a real number, else by any number in the name
    ("Winners Round 2" → 2), else first-seen. */
function columnMeta(m: ExternalTournamentMatch, index: number): {
  label: string;
  order: number;
} {
  const finite =
    typeof m.roundOrder === "number" && Number.isFinite(m.roundOrder)
      ? Math.abs(m.roundOrder)
      : null;
  const name = m.round?.trim();
  const label = name || (finite != null ? `Round ${finite}` : "Bracket");
  const fromName = name ? Number.parseInt(name.replace(/[^\d]/g, ""), 10) : NaN;
  const order = finite ?? (Number.isFinite(fromName) ? fromName : 1000 + index);
  return { label, order };
}

/** Group one section's matches into columns (by round label), each column
    ordered top-to-bottom by orderKey. */
function buildColumns(matches: ExternalTournamentMatch[]): BracketColumn[] {
  const groups = new Map<
    string,
    { order: number; label: string; matches: ExternalTournamentMatch[] }
  >();
  matches.forEach((m, index) => {
    const { label, order } = columnMeta(m, index);
    let group = groups.get(label);
    if (!group) {
      group = { order, label, matches: [] };
      groups.set(label, group);
    }
    group.matches.push(m);
  });
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group, columnIndex) => ({
      key: `col-${columnIndex}-${group.label}`,
      label: group.label,
      timeLabel: roundTimeLabel(group.matches),
      matches: [...group.matches].sort((a, b) =>
        compareOrderKeys(a.orderKey, b.orderKey),
      ),
    }));
}

function Slot({
  name,
  score,
  winner,
}: {
  name: string | null;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className={`ff-bracket__slot${winner ? " ff-bracket__slot--winner" : ""}`}>
      <span className="ff-bracket__slot-name">{name ?? "TBD"}</span>
      <span className="ff-bracket__slot-score">{scoreText(score)}</span>
    </div>
  );
}

function MatchCard({
  match,
  roundIndex,
  matchIndex,
}: {
  match: ExternalTournamentMatch;
  roundIndex: number;
  matchIndex: number;
}) {
  const card = (
    <div
      className="ff-bracket__match"
      data-state={match.state ?? undefined}
      data-r={roundIndex}
      data-m={matchIndex}
    >
      <Slot
        name={match.entrant1Name}
        score={match.entrant1Score}
        winner={match.winner === 1}
      />
      <Slot
        name={match.entrant2Name}
        score={match.entrant2Score}
        winner={match.winner === 2}
      />
    </div>
  );
  return match.url ? (
    <a
      className="ff-bracket__match-link"
      href={match.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      {card}
    </a>
  ) : (
    card
  );
}

/**
 * One bracket section (winners or losers) as scrollable round columns, with the
 * measured elbow-connector overlay. Mirrors the internal RoundGrid: the SVG is
 * sized to the scroll area and each match card carries data-r/data-m so the
 * connectors can be measured from the rendered layout.
 */
function BracketSection({
  columns,
  title,
}: {
  columns: BracketColumn[];
  title: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [connectors, setConnectors] = useState<{
    width: number;
    height: number;
    paths: string[];
  }>({ width: 0, height: 0, paths: [] });

  useEffect(() => {
    if (columns.length < 2) {
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
      for (let r = 0; r < columns.length - 1; r += 1) {
        const cur = columns[r].matches.length;
        const next = columns[r + 1].matches.length;
        // Only draw where the next column is exactly this one halved — i.e. a
        // real 2:1 merge. Anything else (play-in, bye, reset, losers zig-zag)
        // stays as plain columns instead of a misleading line.
        if (next !== Math.ceil(cur / 2)) continue;
        for (let m = 0; m < cur; m += 1) {
          const from = rects.get(`${r}:${m}`);
          const to = rects.get(`${r + 1}:${Math.floor(m / 2)}`);
          if (!from || !to) continue;
          const startX = from.x + from.w;
          const startY = from.y + from.h / 2;
          const endX = to.x;
          const endY = to.y + to.h / 2;
          const midX = (startX + endX) / 2;
          paths.push(
            `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`,
          );
        }
      }
      setConnectors({ width: cont.scrollWidth, height: cont.scrollHeight, paths });
    }

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(container);
    window.addEventListener("resize", compute);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [columns]);

  if (!columns.length) return null;

  return (
    <section className="ff-bracket__section">
      {title ? <h3 className="ff-bracket__section-title">{title}</h3> : null}
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
        {columns.map((column, roundIndex) => (
          <div className="ff-bracket__round" key={column.key}>
            <div className="ff-bracket__round-label">
              {column.label}
              <span className="ff-bracket__round-time">{column.timeLabel}</span>
            </div>
            <div className="ff-bracket__round-matches">
              {column.matches.map((match, matchIndex) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  roundIndex={roundIndex}
                  matchIndex={matchIndex}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ExternalBracket({
  events,
}: {
  events: ExternalTournamentDetail["events"];
}) {
  const allMatches = useMemo(
    () => events.flatMap((event) => event.matches),
    [events],
  );
  const { winners, losers } = useMemo(() => {
    const w = allMatches.filter((m) => !isLosers(m));
    const l = allMatches.filter((m) => isLosers(m));
    return { winners: buildColumns(w), losers: buildColumns(l) };
  }, [allMatches]);

  if (allMatches.length === 0) {
    return <p className="ff-ticket-empty">No bracket data collected yet.</p>;
  }

  return (
    <div className="ff-bracket">
      <BracketSection
        columns={winners}
        title={losers.length ? "Winners Bracket" : null}
      />
      <BracketSection columns={losers} title="Losers Bracket" />
    </div>
  );
}
