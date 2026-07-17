// Stable ids for the seeded registry rows (see db/seed/bootstrap.sql). We use
// readable slugs as the primary keys for these singleton-ish rows so code can
// reference them without a lookup. Client-safe: constants only, no imports.

export const GAME_OVERWATCH_ID = "overwatch";
export const PROGRAM_COLLEGIATE_ID = "collegiate-overwatch";
