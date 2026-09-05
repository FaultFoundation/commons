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
// column c+1 match ⌊i/2⌋). That fallback runs for start.gg, for any event with a
// losers bracket (double-elim, incl. FACEIT — its `group` field splits
// winners/losers upstream), AND for any section whose columns form an
// elimination tree (strictly decreasing sizes) — which covers a FACEIT
// single-elim. A FACEIT swiss/league event has equal-sized columns and recurring
// teams, so it stays plain columns where tree connectors would lie.
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
  /** Allow the geometric column-adjacency fallback when there's no feed graph
      (start.gg, and any double-elim incl. FACEIT). A FACEIT SINGLE-elim doesn't
      set this but still gets the fallback via its tree-shaped columns
      (`looksLikeElimTree`); a swiss/league section stays plain. */
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

      // Fallback when a section carries no feed graph (a start.gg bracket whose
      // sets don't have prereqs captured yet, or FACEIT — which ships none).
      // Geometric column adjacency, like the internal bracket: column c's match i
      // feeds column c+1's match ⌊i/2⌋. Allowed when the caller opts in
      // (start.gg / double-elim) OR when THIS section's columns look like an
      // elimination tree (a FACEIT single-elim) — never for a swiss/league
      // section, where a team recurs across "rounds" and tree lines would lie.
      const drawGeometric = geometricFallback || looksLikeElimTree(columns);
      if (paths.length === 0 && drawGeometric) {
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

/** Weakly-connected components of the feed graph over `matches`: two sets share a
    component when one lists the other as a prereq feeder (either direction). An
    event that runs several independent pool brackets under ONE phase (sharing a
    phaseId and identical round names) has no cross-pool feed edges, so each pool
    falls out as its own component — the shape we need to render them apart even
    when the projection carries no explicit phase-group id. Within a pool the
    winners and losers sub-brackets stay in one component via the loser-drop
    prereqs, and a plain single bracket is one component (→ one tab). */
function connectedComponents(
  matches: ExternalTournamentMatch[],
): ExternalTournamentMatch[][] {
  const indexById = new Map<string, number>();
  matches.forEach((m, i) => indexById.set(m.sourceMatchId, i));
  const parent = matches.map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  matches.forEach((m, i) => {
    for (const feeder of [m.prereq1Id, m.prereq2Id]) {
      if (!feeder) continue;
      const j = indexById.get(feeder);
      if (j != null) union(i, j);
    }
  });
  const byRoot = new Map<number, ExternalTournamentMatch[]>();
  matches.forEach((m, i) => {
    const root = find(i);
    const list = byRoot.get(root) ?? [];
    list.push(m);
    byRoot.set(root, list);
  });
  return [...byRoot.values()];
}

/** True when the feed graph has at least one INTERNAL edge — some match names
    another match in the same set as a prereq feeder. Pool inference by connected
    components is only meaningful once edges exist: with none (FACEIT, or a
    start.gg bracket scraped before prereqs), every match is its own singleton
    component and the phase would split into one "pool" per match. */
function hasFeedGraph(matches: ExternalTournamentMatch[]): boolean {
  const ids = new Set(matches.map((m) => m.sourceMatchId));
  return matches.some(
    (m) =>
      (m.prereq1Id != null && ids.has(m.prereq1Id)) ||
      (m.prereq2Id != null && ids.has(m.prereq2Id)),
  );
}

/** Smallest bracket-position key across a set of matches — orders inferred pools
    left→right in seed order. Null keys sort last (see compareOrderKeys). */
function minOrderKey(matches: ExternalTournamentMatch[]): string | null {
  let best: string | null = null;
  let seen = false;
  for (const m of matches) {
    if (!seen) {
      best = m.orderKey;
      seen = true;
    } else if (compareOrderKeys(m.orderKey, best) < 0) {
      best = m.orderKey;
    }
  }
  return best;
}

type Pool = {
  id: string;
  /** Provider pool label ("A1"); null when inferred from the feed graph. */
  name: string | null;
  matches: ExternalTournamentMatch[];
};

/** Split one phase's matches into pools (independent sub-brackets). Prefer the
    explicit phase-group id the projection carries — it also names the pool;
    otherwise infer pools from the feed graph. One pool (or no signal) → the
    phase renders as a single bracket, unchanged. */
function splitPools(matches: ExternalTournamentMatch[]): Pool[] {
  if (matches.some((m) => m.phaseGroupId != null)) {
    const groups = new Map<
      string,
      { order: number; name: string | null; matches: ExternalTournamentMatch[] }
    >();
    matches.forEach((m, index) => {
      const id = m.phaseGroupId ?? "__ungrouped__";
      let g = groups.get(id);
      if (!g) {
        g = {
          order: m.phaseGroupOrder ?? 1000 + index,
          name: m.phaseGroupName ?? null,
          matches: [],
        };
        groups.set(id, g);
      }
      g.matches.push(m);
    });
    return [...groups.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, g]) => ({ id, name: g.name, matches: g.matches }));
  }
  // No feed graph → no pools to infer; the whole phase is one bracket. (Without
  // this, FACEIT — which ships no prereqs — splits into one pool per match.)
  if (!hasFeedGraph(matches)) {
    return [{ id: "__single__", name: null, matches }];
  }
  const components = connectedComponents(matches);
  if (components.length <= 1) {
    return [{ id: "__single__", name: null, matches }];
  }
  return components
    .map((comp) => ({ comp, key: minOrderKey(comp) }))
    .sort((a, b) => compareOrderKeys(a.key, b.key))
    .map(({ comp }, index) => ({
      id: `pool-${index}`,
      name: null,
      matches: comp,
    }));
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
  // Allow geometric connectors for start.gg (always bracket trees) and for any
  // tournament with a losers bracket (double-elim — e.g. FACEIT, which ships no
  // feed graph). A FACEIT SINGLE-elim isn't covered here but still gets them
  // per-section via `looksLikeElimTree` (tree-shaped columns); a swiss/league
  // event has neither losers nor a decreasing tree, so it stays plain columns.
  const geometricFallback =
    source === "startgg" || allMatches.some(isLosers);
  // One entry per SUB-BRACKET — each phase split into its pools — pre-built into
  // winners/losers columns. A plain event is one sub-bracket (no tabs); a pool
  // stage under one phase is one per pool; a multi-phase event is one per phase
  // (× pool). Memoized so the column references stay stable and BracketSection's
  // measuring effect doesn't re-run every render.
  const subBrackets = useMemo(() => {
    const phases = groupByPhase(allMatches);
    const multiPhase = phases.length > 1;
    return phases.flatMap((phase, phaseIndex) => {
      const pools = splitPools(phase.matches);
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
  }, [allMatches]);
  const [activeTab, setActiveTab] = useState(0);

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
  const activeIndex = Math.min(activeTab, subBrackets.length - 1);
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
            onClick={() => setActiveTab(index)}
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
