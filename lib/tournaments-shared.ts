// Tournament format/status/lifecycle constants, shared by server code and
// client components. Must stay free of server-only imports (db, cloudflare
// context) — the server counterparts are lib/tournaments.ts (D1) and
// lib/challonge.ts (the Challonge v2.1 API).
//
// Challonge is the bracket engine, so the values here that describe a bracket
// (formats, match/side labels) are *our* names for what Challonge reports; the
// mapping to Challonge's own strings lives in CHALLONGE_TYPE / matchStatus etc.

// ---------------------------------------------------------------------------
// Formats — our id <-> Challonge `tournament_type`
// ---------------------------------------------------------------------------

export const TOURNAMENT_FORMATS = [
  "single_elim",
  "double_elim",
  "round_robin",
  "swiss",
] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  single_elim: "Single Elimination",
  double_elim: "Double Elimination",
  round_robin: "Round Robin",
  swiss: "Swiss",
};

/** Our format id -> the string Challonge's `tournament_type` expects. */
export const CHALLONGE_TYPE: Record<TournamentFormat, string> = {
  single_elim: "single elimination",
  double_elim: "double elimination",
  round_robin: "round robin",
  swiss: "swiss",
};

/** Challonge `tournament_type` -> our format id (case/space tolerant). */
export function fromChallongeType(raw: string | null | undefined): TournamentFormat {
  const normalized = (raw ?? "").toLowerCase().replace(/[\s_]+/g, " ").trim();
  switch (normalized) {
    case "double elimination":
      return "double_elim";
    case "round robin":
      return "round_robin";
    case "swiss":
      return "swiss";
    default:
      return "single_elim";
  }
}

export function isTournamentFormat(value: unknown): value is TournamentFormat {
  return (
    typeof value === "string" &&
    (TOURNAMENT_FORMATS as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Statuses — our lifecycle (richer than Challonge's pending/underway/complete)
// ---------------------------------------------------------------------------

export const TOURNAMENT_STATUSES = [
  "draft",
  "registration",
  "seeding",
  "active",
  "completed",
  "cancelled",
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Draft",
  registration: "Registration Open",
  seeding: "Seeding",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function isTournamentStatus(value: unknown): value is TournamentStatus {
  return (
    typeof value === "string" &&
    (TOURNAMENT_STATUSES as readonly string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Match statuses — normalized from Challonge's match `state`
// (open | pending | complete). Rendered by the bracket view.
// ---------------------------------------------------------------------------

export const MATCH_STATUSES = ["pending", "open", "complete"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  pending: "Pending",
  open: "Ready",
  complete: "Final",
};

// ---------------------------------------------------------------------------
// Bracket sides — derived from Challonge's signed round (round < 0 = losers).
// ---------------------------------------------------------------------------

export const BRACKET_SIDES = ["W", "L", "group"] as const;
export type BracketSide = (typeof BRACKET_SIDES)[number];

export const BRACKET_SIDE_LABELS: Record<BracketSide, string> = {
  W: "Winners",
  L: "Losers",
  group: "Group Stage",
};

// ---------------------------------------------------------------------------
// Caps and field limits
// ---------------------------------------------------------------------------

/** Challonge's own per-tournament ceiling. */
export const MAX_PARTICIPANTS = 256;
export const SWISS_ROUNDS_MIN = 3;
export const SWISS_ROUNDS_MAX = 9;
export const TOURNAMENT_NAME_MAX = 120;
export const TOURNAMENT_SLUG_MAX = 80;
export const RULES_URL_MAX = 500;

// ---------------------------------------------------------------------------
// Identity and URLs
//
// A tournament's id IS its public identifier: a random 6-digit number, used
// unchanged in the admin URL and the public URL. There is no separate slug
// column and no slug to choose — the name segment of a public URL is derived
// from the name and is purely cosmetic, so renaming a tournament can never
// orphan a link.
// ---------------------------------------------------------------------------

/** 100000–999999. Six digits keeps the id short enough to read out loud. */
export const TOURNAMENT_ID_MIN = 100_000;
export const TOURNAMENT_ID_MAX = 999_999;

const TOURNAMENT_ID_RE = /^[1-9][0-9]{5}$/;

export function isTournamentId(value: unknown): value is string {
  return typeof value === "string" && TOURNAMENT_ID_RE.test(value);
}

/**
 * The cosmetic name segment of a public URL. Unlike a stored slug this never
 * has to be unique and never has to round-trip: lookup is by id alone, so this
 * only has to be stable for a given name and safe in a path.
 */
export function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, TOURNAMENT_SLUG_MAX)
    .replace(/-$/, "");
  return slug || "tournament";
}

/** Canonical public path. The single builder — never interpolate `/t/` by hand. */
export function tournamentPath(id: string, name: string): string {
  return `/t/${id}/${slugifyName(name)}/`;
}

// ---------------------------------------------------------------------------
// Lifecycle: which states allow which operations
// ---------------------------------------------------------------------------

export function acceptsEntries(status: TournamentStatus): boolean {
  return status === "registration";
}

/** Draft tournaments are staff-only; everything else is publicly viewable. */
export function isPublic(status: TournamentStatus): boolean {
  return status !== "draft";
}

export function isRosterLocked(
  status: TournamentStatus,
  rosterLockAt: number | null,
): boolean {
  if (status === "seeding" || status === "active" || status === "completed") {
    return true;
  }
  if (rosterLockAt && Date.now() >= rosterLockAt) return true;
  return false;
}

export function isRegistrationOpen(
  status: TournamentStatus,
  registrationOpensAt: number | null,
  registrationClosesAt: number | null,
): boolean {
  if (status !== "registration") return false;
  const now = Date.now();
  if (registrationOpensAt && now < registrationOpensAt) return false;
  if (registrationClosesAt && now >= registrationClosesAt) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Validators (truncate-and-normalize style, matching lib/teams.ts)
// ---------------------------------------------------------------------------

export function cleanTournamentName(raw: string): string | undefined {
  const trimmed = raw.trim().slice(0, TOURNAMENT_NAME_MAX);
  return trimmed.length >= 2 ? trimmed : undefined;
}

export function cleanRulesUrl(raw: string): string | null {
  const url = raw.trim().slice(0, RULES_URL_MAX);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function clampMaxParticipants(n: number): number {
  return Math.max(2, Math.min(MAX_PARTICIPANTS, Math.trunc(n)));
}

export function clampBestOf(n: number): number {
  const v = Math.trunc(n);
  if (v < 1 || v > 9 || v % 2 === 0) return 3;
  return v;
}

export function clampSwissRounds(n: number): number {
  return Math.max(SWISS_ROUNDS_MIN, Math.min(SWISS_ROUNDS_MAX, Math.trunc(n)));
}

// ---------------------------------------------------------------------------
// Bracket snapshot — the shape the server builds from Challonge (lib/challonge.ts
// -> lib/tournaments.ts) and the client renders (BracketView). Defined here so
// both sides share one type and can't drift; it stays client-safe (no imports).
// ---------------------------------------------------------------------------

export type SnapshotParticipant = {
  /** Challonge participant id (as a string). */
  id: string;
  /** Display label — our team name/tag, enriched from D1, falling back to the
      name we registered on Challonge. */
  name: string;
  seed: number | null;
  /** Final placement once the tournament completes. */
  finalRank: number | null;
  active: boolean;
};

export type SnapshotMatch = {
  /** Challonge match id (as a string). */
  id: string;
  /** Challonge's signed round: negative rounds are the losers bracket. */
  round: number;
  /** Challonge's "A"/"B"/… match label within a round. */
  identifier: string | null;
  side: BracketSide;
  player1Id: string | null;
  player2Id: string | null;
  winnerId: string | null;
  loserId: string | null;
  /** Challonge scores_csv, e.g. "3-1,2-3,3-0". */
  scores: string | null;
  state: MatchStatus;
  /** Challonge's suggested_play_order, for stable sorting. */
  order: number | null;
};

export type SnapshotPayload = {
  tournament: {
    id: string;
    name: string;
    format: TournamentFormat;
    status: TournamentStatus;
    /** Deep link to the live Challonge bracket, when known. */
    challongeUrl: string | null;
  };
  participants: SnapshotParticipant[];
  matches: SnapshotMatch[];
};

/** What the poll route adds on the way out (server-owned cadence). */
export type BracketSnapshot = SnapshotPayload & {
  version: number;
  nextPollMs: number | null;
};
