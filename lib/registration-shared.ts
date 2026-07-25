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

// Unambiguous bands: the boundaries at 13 (COPPA block) and 18 (parental
// consent) have to be exact, so no bucket may straddle them. `isUnder13` /
// `isMinor` also tolerate the legacy bucket strings so old rows read correctly.
export const AGE_RANGES = [
  "Under 13",
  "13-17",
  "18-24",
  "25 or older",
] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

/** Under-13 registrants are turned away (we never knowingly collect their data
    — COPPA). Tolerates the legacy "12 years and under" bucket. */
export function isUnder13(ageRange: string | null | undefined): boolean {
  return ageRange === "Under 13" || ageRange === "12 years and under";
}

/** Minors (under 18) need a parent/guardian's consent before they're verified.
    Tolerates the legacy "13-18 years old" bucket (treated as a minor). */
export function isMinor(ageRange: string | null | undefined): boolean {
  return (
    isUnder13(ageRange) ||
    ageRange === "13-17" ||
    ageRange === "13-18 years old"
  );
}

// program_memberships.status values the site writes. The vocabulary matches
// the legacy sheet so the Discord bot can consume D1 rows later without
// translation.
export type RegistrationStatus =
  | "EMAIL_SENT"
  | "CONSENT_PENDING" // minor: waiting on a parent/guardian to confirm
  | "MANUAL_REVIEW"
  | "VERIFIED"
  | "INELIGIBLE"; // staff-set only
