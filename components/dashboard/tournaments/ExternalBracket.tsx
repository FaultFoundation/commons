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
// Connectors are drawn from the TRUE feed graph, not guessed geometry: each set
// carries the source-set id feeding each slot (start.gg prereqId). We draw an
// edge feeder → slot only when the feeder is in the SAME section (winners or
// losers) — which is exactly start.gg's own rendering: within a bracket you only
// advance by winning, while a loser always drops to the OTHER bracket, so the
// cross-bracket feeds are intentionally not drawn (they'd clutter the tree). The
// Grand Final therefore shows its one line from the Winners Final; its Losers
// Final feed is cross-section and correctly omitted. FACEIT has no feed graph,
// so it renders as plain columns.

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
    NAME (the display unit): equivalent to grouping by round for clean data, but
    robust when `round_order` is missing or junk. Columns sort by |roundOrder|
    when it's a real number, else by any number in the name ("Winners Round 2" →
    2), else first-seen. */
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

function MatchCard({ match }: { match: ExternalTournamentMatch }) {
  const card = (
    <div
      className="ff-bracket__match"
      data-state={match.state ?? undefined}
      data-set={match.sourceMatchId}
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
 * feed-graph connector overlay. Each match card carries data-set={sourceMatchId};
 * we measure the cards and draw an SVG elbow from a feeder's right edge to the
 * target slot's left edge — but only when the feeder is one of THIS section's
 * cards (the same-section rule that keeps the tree clean).
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

  const matches = useMemo(
    () => columns.flatMap((column) => column.matches),
    [columns],
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    function compute() {
      const cont = scrollRef.current;
      if (!cont) return;
      const base = cont.getBoundingClientRect();
      // Measure each card by its source id: left/right edges + the vertical
      // centre of the card and of each of its two slots (in scroll space).
      const cards = new Map<
        string,
        { left: number; right: number; cy: number; slotCy: [number, number] }
      >();
      cont
        .querySelectorAll<HTMLElement>(".ff-bracket__match[data-set]")
        .forEach((el) => {
          const id = el.dataset.set;
          if (!id) return;
          const r = el.getBoundingClientRect();
          const slots = el.querySelectorAll<HTMLElement>(".ff-bracket__slot");
          const slotCy = (i: number): number => {
            const s = slots[i]?.getBoundingClientRect();
            const rect = s ?? r;
            return rect.top - base.top + cont.scrollTop + rect.height / 2;
          };
          cards.set(id, {
            left: r.left - base.left + cont.scrollLeft,
            right: r.right - base.left + cont.scrollLeft,
            cy: r.top - base.top + cont.scrollTop + r.height / 2,
            slotCy: [slotCy(0), slotCy(1)],
          });
        });

      const paths: string[] = [];
      const edge = (
        feederId: string | null,
        target: { left: number; slotCy: [number, number] },
        slotIndex: 0 | 1,
      ) => {
        if (!feederId) return;
        const feeder = cards.get(feederId); // same-section only (map is scoped)
        if (!feeder) return;
        const sx = feeder.right;
        const sy = feeder.cy;
        const ex = target.left;
        const ey = target.slotCy[slotIndex];
        const midX = (sx + ex) / 2;
        paths.push(`M ${sx} ${sy} C ${midX} ${sy} ${midX} ${ey} ${ex} ${ey}`);
      };
      for (const m of matches) {
        const target = cards.get(m.sourceMatchId);
        if (!target) continue;
        edge(m.prereq1Id, target, 0);
        edge(m.prereq2Id, target, 1);
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
  }, [matches]);

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
        {columns.map((column) => (
          <div className="ff-bracket__round" key={column.key}>
            <div className="ff-bracket__round-label">
              {column.label}
              <span className="ff-bracket__round-time">{column.timeLabel}</span>
            </div>
            <div className="ff-bracket__round-matches">
              {column.matches.map((match) => (
                <MatchCard key={match.id} match={match} />
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
