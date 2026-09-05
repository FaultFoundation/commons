import { entrantComponents, hasFeedGraph } from "@/lib/bracket-graph-shared";
import type { TournamentFormat } from "@/lib/tournaments-shared";
import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";

// ---------------------------------------------------------------------------
// The tournament-format framework.
//
// One place that answers "what FORMAT is this tournament?" for BOTH sources, and
// one registry (FORMAT_VIEW) that says how each format is presented. The view
// layer resolves the format, reads the registry, and switches on `kind` to pick
// a renderer. Adding a new per-format view later is: build the component, flip
// that format's `kind`, add one `case` to the dispatch switch — detection and
// routing don't change.
//
// Internally the format is explicit (`tournaments.format`). Externally the
// cen-sql projection carries no format field yet (see the note on the recommended
// scraper `format` column below), so we INFER it from the scraped match
// structure. Client-safe: `import type` only from the server modules, pure
// functions over plain data, so both server pages and client components import it.
// ---------------------------------------------------------------------------

/** How a format is rendered. Today only `roundrobin` has a bespoke view; the
    elimination formats and (for now) swiss route to the existing bracket. */
export type FormatViewKind = "bracket" | "roundrobin" | "swiss";

/** The dispatch registry — the single extension point for per-format views. */
export const FORMAT_VIEW: Record<
  TournamentFormat,
  { tabLabel: string; kind: FormatViewKind }
> = {
  single_elim: { tabLabel: "Bracket", kind: "bracket" },
  double_elim: { tabLabel: "Bracket", kind: "bracket" },
  round_robin: { tabLabel: "Groups", kind: "roundrobin" },
  // Swiss has no dedicated view yet — it renders through the existing bracket /
  // round-list. Give it a "swiss" kind now so its future view is a one-line flip
  // here plus a dispatch case, not another detection change.
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

const LOSERS_RE = /los(?:er|ers|ing)?|lower|\blb\b/i;

/** True when the set has a losers bracket — a negative signed round, or a round
    name that reads as the lower bracket. The decisive signal for double-elim. */
function hasLosers(matches: ExternalTournamentMatch[]): boolean {
  return matches.some((m) =>
    m.roundOrder != null ? m.roundOrder < 0 : LOSERS_RE.test(m.round ?? ""),
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

/** Classify ONE clique of entrants (a component of the entrant graph, e.g. a
    single round-robin group) by how densely its entrants played each other.
    Round-robin fills the pairing matrix (coverage ≈ 1); swiss covers a modest
    fraction; a bracket with no feed graph (FACEIT) covers very little (M = E−1).
    Called only for the no-feed-graph, no-losers case — feed graph / losers are
    decided upstream. */
function classifyComponent(
  matches: ExternalTournamentMatch[],
): TournamentFormat {
  const entrants = new Set<string>();
  for (const m of matches) {
    const [a, b] = entrantSides(m);
    if (a) entrants.add(a);
    if (b) entrants.add(b);
  }
  const e = entrants.size;
  const pairs = (e * (e - 1)) / 2;
  if (e < 3 || pairs === 0) return "single_elim";
  const coverage = matches.length / pairs;
  if (coverage >= 0.6) return "round_robin";
  if (coverage >= 0.25) return "swiss";
  return "single_elim";
}

/**
 * Infer a tournament's format from its scraped matches. Returns null when the
 * structure gives no confident answer (the caller then falls back to the
 * bracket). Order matters:
 *   1. a losers bracket ⇒ double_elim;
 *   2. an internal feed graph (start.gg prereqs) with no losers ⇒ single_elim
 *      (an elimination tree — round-robin/swiss sets don't feed each other);
 *   3. otherwise classify per entrant-component and vote (weighted by match
 *      count), so a multi-GROUP round robin — each group a clique disconnected
 *      from the others — isn't diluted into "swiss" by measuring coverage across
 *      groups that never play each other.
 */
export function classifyExternalFormat(
  matches: ExternalTournamentMatch[],
): TournamentFormat | null {
  if (matches.length === 0) return null;
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
    votes[classifyComponent(component)] += component.length;
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

/**
 * Resolve the format for an external tournament. Reads an authoritative
 * projection `format` (see the scraper-column note) when present, else infers it,
 * defaulting to single_elim — which renders the existing bracket — so an
 * undecidable event never breaks, it just shows the ordinary bracket.
 *
 * RECOMMENDED FOLLOW-UP (cross-repo): the robust long-term signal is a `format`
 * column on ext_events/ext_tournaments, written by the scraper
 * (cen-news-notifications) from start.gg's phase `bracketType`
 * (SINGLE_ELIMINATION / DOUBLE_ELIMINATION / ROUND_ROBIN / SWISS) and FACEIT's
 * type. Per CLAUDE.md the cen-sql schema is owned by the scraper, so that goes in
 * its migrations + a read-only field in db/cen-schema.ts here. Wire it into this
 * function ahead of the inference; the inference stays as the fallback for rows
 * scraped before the column existed.
 */
export function resolveExternalFormat(
  events: ExternalTournamentDetail["events"],
): TournamentFormat {
  const matches = events.flatMap((event) => event.matches);
  return classifyExternalFormat(matches) ?? "single_elim";
}
