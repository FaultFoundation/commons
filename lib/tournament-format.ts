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

/** The dispatch registry — the single extension point for per-format views. The
    section tab is always labelled "Bracket" now (a round robin's own view still
    lives under it), so the registry carries only the view `kind` to switch on. */
export const FORMAT_VIEW: Record<TournamentFormat, { kind: FormatViewKind }> = {
  single_elim: { kind: "bracket" },
  double_elim: { kind: "bracket" },
  round_robin: { kind: "roundrobin" },
  swiss: { kind: "swiss" },
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
  const pairs = new Map<string, number>();
  for (const m of matches) {
    const [a, b] = entrantSides(m);
    if (!a || !b || a === b) return null;
    entrants.add(a); entrants.add(b);
    const pair = JSON.stringify([a, b].sort());
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  // Partial schedules and Swiss cannot be distinguished reliably by density.
  // Require every unique pairing before inferring a round robin.
  const n = entrants.size;
  return n >= 3 && pairs.size === n * (n - 1) / 2 && new Set(pairs.values()).size === 1 ? "round_robin" : null;
}

export function providerFormat(raw: string | null | undefined): TournamentFormat | null {
  const value = raw?.trim().replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[\s-]+/g, "_");
  switch (value) {
    // FACEIT's single-elimination championship type is "bracket"; its
    // double-elimination type is separately reported as "doubleElimination".
    // Accept the stored provider value here so historical rows need no backfill.
    case "bracket":
    case "single_elimination": case "single_elim": return "single_elim";
    case "double_elimination": case "double_elim": return "double_elim";
    case "round_robin": return "round_robin";
    case "swiss": return "swiss";
    default: return null;
  }
}

// These provider types describe how the schedule was entered, not its format.
// Other unsupported types (FFA, matchmaking, etc.) must remain authoritative.
function isCustomSchedule(raw: string | null | undefined): boolean {
  return raw === "CUSTOM_SCHEDULE" || raw === "LEAGUEOS_METHOD_4";
}

/** A complete knockout: every non-champion loses once and never plays again. */
function isCompleteSingleElimination(matches: ExternalTournamentMatch[]): boolean {
  const entrants = new Set<string>();
  const eliminated = new Set<string>();
  const lastRound = new Map<string, number>();
  for (const m of [...matches].sort((a, b) => (a.roundOrder ?? 0) - (b.roundOrder ?? 0))) {
    const [a, b] = entrantSides(m);
    if (!a || !b || a === b || m.roundOrder == null || m.roundOrder <= 0 ||
        (m.winner !== 1 && m.winner !== 2)) return false;
    for (const name of [a, b]) {
      if (eliminated.has(name) || (lastRound.get(name) ?? -Infinity) >= m.roundOrder) return false;
      entrants.add(name); lastRound.set(name, m.roundOrder);
    }
    eliminated.add(m.winner === 1 ? b : a);
  }
  return entrants.size >= 3 && matches.length === entrants.size - 1;
}

/** Resolve one phase. Sparse schedules stay unconfirmed without metadata. */
export function classifyExternalFormat(
  matches: ExternalTournamentMatch[],
): TournamentFormat | null {
  if (matches.length === 0) return null;
  const raw = matches.map(m => m.bracketType).filter(Boolean);
  if (raw.some(value => !providerFormat(value) && !isCustomSchedule(value))) return null;
  const explicit = new Set(raw.map(providerFormat).filter(Boolean));
  if (explicit.size === 1) return [...explicit][0]!;
  if (explicit.size > 1) return null;
  if (hasLosers(matches)) return "double_elim";
  if (hasFeedGraph(matches)) return "single_elim";
  if (isCompleteSingleElimination(matches)) return "single_elim";

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
      format: phase.raw && !isCustomSchedule(phase.raw) ? providerFormat(phase.raw) : classifyExternalFormat(phase.matches),
      events: [{ ...event, matches: phase.matches }],
    }));
  });
}
