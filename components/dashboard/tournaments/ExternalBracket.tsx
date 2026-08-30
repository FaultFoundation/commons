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
// Connectors prefer the TRUE feed graph: each set carries the source-set id
// feeding each slot (start.gg prereqId), and we draw feeder → target only when
// the feeder is in the SAME section (winners or losers) — exactly start.gg's own
// rendering, where you advance within a bracket by winning and a loser drops to
// the OTHER bracket, so cross-bracket feeds are intentionally omitted (they'd
// clutter the tree). Every line attaches to the box's vertical centre, so both
// feeders converge on one point. When there's NO feed graph — a start.gg bracket
// scraped before its sets carry prereqs (an active event), or FACEIT (which
// ships none) — it falls back to geometric column adjacency (column c match i →
// column c+1 match ⌊i/2⌋). That fallback runs for start.gg and for any event
// with a losers bracket (double-elim, incl. FACEIT — its `group` field splits
// winners/losers upstream); a FACEIT swiss/league event has no losers, so it
// stays plain columns where tree connectors would lie.

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
  geometricFallback,
}: {
  columns: BracketColumn[];
  title: string | null;
  /** Draw geometric column-adjacency connectors when there's no feed graph.
      start.gg only — FACEIT is usually swiss, where tree connectors would lie. */
  geometricFallback: boolean;
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
      // Measure each card by its source id: left/right edges + its vertical
      // centre (in scroll space).
      const cards = new Map<
        string,
        { left: number; right: number; cy: number }
      >();
      cont
        .querySelectorAll<HTMLElement>(".ff-bracket__match[data-set]")
        .forEach((el) => {
          const id = el.dataset.set;
          if (!id) return;
          const r = el.getBoundingClientRect();
          cards.set(id, {
            left: r.left - base.left + cont.scrollLeft,
            right: r.right - base.left + cont.scrollLeft,
            cy: r.top - base.top + cont.scrollTop + r.height / 2,
          });
        });

      const paths: string[] = [];
      type Rect = { left: number; right: number; cy: number };
      // Feeder's right-edge-centre → target's left-edge-centre, so both feeders
      // of a match converge on the box's single mid-point (the classic look).
      const draw = (from: Rect, to: Rect) => {
        const sx = from.right;
        const sy = from.cy;
        const ex = to.left;
        const ey = to.cy;
        const midX = (sx + ex) / 2;
        paths.push(`M ${sx} ${sy} C ${midX} ${sy} ${midX} ${ey} ${ex} ${ey}`);
      };

      // Primary: the true feed graph (start.gg prereqs), same-section only.
      for (const m of matches) {
        const target = cards.get(m.sourceMatchId);
        if (!target) continue;
        for (const feederId of [m.prereq1Id, m.prereq2Id]) {
          if (!feederId) continue;
          const feeder = cards.get(feederId); // same-section only (map is scoped)
          if (feeder) draw(feeder, target);
        }
      }

      // Fallback when a start.gg bracket carries no feed graph yet (an active
      // event whose sets don't have prereqs captured). Geometric column
      // adjacency, like the internal bracket: column c's match i feeds column
      // c+1's match ⌊i/2⌋. Gated to start.gg — FACEIT is usually swiss, where a
      // team recurs across "rounds" and tree connectors would be a lie.
      if (paths.length === 0 && geometricFallback) {
        for (let c = 0; c < columns.length - 1; c += 1) {
          const cur = columns[c].matches;
          const next = columns[c + 1].matches;
          for (let i = 0; i < cur.length; i += 1) {
            const target = next[Math.floor(i / 2)];
            if (!target) continue;
            const from = cards.get(cur[i].sourceMatchId);
            const to = cards.get(target.sourceMatchId);
            if (from && to) draw(from, to);
          }
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
  }, [columns, matches]);

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

/** Group matches into phases (independent brackets). A start.gg event can hold
    several ("Round 1 Bracket" + "Round 2 Bracket"); each must render as its own
    bracket or they mash into one jumbled column set. Ordered by `phaseOrder`,
    then first-seen. Matches with no phase collapse to one implicit phase. */
function groupByPhase(matches: ExternalTournamentMatch[]): {
  key: string;
  name: string | null;
  matches: ExternalTournamentMatch[];
}[] {
  const groups = new Map<
    string,
    { order: number; name: string | null; matches: ExternalTournamentMatch[] }
  >();
  matches.forEach((m, index) => {
    const key = m.phaseId ?? "__single__";
    let g = groups.get(key);
    if (!g) {
      g = {
        order: m.phaseOrder ?? 1000 + index,
        name: m.phaseName ?? null,
        matches: [],
      };
      groups.set(key, g);
    }
    g.matches.push(m);
  });
  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, g]) => ({ key, name: g.name, matches: g.matches }));
}

export function ExternalBracket({
  events,
  source,
}: {
  events: ExternalTournamentDetail["events"];
  /** Raw provider ("startgg" | "faceit"). Gates the geometric connector
      fallback to start.gg, whose events are always bracket trees. */
  source: string;
}) {
  const allMatches = useMemo(
    () => events.flatMap((event) => event.matches),
    [events],
  );
  // Draw geometric connectors for start.gg (always bracket trees) and for any
  // tournament with a losers bracket (double-elim — e.g. FACEIT, which ships no
  // feed graph). A swiss/league FACEIT event has no losers, so it stays plain
  // columns where tree connectors would lie.
  const geometricFallback =
    source === "startgg" || allMatches.some(isLosers);
  // One entry per phase, each pre-split into winners/losers columns. Memoized so
  // the column references stay stable and BracketSection's measuring effect
  // doesn't re-run every render.
  const phases = useMemo(
    () =>
      groupByPhase(allMatches).map((phase, index) => ({
        key: phase.key,
        name: phase.name ?? `Bracket ${index + 1}`,
        winners: buildColumns(phase.matches.filter((m) => !isLosers(m))),
        losers: buildColumns(phase.matches.filter(isLosers)),
      })),
    [allMatches],
  );
  const [activePhase, setActivePhase] = useState(0);

  if (allMatches.length === 0) {
    return <p className="ff-ticket-empty">No bracket data collected yet.</p>;
  }

  const sectionsFor = (phase: (typeof phases)[number]) => (
    <>
      <BracketSection
        columns={phase.winners}
        title={phase.losers.length ? "Winners Bracket" : null}
        geometricFallback={geometricFallback}
      />
      <BracketSection
        columns={phase.losers}
        title="Losers Bracket"
        geometricFallback={geometricFallback}
      />
    </>
  );

  // Single phase (or FACEIT): render directly, no tabs.
  if (phases.length <= 1) {
    return <div className="ff-bracket">{sectionsFor(phases[0])}</div>;
  }

  // Multiple independent brackets in one event → browser-style tabs next to the
  // bracket name, one phase visible at a time (rather than stacked vertically).
  const activeIndex = Math.min(activePhase, phases.length - 1);
  return (
    <div className="ff-bracket">
      <div className="ff-bracket__tabs" role="tablist" aria-label="Brackets">
        {phases.map((phase, index) => (
          <button
            key={phase.key}
            type="button"
            role="tab"
            id={`bracket-tab-${index}`}
            aria-selected={index === activeIndex}
            className={`ff-bracket__tab${index === activeIndex ? " ff-bracket__tab--active" : ""}`}
            onClick={() => setActivePhase(index)}
          >
            {phase.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`bracket-tab-${activeIndex}`}>
        {sectionsFor(phases[activeIndex])}
      </div>
    </div>
  );
}
