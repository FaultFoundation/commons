/**
 * sessionStorage key for the in-progress academic-verification form.
 *
 * The form is written on every keystroke and restored on mount, so stepping
 * back from the code page (or with the browser's Back button) keeps what was
 * typed. Cleared once the code verifies — past that the server row is the
 * source of truth. Shared constant so the writer and the clearer can't drift.
 */
export const SETUP_DRAFT_KEY = "ff-setup-academic-draft";

export function clearSetupDraft(): void {
  try {
    sessionStorage.removeItem(SETUP_DRAFT_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
