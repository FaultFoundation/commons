import { entrantComponents, hasFeedGraph } from "@/lib/bracket-graph-shared";
import type { TournamentFormat } from "@/lib/tournaments-shared";
import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";

// Provider metadata is authoritative. Structural inference is a conservative
// fallback for older cached rows; incomplete schedules remain unconfirmed.

/** Round robin uses the matrix/graph; Swiss uses rounds without feed edges. */
export type FormatViewKind = "bracket" | "roundrobin" | "swiss";

/** The dispatch registry — the single extension point for per-format views. */
export const FORMAT_VIEW: Record<
  TournamentFormat,
  { tabLabel: string; kind: FormatViewKind }
> = {
  single_elim: { tabLabel: "Bracket", kind: "bracket" },
  double_elim: { tabLabel: "Bracket", kind: "bracket" },
  round_robin: { tabLabel: "Groups", kind: "roundrobin" },
  swiss: { tabLabel: "Rounds", kind: "swiss" },
};

/** The view kind for a resolved format — the value the dispatch switches on. */
export function formatViewKind(format: TournamentFormat): FormatViewKind {
  return FORMAT_VIEW[format].kind;
}

/** Internal (Challonge) tournaments already store the canonical format. */
export function resolveInternalFormat(format: TournamentFormat): TournamentFormat {
  return format;
}

const LOSERS_RE = /\b(?:losers?|losing|lower|lb)\b/i;

/** True when the set has a losers bracket — a negative signed round, or a round
    name that reads as the lower bracket. The decisive signal for double-elim. */
function hasLosers(matches: ExternalTournamentMatch[]): boolean {
  return matches.some((m) =>
    (m.roundOrder != null && m.roundOrder < 0) || LOSERS_RE.test(m.round ?? ""),
  );
}

/** An entrant identity for the graph, or null for a bye/TBD side. */
function sideId(name: string | null): string | null {
  const n = name?.trim();
  if (!n || /^tbd$/i.test(n)) return null;
  return n.toLowerCase();
}

function entrantSides(m: ExternalTournamentMatch): [string | null, string | null] {
  return [sideId(m.entrant1Name), sideId(m.entrant2Name)];
}

/** Infer RR only from complete, unique pairings within an entrant group. */
function classifyComponent(matches: ExternalTournamentMatch[]): TournamentFormat | null {
  const entrants = new Set<string>();
  const pairs = new Set<string>();
  for (const m of matches) {
    const [a, b] = entrantSides(m);
    if (!a || !b || a === b) continue;
    entrants.add(a); entrants.add(b);
    pairs.add(JSON.stringify([a, b].sort()));
  }
  // Partial schedules and Swiss cannot be distinguished reliably by density.
  // Require every unique pairing before inferring a round robin.
  const n = entrants.size;
  return n >= 3 && pairs.size === n * (n - 1) / 2 ? "round_robin" : null;
}

export function providerFormat(raw: string | null | undefined): TournamentFormat | null {
  const value = raw?.trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[\s-]+/g, "_");
  switch (value) {
    case "single_elimination": case "single_elim": return "single_elim";
    case "double_elimination": case "double_elim": return "double_elim";
    case "round_robin": return "round_robin";
    case "swiss": return "swiss";
    default: return null;
  }
}

/** Resolve one phase. Sparse schedules stay unconfirmed without metadata. */
export function classifyExternalFormat(
  matches: ExternalTournamentMatch[],
): TournamentFormat | null {
  if (matches.length === 0) return null;
  const raw = matches.map(m => m.bracketType).filter(Boolean);
  if (raw.some(value => !providerFormat(value))) return null;
  const explicit = new Set(raw.map(providerFormat).filter(Boolean));
  if (explicit.size === 1) return [...explicit][0]!;
  if (explicit.size > 1) return null;
  if (hasLosers(matches)) return "double_elim";
  if (hasFeedGraph(matches)) return "single_elim";

  const components = entrantComponents(matches, entrantSides);
  const votes: Record<TournamentFormat, number> = {
    single_elim: 0,
    double_elim: 0,
    round_robin: 0,
    swiss: 0,
  };
  for (const component of components) {
    const format = classifyComponent(component);
    if (!format) return null;
    votes[format] += component.length;
  }
  let best: TournamentFormat | null = null;
  let bestVotes = 0;
  for (const format of Object.keys(votes) as TournamentFormat[]) {
    if (votes[format] > bestVotes) {
      best = format;
      bestVotes = votes[format];
    }
  }
  return best;
}

/** A tournament has one format only when all its phases agree. */
export function resolveExternalFormat(
  events: ExternalTournamentDetail["events"],
): TournamentFormat | null {
  const formats = externalFormatStages(events).map(stage => stage.format);
  return formats.length && formats.every(format => format != null && format === formats[0]) ? formats[0] : null;
}

/** Preserve each event and phase, including announced phases with no sets yet. */
export function externalFormatStages(events: ExternalTournamentDetail["events"]) {
  return events.flatMap(event => {
    const phases = new Map<string, { name: string | null; raw: string | null; matches: ExternalTournamentMatch[] }>();
    for (const phase of event.phases ?? []) phases.set(phase.id, { name: phase.name, raw: phase.bracketType, matches: [] });
    for (const match of event.matches) {
      const id = match.phaseId ?? "default";
      const phase = phases.get(id) ?? { name: match.phaseName, raw: null, matches: [] };
      phase.matches.push(match); phases.set(id, phase);
    }
    if (!phases.size) phases.set("default", { name: event.name, raw: null, matches: [] });
    return [...phases].map(([id, phase]) => ({
      id: `${event.id}:${id}`, name: phase.name ?? event.name,
      format: phase.raw ? providerFormat(phase.raw) : classifyExternalFormat(phase.matches),
      events: [{ ...event, matches: phase.matches }],
    }));
  });
}
