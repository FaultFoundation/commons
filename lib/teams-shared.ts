// Team role/capability model, shared by server code and client components.
// This module must stay free of server-only imports (db, cloudflare context).

/**
 * The permission tiers on `team_members.role`. Distinct from `position`
 * (tank/damage/support), which says nothing about what someone may do.
 *
 * Ordered most- to least-privileged; the roster UI renders selects in this
 * order and `outranks` reads the array positions.
 */
export const TEAM_ROLES = ["manager", "captain", "coach", "player"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  manager: "Manager",
  captain: "Captain",
  coach: "Coach",
  player: "Player",
};

export const TEAM_ROLE_HINTS: Record<TeamRole, string> = {
  manager: "Runs the team: settings, roster, scores, and deletion.",
  captain: "Everything a manager can do except deleting the team.",
  coach: "Sees stats and the schedule; can't change anything.",
  player: "On the roster. Sees stats and the schedule.",
};

export type TeamCapability =
  | "viewStats"
  | "editSettings"
  | "manageRoster"
  | "manageInvites"
  | "enterTournaments"
  | "deleteTeam";

/**
 * The whole permission model, in one place. Adding a capability means adding
 * it here and gating the action + the bubble that renders it — never checking
 * a role name inline (`role === "manager"`) anywhere else.
 *
 * Managers and captains are deliberately near-identical: the one thing only a
 * manager may start is deletion, which then needs EVERY manager to agree
 * (lib/teams.ts `resolveDeleteRequest`).
 */
export const TEAM_CAPABILITIES: Record<TeamRole, readonly TeamCapability[]> = {
  manager: [
    "viewStats",
    "editSettings",
    "manageRoster",
    "manageInvites",
    "enterTournaments",
    "deleteTeam",
  ],
  captain: [
    "viewStats",
    "editSettings",
    "manageRoster",
    "manageInvites",
    "enterTournaments",
  ],
  coach: ["viewStats"],
  player: ["viewStats"],
};

export function can(role: TeamRole, capability: TeamCapability): boolean {
  return TEAM_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function isTeamRole(value: unknown): value is TeamRole {
  return (
    typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value)
  );
}

/** Falls back to `player` for unknown/legacy values rather than throwing. */
export function asTeamRole(value: string | null | undefined): TeamRole {
  return isTeamRole(value) ? value : "player";
}

/** True when `a` is strictly more privileged than `b`. */
export function outranks(a: TeamRole, b: TeamRole): boolean {
  return TEAM_ROLES.indexOf(a) < TEAM_ROLES.indexOf(b);
}

/**
 * Which roles `actor` may hand out. Only managers can mint managers —
 * otherwise a captain could promote themselves past their own tier.
 */
export function assignableRoles(actor: TeamRole): readonly TeamRole[] {
  if (actor === "manager") return TEAM_ROLES;
  if (actor === "captain") return TEAM_ROLES.filter((r) => r !== "manager");
  return [];
}

// Field limits, shared so the client can cap inputs at the same values the
// server truncates to.
export const TEAM_NAME_MAX = 60;
export const TEAM_TAG_MAX = 6;
export const TEAM_DESCRIPTION_MAX = 500;

// ---------------------------------------------------------------------------
// Team accent colour. Chosen at sign-up (and editable in settings), stored on
// teams.color, and used as the card/hero accent — a stripe + logo ring, not a
// full banner. A curated swatch set the picker offers, plus any custom hex.
// ---------------------------------------------------------------------------

/** The house blue, used when a team hasn't picked a colour. */
export const DEFAULT_TEAM_COLOR = "#0074a6";

/** Preset swatches the colour picker offers (custom hex still allowed). */
export const TEAM_COLORS: readonly string[] = [
  "#0074a6", // brand blue
  "#5b8def", // periwinkle
  "#7c5cff", // violet
  "#e0457b", // magenta
  "#ff6363", // coral
  "#f2994a", // orange
  "#f2c94c", // gold
  "#27ae60", // green
  "#16b5a5", // teal
  "#9aa7b4", // slate
];

/** Validate and normalize a hex colour to lowercase `#rrggbb`, or null. Accepts
    3- or 6-digit hex (expanding shorthand); anything else is null so a forged or
    empty value falls back to the default rather than injecting arbitrary CSS. */
export function normalizeTeamColor(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/.test(raw) ? raw : null;
}

/** The colour to actually paint with — the team's, or the brand default. */
export function teamColor(color: string | null | undefined): string {
  return normalizeTeamColor(color) ?? DEFAULT_TEAM_COLOR;
}
