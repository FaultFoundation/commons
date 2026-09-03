// Client-safe shared vocabulary for the tabbed tournament view. Both the
// internal (Challonge) page and the external (start.gg/FACEIT) view normalize
// their own data into these shapes and feed the same presentational pieces
// (TopFinishers, RecentResults, TournamentLinks, TournamentChrome), so the two
// look identical no matter where the data came from. No server-only imports —
// this is imported by client components.

/** A podium placement for the "Top finishers" row. `place` is 1/2/3 (the trophy
    colour) — the row only ever shows the top three. `logoUrl` is the entrant's
    small favicon/logo (school favicon for external, team logo for internal). */
export type FinisherEntry = {
  place: number;
  name: string;
  logoUrl: string | null;
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
  /** Pre-formatted short date ("Aug 30"); null when the match has no time. */
  dateLabel: string | null;
  a: ResultSide;
  b: ResultSide;
  /** Deep link to the provider match page; null for internal / no link. */
  url: string | null;
};

/** The kind of a header "known link" — picks the brand/utility icon and the
    default accessible label. Only links we actually have are ever rendered. */
export type HeaderLinkKind =
  | "video"
  | "stream"
  | "twitch"
  | "discord"
  | "x"
  | "facebook"
  | "youtube"
  | "instagram"
  | "website"
  | "email"
  | "organizer"
  | "rules"
  | "provider";

/** One icon in the header's social/known-links row. */
export type HeaderLink = {
  kind: HeaderLinkKind;
  /** Accessible label + tooltip, e.g. "Watch the stream", "Organizer: …". */
  label: string;
  href: string;
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
