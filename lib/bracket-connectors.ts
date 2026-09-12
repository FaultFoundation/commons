import type { ExternalTournamentMatch } from "@/lib/external-tournaments";

type Column = { matches: ExternalTournamentMatch[] };
const identity = (name: string | null) => {
  const value = name?.trim().toLowerCase();
  return value && !/^(tbd|bye)$/.test(value) ? value : null;
};
const sides = (m: ExternalTournamentMatch) => [identity(m.entrant1Name), identity(m.entrant2Name)];

/** Same-section edges only. Provider prerequisites take precedence. When FACEIT
 * has no prerequisites or seed positions, identify progression by the entrants
 * in earlier rounds, never by the API's arbitrary match ordering. Placement
 * matches may be listed between semifinals and the final. */
export function bracketConnectorEdges(columns: Column[], allowFallback: boolean): [string, string][] {
  const matches = columns.flatMap(c => c.matches);
  const ids = new Set(matches.map(m => m.sourceMatchId));
  const edges: [string, string][] = [];
  for (const m of matches) {
    for (const id of [m.prereq1Id, m.prereq2Id]) {
      if (id && ids.has(id)) edges.push([id, m.sourceMatchId]);
    }
  }
  if (!allowFallback) return edges;
  for (let c = 1; c < columns.length; c++) {
    const previous = columns[c - 1].matches;
    const current = columns[c].matches;
    for (const target of current) {
      // Don't supplement a partially captured authoritative feed with guesses.
      if (target.prereq1Id || target.prereq2Id) continue;
      const targetSides = sides(target);
      for (const name of targetSides.filter((n): n is string => n != null)) {
        let feeders: ExternalTournamentMatch[] = [];
        for (let p = c - 1; p >= 0 && !feeders.length; p--) {
          feeders = columns[p].matches.filter(m => sides(m).includes(name));
        }
        if (feeders.length !== 1) continue;
        const feeder = feeders[0];
        // A match cannot feed two slots of a rematch in the same section.
        if (sides(feeder).filter(n => n && targetSides.includes(n)).length !== 1) continue;
        edges.push([feeder.sourceMatchId, target.sourceMatchId]);
      }
      // Unseeded future slots need actual bracket-position keys and an exact
      // binary transition. In particular, never join final → placement match.
      if (targetSides.every(n => n == null) && previous.length === current.length * 2 &&
          [...previous, ...current].every(m => m.orderKey != null)) {
        const index = current.indexOf(target);
        for (const feeder of previous.slice(index * 2, index * 2 + 2)) {
          edges.push([feeder.sourceMatchId, target.sourceMatchId]);
        }
      }
    }
  }
  return [...new Map(edges.map(edge => [JSON.stringify(edge), edge])).values()];
}
