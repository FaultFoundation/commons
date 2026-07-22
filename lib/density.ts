// How tightly the dashboard packs a bubble's rows. Shared module (no
// "use server", no server-only imports): the shell reads it on the server, the
// Display control writes it from the client.
//
// `profiles.density` in D1 is the source of truth; the ff-density cookie is a
// cache so the shell doesn't pay a database read on every render. The setDensity
// action rewrites both, so the two can't drift.
//
// The names are also CSS: .ff-dash[data-density="…"] in styles/theme.css.

export const DENSITIES = ["compact", "cozy", "comfortable"] as const;

export type Density = (typeof DENSITIES)[number];

/** Matches the .ff-dash base tokens and the profiles.density column default. */
export const DENSITY_DEFAULT: Density = "cozy";

export const DENSITY_COOKIE = "ff-density";

/** A display preference, not a credential — the client has to be able to write
    it, so it isn't httpOnly. */
export const DENSITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const DENSITY_LABELS: Record<Density, string> = {
  compact: "Compact",
  cozy: "Cozy",
  comfortable: "Comfortable",
};

export const DENSITY_HINTS: Record<Density, string> = {
  compact: "Tightest spacing — the most on screen at once.",
  cozy: "The default balance of breathing room and density.",
  comfortable: "Roomiest spacing, easiest to hit on a touch screen.",
};

/** Anything unrecognized (a stale cookie, a hand-edited row) falls back to the
    default rather than emitting an attribute no stylesheet matches. */
export function asDensity(value: string | null | undefined): Density {
  return DENSITIES.includes(value as Density)
    ? (value as Density)
    : DENSITY_DEFAULT;
}
