// Registration constants shared by server code and client components.
// This module must stay free of server-only imports (db, cloudflare context).

// Verification-code length. Lives here because the code entry field needs it
// too; the alphabet and generator stay server-side in lib/registration.ts.
export const CODE_LENGTH = 6;

export const USER_TYPES = [
  "University student",
  "University alumnus",
  "High school student",
  "None of the above",
] as const;
export type UserType = (typeof USER_TYPES)[number];

/**
 * Numeric ids for the Discord Linked Roles `member_type` metadata key.
 *
 * Discord allows only 5 metadata records per application, so the member types
 * share one INTEGER_EQUAL key rather than burning a boolean each.
 *
 * These numbers are a PUBLIC CONTRACT: server admins type them into role
 * requirements by hand. Renumbering silently re-points every configured role at
 * the wrong members. Only ever append. 0 is reserved for "not verified" — see
 * pushRoleConnection in lib/platform-identities.ts.
 *
 * Keep in sync with the description text in scripts/register-role-metadata.mjs,
 * which is a standalone .mjs and can't import this.
 */
export const MEMBER_TYPE_IDS: Record<UserType, number> = {
  "University student": 1,
  "University alumnus": 2,
  "High school student": 3,
  "None of the above": 4, // shown to admins as "Guest"
};

export const AGE_RANGES = [
  "12 years and under",
  "13-18 years old",
  "18-25 years old",
  "26 years and older",
] as const;

// program_memberships.status values the site writes. The vocabulary matches
// the legacy sheet so the Discord bot can consume D1 rows later without
// translation.
export type RegistrationStatus =
  | "EMAIL_SENT"
  | "MANUAL_REVIEW"
  | "VERIFIED"
  | "INELIGIBLE"; // staff-set only
