// Client-safe bracket-graph primitives, shared by every consumer of the scraped
// external match set: the bracket view (ExternalBracket), the standings deriver
// (ExternalTournamentView), the format classifier (lib/tournament-format.ts) and
// the round-robin normaliser (lib/round-robin-shared.ts). These used to be
// copy-pasted into ExternalBracket and ExternalTournamentView; centralising them
// keeps the pool-splitting and feed-graph logic identical everywhere it matters.
//
// No server-only imports — pure functions over a minimal structural shape, so a
// client component and a server page can both import them. Anything with the
// fields below (notably ExternalTournamentMatch) satisfies FeedMatch.

/** The minimal match shape the graph/pool helpers read. */
export interface FeedMatch {
  /** The provider's own set id — the node the feed graph references. */
  sourceMatchId: string;
  /** Source-set id feeding each slot (start.gg prereqId); null = seeded/none. */
  prereq1Id: string | null;
  prereq2Id: string | null;
  /** Bracket position within a round (start.gg set identifier). */
  orderKey: string | null;
  /** Explicit phase-group (pool) columns when the projection carries them. */
  phaseGroupId?: string | null;
  phaseGroupName?: string | null;
  phaseGroupOrder?: number | null;
}

/** Natural order for start.gg set identifiers ("A".."Z".."AA".."AB"): shorter
    first, then lexical, so "B" sorts before "AA". Null keys sort last. */
export function compareOrderKeys(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** True when the feed graph has at least one INTERNAL edge — some match names
    another match in the same set as a prereq feeder. Pool inference by connected
    components is only meaningful once edges exist: with none (FACEIT, or a
    start.gg bracket scraped before prereqs), every match is its own singleton
    component and a phase would split into one "pool" per match. */
export function hasFeedGraph(matches: FeedMatch[]): boolean {
  const ids = new Set(matches.map((m) => m.sourceMatchId));
  return matches.some(
    (m) =>
      (m.prereq1Id != null && ids.has(m.prereq1Id)) ||
      (m.prereq2Id != null && ids.has(m.prereq2Id)),
  );
}

/** Weakly-connected components of the feed graph over `matches`: two sets share a
    component when one lists the other as a prereq feeder (either direction). An
    event that runs several independent pool brackets under ONE phase (sharing a
    phaseId and identical round names) has no cross-pool feed edges, so each pool
    falls out as its own component. Within a pool the winners and losers
    sub-brackets stay in one component via the loser-drop prereqs, and a plain
    single bracket is one component. */
export function connectedComponents<T extends FeedMatch>(matches: T[]): T[][] {
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
  const byRoot = new Map<number, T[]>();
  matches.forEach((m, i) => {
    const root = find(i);
    const list = byRoot.get(root) ?? [];
    list.push(m);
    byRoot.set(root, list);
  });
  return [...byRoot.values()];
}

/** Smallest bracket-position key across a set of matches — orders inferred pools
    left→right in seed order. Null keys sort last (see compareOrderKeys). */
export function minOrderKey(matches: FeedMatch[]): string | null {
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

/** Weakly-connected components of the ENTRANT graph: nodes are entrants, an edge
    joins the two entrants of every match. A round-robin group is a clique and
    different groups share no edge, so this splits a multi-group stage into its
    groups even when the projection carries no phase-group labels and the sets
    have no feed graph (the feed-graph splitter can't see RR groups — RR sets
    don't feed each other). `sideIds` returns the two entrant ids of a match
    (null for a bye/TBD side, which adds no edge). */
export function entrantComponents<T>(
  matches: T[],
  sideIds: (m: T) => [string | null, string | null],
): T[][] {
  const idIndex = new Map<string, number>();
  const idFor = (id: string): number => {
    let i = idIndex.get(id);
    if (i == null) {
      i = idIndex.size;
      idIndex.set(id, i);
    }
    return i;
  };
  // Assign a node index to every entrant first, so isolated entrants exist.
  const edges: [number, number | null][] = matches.map((m) => {
    const [a, b] = sideIds(m);
    const ai = a != null ? idFor(a) : null;
    const bi = b != null ? idFor(b) : null;
    if (ai != null) return [ai, bi];
    if (bi != null) return [bi, null];
    return [-1, null];
  });
  const size = idIndex.size;
  const parent = Array.from({ length: size }, (_, i) => i);
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
  edges.forEach(([a, b]) => {
    if (a >= 0 && b != null) union(a, b);
  });
  const byRoot = new Map<number, T[]>();
  matches.forEach((m, i) => {
    const [a] = edges[i];
    const root = a >= 0 ? find(a) : -1;
    const list = byRoot.get(root) ?? [];
    list.push(m);
    byRoot.set(root, list);
  });
  return [...byRoot.values()];
}

/** One independent sub-bracket within a phase. `name` is the provider pool label
    ("A1") when the projection carries phase groups, else null (inferred pool). */
export type Pool<T extends FeedMatch> = {
  id: string;
  name: string | null;
  matches: T[];
};

/** Split one phase's matches into pools (independent sub-brackets). Prefer the
    explicit phase-group id the projection carries — it also names the pool;
    otherwise infer pools from the feed graph. One pool (or no signal) → the whole
    set is a single pool, unchanged. This is the SAME split the bracket view uses,
    so derived standings and round-robin groups line up with the bracket tabs. */
export function splitPools<T extends FeedMatch>(matches: T[]): Pool<T>[] {
  if (matches.some((m) => m.phaseGroupId != null)) {
    const groups = new Map<
      string,
      { order: number; name: string | null; matches: T[] }
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
