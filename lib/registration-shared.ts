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
