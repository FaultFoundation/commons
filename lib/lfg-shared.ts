// Shapes for the matchmaking (LFG / LFT / LFM) JSON columns, shared by server
// code and client components. Must stay free of server-only imports.
//
// `lfg_profiles` and `team_listings` both store `positions` and `availability`
// as JSON strings so a new field never means a migration. That only works if
// exactly one module owns the shape — this one. Read and write those columns
// through these helpers; never JSON.parse them ad hoc.
//
// Nothing renders these yet (the browse/apply screens are still WIP); the
// tables and this contract ship first so the UI can be built without another
// schema change.

/** In-game roles a player fills, matching `team_members.position`. */
export const LFG_POSITIONS = ["tank", "damage", "support", "flex"] as const;
export type LfgPosition = (typeof LFG_POSITIONS)[number];

export const LFG_POSITION_LABELS: Record<LfgPosition, string> = {
  tank: "Tank",
  damage: "Damage",
  support: "Support",
  flex: "Flex",
};

/** `lfg_profiles.status` — a placed player keeps their profile for history. */
export const LFG_PROFILE_STATUSES = ["open", "paused", "placed"] as const;
export type LfgProfileStatus = (typeof LFG_PROFILE_STATUSES)[number];

/** `team_listings.status`. */
export const LFG_LISTING_STATUSES = ["open", "closed", "filled"] as const;
export type LfgListingStatus = (typeof LFG_LISTING_STATUSES)[number];

/** `lfg_connections.status` / `.direction`. */
export const LFG_CONNECTION_STATUSES = [
  "open",
  "accepted",
  "declined",
  "withdrawn",
] as const;
export type LfgConnectionStatus = (typeof LFG_CONNECTION_STATUSES)[number];
export type LfgDirection = "player_to_team" | "team_to_player";

// ---------------------------------------------------------------------------
// Availability
//
// Scrim scheduling is a weekly rhythm, so availability is a set of weekday +
// half-open hour-range blocks, stored alongside the row's IANA `timezone`
// column (kept out of the JSON so it can be queried and indexed on its own).
// Hours are local to that timezone, 0-24, so "19:00 until midnight" is
// { day: 5, start: 19, end: 24 }.
// ---------------------------------------------------------------------------

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type AvailabilityBlock = {
  day: Weekday;
  /** Local hour the block opens, 0-23. */
  start: number;
  /** Local hour the block closes, 1-24; always greater than `start`. */
  end: number;
};

export type Availability = AvailabilityBlock[];

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Parses an availability column. Anything malformed degrades to `[]`. */
export function parseAvailability(json: string | null | undefined): Availability {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((block): block is AvailabilityBlock => {
      if (typeof block !== "object" || block === null) return false;
      const { day, start, end } = block as Record<string, unknown>;
      return (
        isWeekday(day) &&
        typeof start === "number" &&
        typeof end === "number" &&
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        end <= 24 &&
        start < end
      );
    });
  } catch {
    return [];
  }
}

/** Serializes for storage; an empty set stores NULL rather than "[]". */
export function serializeAvailability(blocks: Availability): string | null {
  const valid = blocks.filter((b) => b.start < b.end);
  return valid.length ? JSON.stringify(valid) : null;
}

/** Whether two availability sets share any hour of the week. */
export function availabilityOverlaps(a: Availability, b: Availability): boolean {
  return a.some((x) =>
    b.some((y) => x.day === y.day && x.start < y.end && y.start < x.end),
  );
}

// ---------------------------------------------------------------------------
// Positions + skill
// ---------------------------------------------------------------------------

export function parsePositions(json: string | null | undefined): LfgPosition[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is LfgPosition =>
      (LFG_POSITIONS as readonly unknown[]).includes(p),
    );
  } catch {
    return [];
  }
}

export function serializePositions(positions: LfgPosition[]): string | null {
  const unique = [...new Set(positions)];
  return unique.length ? JSON.stringify(unique) : null;
}

/**
 * Whether a player's rating clears a listing's band. An unset rating on either
 * side passes: a listing with no band takes anyone, and a player who hasn't
 * entered an SR shouldn't be filtered out of every result.
 */
export function skillInRange(
  rating: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (rating == null) return true;
  if (min != null && rating < min) return false;
  if (max != null && rating > max) return false;
  return true;
}

/** A listing matches a player when both position and skill line up. */
export function positionsOverlap(
  wanted: LfgPosition[],
  played: LfgPosition[],
): boolean {
  if (!wanted.length || !played.length) return true;
  if (played.includes("flex") || wanted.includes("flex")) return true;
  return wanted.some((p) => played.includes(p));
}
