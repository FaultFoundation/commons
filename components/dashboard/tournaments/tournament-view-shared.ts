// Client-safe shared vocabulary for the tabbed tournament view. Both the
// internal (Challonge) page and the external (start.gg/FACEIT) view normalize
// their own data into these shapes and feed the same presentational pieces
// (TopFinishers, RecentResults, TournamentLinks, TournamentChrome), so the two
// look identical no matter where the data came from. No server-only imports —
// this is imported by client components.

/** A placement in the "Top finishers" / "Advancing" row. `place` is the podium
    rank (1/2/3, the trophy colour) — for a pool tournament it's the rank WITHIN
    the pool. `logoUrl` is the entrant's small favicon/logo (school favicon for
    external, team logo for internal). `poolLabel`, when set ("Pool A1"), marks
    this as one of a pool's advancing entrants rather than an overall podium. */
export type FinisherEntry = {
  place: number;
  name: string;
  logoUrl: string | null;
  poolLabel?: string | null;
};

/** One side of a completed (or in-progress) match, as the Recent Results list
    renders it: a name, its small logo, a display score, and whether it won. */
export type ResultSide = {
  name: string;
  logoUrl: string | null;
  /** Already display-formatted ("3", "–"); never a raw/negative number. */
  score: string;
  winner: boolean;
};

/** A single match/result row for the bracket-tab "Recent Results" sidebar. */
export type ResultRow = {
  id: string;
  /** Round label ("Grand Final", "Winners Round 1"); null when unknown. */
  round: string | null;
  /** Pre-formatted date + time ("Sep 4, 2026, @ 5:00 pm EST"); null when the
      match has no time. */
  dateLabel: string | null;
  a: ResultSide;
  b: ResultSide;
  /** Deep link to the provider match page; null for internal / no link. */
  url: string | null;
};

/** The four tabs every tournament view shows, in order. */
export type TournamentTabId = "overview" | "bracket" | "standings" | "rules";

export const TOURNAMENT_TAB_IDS: readonly TournamentTabId[] = [
  "overview",
  "bracket",
  "standings",
  "rules",
];

export function isTournamentTabId(value: string): value is TournamentTabId {
  return (TOURNAMENT_TAB_IDS as readonly string[]).includes(value);
}

/** Provider display names, shared by the tournament view's "Source" stat and
    its "View on <provider>" out-link, and by the series shell's hero (which
    renders the same stat row from the list projection). */
export const SOURCE_LABELS: Record<string, string> = {
  leagueos: "LeagueOS",
  discord: "Discord",
  startgg: "start.gg",
  faceit: "FACEIT",
  challonge: "Challonge",
  commons: "The Fault Foundation",
};

/** "Sep 4 – 6, 2026" / "Sep 4, 2026". Collapses a shared month or year, and
    tolerates only one end of the range being known. */
export function formatDateRange(
  start: Date | null,
  end: Date | null,
): string | null {
  if (!start && !end) return null;
  if (start && !end) {
    return start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (!start && end) {
    return end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const s = start as Date;
  const e = end as Date;
  // A one-day tournament carries start == end; without this it read "Sep 11 – 11".
  if (s.toDateString() === e.toDateString()) {
    return s.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const left = s.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = sameMonth
    ? `${e.getDate()}, ${e.getFullYear()}`
    : e.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  return `${left} – ${right}`;
}
