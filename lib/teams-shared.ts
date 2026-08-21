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
