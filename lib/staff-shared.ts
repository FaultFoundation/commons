// Staff role/capability model, shared by server code and client components.
// This module must stay free of server-only imports (db, cloudflare context) —
// it is the site-wide analogue of lib/teams-shared.ts, gating the admin
// dashboard instead of a single team.

/**
 * The permission tiers on `staff_roles.role`. Ordered most- to least-
 * privileged; `outranks` and `assignableStaffRoles` read the array positions.
 *
 * A user may hold several of these at once (the table's unique key is
 * (user_id, role, program_id)), so authorization is "does ANY held role grant
 * this" — see `canAny`.
 */
export const STAFF_ROLES = [
  "owner",
  "admin",
  "moderator",
  "tournament_admin",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  tournament_admin: "Tournament Admin",
};

export const STAFF_ROLE_HINTS: Record<StaffRole, string> = {
  owner: "Full control, including granting and revoking other staff.",
  admin: "Everything an owner can do except managing other owners.",
  moderator: "Handles support tickets and moderation.",
  tournament_admin: "Runs tournaments and brackets.",
};

export type StaffCapability =
  | "viewAdmin"
  | "manageTickets"
  | "viewTeams"
  | "manageTeams"
  | "manageTournaments"
  | "manageStaff"
  | "moderate";

/**
 * The whole staff permission model, in one place. Adding a capability means
 * adding it here and gating the action + the UI that renders it — never
 * checking a role name inline (`role === "admin"`) anywhere else.
 *
 * Owner and admin share the same capabilities on purpose; they differ only in
 * the grant hierarchy (`assignableStaffRoles`) — an admin cannot mint or remove
 * owners/admins.
 */
export const STAFF_CAPABILITIES: Record<StaffRole, readonly StaffCapability[]> =
  {
    owner: [
      "viewAdmin",
      "manageTickets",
      "viewTeams",
      "manageTeams",
      "manageTournaments",
      "manageStaff",
      "moderate",
    ],
    admin: [
      "viewAdmin",
      "manageTickets",
      "viewTeams",
      "manageTeams",
      "manageTournaments",
      "manageStaff",
      "moderate",
    ],
    // `viewTeams` (read the admin teams panel) without `manageTeams` (edit it):
    // a moderator browses every team read-only, but only owner/admin can change
    // one from here.
    moderator: ["viewAdmin", "manageTickets", "viewTeams", "moderate"],
    tournament_admin: ["viewAdmin", "manageTournaments"],
  };

/** Whether a single role grants a capability. */
export function can(role: StaffRole, capability: StaffCapability): boolean {
  return STAFF_CAPABILITIES[role]?.includes(capability) ?? false;
}

/** Whether any of the roles a user holds grants a capability. */
export function canAny(
  roles: readonly StaffRole[],
  capability: StaffCapability,
): boolean {
  return roles.some((role) => can(role, capability));
}

export function isStaffRole(value: unknown): value is StaffRole {
  return (
    typeof value === "string" &&
    (STAFF_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Narrows a stored value to a StaffRole, or null for unknown/legacy values.
 * Unlike teams' `asTeamRole`, there is no safe default — an unrecognized staff
 * role must grant nothing rather than silently falling back to a real tier.
 */
export function asStaffRole(value: string | null | undefined): StaffRole | null {
  return isStaffRole(value) ? value : null;
}

/** True when `a` is strictly more privileged than `b`. */
export function outranks(a: StaffRole, b: StaffRole): boolean {
  return STAFF_ROLES.indexOf(a) < STAFF_ROLES.indexOf(b);
}

/**
 * Which staff roles `actor` may grant or revoke. Only owners may touch
 * owners/admins; admins may manage the lower tiers; everyone else, nothing.
 */
export function assignableStaffRoles(actor: StaffRole): readonly StaffRole[] {
  if (actor === "owner") return STAFF_ROLES;
  if (actor === "admin") return ["moderator", "tournament_admin"];
  return [];
}
