"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { bracketConnectorEdges } from "@/lib/bracket-connectors";
import { resolveExternalFormat } from "@/lib/tournament-format";
import { compareOrderKeys, splitPools } from "@/lib/bracket-graph-shared";
import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";
import { usePersistentState } from "@/lib/view-state";

// The branded bracket for an external (start.gg / FACEIT) tournament. It reuses
// the internal BracketView's column + connector styling (the ff-bracket__*
// classes), but is driven by the scraped matches: the ROUND NAMES are the
// provider's own ("Winners Round 1", "Grand Final", "Round 3"), each side shows
// its score, the winner is highlighted, and every card deep-links to the
// provider's own match/result page.
//
// Connectors use provider prerequisites within each section. Confirmed
// elimination formats can also recover edges from entrants in adjacent rounds.
// Unknown future slots require stable bracket positions for a geometric fallback.
// Placement rounds do not disable the rest of the tree or receive a final feed.
//
// One tab per SUB-BRACKET. An event splits two levels deep: first into PHASES
// (start.gg's independent brackets — "Round 1 Bracket" + "Round 2 Bracket"),
// then each phase into POOLS (phase groups — "A1".."A4", several disjoint
// brackets that share one phaseId and identical round names). Without splitting
// pools apart, their rounds mash into shared columns and the connectors cross
// between unrelated brackets (the "ugly" bracket). We prefer the explicit
// phase-group id the projection carries (which also names the pool); when it's
// absent — older data, or a provider without phase groups — we infer the pools
// as the weakly-connected components of the feed graph, since disjoint pools
// share no prereq edges. A plain single bracket is one component → one tab.
// CRUCIAL guard: that component inference is only trusted when a feed graph
// actually EXISTS. With no prereq edges at all (FACEIT ships none; a start.gg
// bracket scraped before its sets carry prereqs) EVERY match is its own
// singleton component, which would render one bogus "Pool" tab per match — so a
// phase with no internal feed edges stays a single bracket.

const LOSERS_RE = /los(?:er|ers|ing)?|lower|\blb\b/i;

function isLosers(m: ExternalTournamentMatch): boolean {
  if (m.roundOrder != null) return m.roundOrder < 0;
  return LOSERS_RE.test(m.round ?? "");
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

/** True when a section's columns form an elimination tree — ≥2 columns whose
    match counts are strictly decreasing (8 → 4 → 2 → 1). This is how we recover
    geometric connectors for a FACEIT single-elim bracket (which ships no feed
    graph and no losers section, so neither the true-feed path nor the
    start.gg/double-elim gate fires) WITHOUT drawing false lines on a swiss/league
    section, whose columns are equal-sized (4, 4, 4, 4) and whose teams recur
    across rounds — a tree connector there would be a lie. */
function looksLikeElimTree(columns: BracketColumn[]): boolean {
  if (columns.length < 2) return false;
  for (let i = 1; i < columns.length; i += 1) {
    if (columns[i].matches.length >= columns[i - 1].matches.length) return false;
  }
  return true;
}

function Slot({
  name,
  logoUrl,
  score,
  winner,
}: {
  name: string | null;
  logoUrl: string | null;
  score: number | null;
  winner: boolean;
}) {
  return (
    <div className={`ff-bracket__slot${winner ? " ff-bracket__slot--winner" : ""}`}>
      <span className="ff-bracket__entrant">
        {logoUrl ? (
          <img
            className="ff-bracket__entrant-logo"
            src={logoUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <span className="ff-bracket__slot-name">{name ?? "TBD"}</span>
      </span>
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
        logoUrl={match.entrant1LogoUrl}
        score={match.entrant1Score}
        winner={match.winner === 1}
      />
      <Slot
        name={match.entrant2Name}
        logoUrl={match.entrant2LogoUrl}
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
  /** Recover missing feed edges for a confirmed elimination section. */
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

      for (const [fromId, toId] of bracketConnectorEdges(columns, geometricFallback || looksLikeElimTree(columns))) {
        const from = cards.get(fromId);
        const to = cards.get(toId);
        if (from && to) draw(from, to);
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
  }, [columns, matches, geometricFallback]);

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

// The feed-graph helpers (hasFeedGraph, connectedComponents, minOrderKey) and the
// pool split (splitPools) now live in lib/bracket-graph-shared.ts — the same
// primitives the format classifier and the round-robin normaliser use, so the
// pool boundaries the bracket draws and the ones those consumers see stay
// identical. `groupByPhase` (above) is bracket-only and stays here.

export function ExternalBracket({
  events,
  source,
  format: suppliedFormat,
  storageKey,
}: {
  events: ExternalTournamentDetail["events"];
  /** Provider controls phase/pool grouping. */
  source: string;
  format?: "single_elim" | "double_elim";
  /** What the remembered phase/pool tab is filed under — the tournament +
      stage. Omit it and the tab simply doesn't persist. */
  storageKey?: string;
}) {
  const allMatches = useMemo(
    () => events.flatMap((event) => event.matches),
    [events],
  );
  // Use the resolved format: placement rounds can have the same size as the
  // final, so strictly decreasing column counts are not a reliable gate.
  const format = suppliedFormat ?? resolveExternalFormat(events);
  const geometricFallback = format === "single_elim" || format === "double_elim";
  // One entry per SUB-BRACKET — each phase split into its pools — pre-built into
  // winners/losers columns. A plain event is one sub-bracket (no tabs); a pool
  // stage under one phase is one per pool; a multi-phase event is one per phase
  // (× pool). Memoized so the column references stay stable and BracketSection's
  // measuring effect doesn't re-run every render.
  const subBrackets = useMemo(() => {
    const phases = groupByPhase(allMatches);
    const multiPhase = phases.length > 1;
    return phases.flatMap((phase, phaseIndex) => {
      // LeagueOS stages are individual brackets. A consolation match can
      // have only loser feeds, which the legacy projection does not carry.
      const pools = source === "leagueos" && !phase.matches.some(m => m.phaseGroupId != null)
        ? [{ id: "stage", name: null, matches: phase.matches }]
        : splitPools(phase.matches);
      const multiPool = pools.length > 1;
      const phaseLabel = phase.name ?? `Bracket ${phaseIndex + 1}`;
      return pools.map((pool, poolIndex) => {
        const poolLabel = pool.name
          ? `Pool ${pool.name}`
          : multiPool
            ? `Pool ${poolIndex + 1}`
            : phaseLabel;
        const label =
          multiPhase && multiPool ? `${phaseLabel} · ${poolLabel}` : poolLabel;
        return {
          key: `${phase.key}-${pool.id}`,
          label,
          winners: buildColumns(pool.matches.filter((m) => !isLosers(m))),
          losers: buildColumns(pool.matches.filter(isLosers)),
        };
      });
    });
  }, [allMatches, source]);
  // Remembered by sub-bracket KEY, not index (lib/view-state.ts): a re-scrape
  // can add or reorder pools, and a stored index would then select a different
  // bracket than the member left open.
  const [activeTab, setActiveTab] = usePersistentState<string | null>(
    storageKey ? `bracket-tab:${storageKey}` : null,
    null,
    (stored) =>
      typeof stored === "string" && subBrackets.some((s) => s.key === stored)
        ? stored
        : undefined,
  );

  if (allMatches.length === 0) {
    return <p className="ff-ticket-empty">No bracket data collected yet.</p>;
  }

  const sectionsFor = (sub: (typeof subBrackets)[number]) => (
    <>
      <BracketSection
        columns={sub.winners}
        title={sub.losers.length ? "Winners Bracket" : null}
        geometricFallback={geometricFallback}
      />
      <BracketSection
        columns={sub.losers}
        title="Losers Bracket"
        geometricFallback={geometricFallback}
      />
    </>
  );

  // A single sub-bracket (a plain event / FACEIT): render directly, no tabs.
  if (subBrackets.length <= 1) {
    return <div className="ff-bracket">{sectionsFor(subBrackets[0])}</div>;
  }

  // Several independent sub-brackets (phases and/or pools) → browser-style tabs,
  // one visible at a time, rather than stacked (which mashed their columns and
  // crossed connectors between unrelated brackets).
  const storedIndex = subBrackets.findIndex((sub) => sub.key === activeTab);
  const activeIndex = storedIndex >= 0 ? storedIndex : 0;
  return (
    <div className="ff-bracket">
      <div className="ff-bracket__tabs" role="tablist" aria-label="Brackets">
        {subBrackets.map((sub, index) => (
          <button
            key={sub.key}
            type="button"
            role="tab"
            id={`bracket-tab-${index}`}
            aria-selected={index === activeIndex}
            className={`ff-bracket__tab${index === activeIndex ? " ff-bracket__tab--active" : ""}`}
            onClick={() => setActiveTab(sub.key)}
          >
            {sub.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`bracket-tab-${activeIndex}`}>
        {sectionsFor(subBrackets[activeIndex])}
      </div>
    </div>
  );
}
