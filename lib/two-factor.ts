// Shared two-factor helpers. No directive and no server-only imports: both the
// Account tab's enrollment rows and the public sign-in challenge use these, and
// the two must speak about failures in exactly the same words.

const GENERIC = "Something went wrong. Please try again.";

/**
 * Better Auth's TWO_FACTOR_ERROR_CODES, in language a member can act on.
 *
 * The distinction that matters is "try again" vs "start over": once the
 * challenge cookie is gone or the attempt budget is spent, re-entering a code
 * can't work, and saying so is the difference between a member finding the
 * backup-code link and giving up.
 */
const MESSAGES: Record<string, string> = {
  INVALID_CODE: "That code isn't right. Check the latest one and try again.",
  OTP_HAS_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE:
    "Too many tries with that code. Send a new one.",
  ACCOUNT_TEMPORARILY_LOCKED:
    "Too many failed attempts. Try again in about 15 minutes.",
  INVALID_TWO_FACTOR_COOKIE:
    "This sign-in attempt timed out. Enter your email and password again.",
  INVALID_BACKUP_CODE: "That backup code isn't right, or it's already been used.",
  TWO_FACTOR_NOT_ENABLED: "Two-factor authentication isn't set up on this account.",
  OTP_NOT_ENABLED: "Email codes aren't available right now.",
  TOTP_NOT_ENABLED: "No authenticator app is set up on this account.",
  INVALID_PASSWORD: "That password is incorrect.",
};

/** Maps a Better Auth client error to display copy. */
export function twoFactorError(error: {
  code?: string | undefined;
  message?: string | undefined;
}): string {
  return (
    (error.code ? MESSAGES[error.code] : undefined) ?? error.message ?? GENERIC
  );
}

/**
 * The base32 secret out of an `otpauth://` URI, spaced into groups of four.
 *
 * Every authenticator app accepts this typed by hand, which is the fallback
 * when someone is setting up 2FA on the same device that's showing the QR —
 * there's no second camera to point at the screen.
 */
export function manualEntryKey(totpURI: string): string | null {
  const secret = new URL(totpURI).searchParams.get("secret");
  if (!secret) return null;
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}
