// ---------------------------------------------------------------------------
// Personal schedule — the client-safe half. Provider ids, labels, and the
// normalized calendar-entry shape, importable from client components. No
// server-only imports (db, cloudflare context, provider fetches): the sync and
// D1 reads live in lib/schedule.ts. Follows the *-shared.ts convention.
// ---------------------------------------------------------------------------

/**
 * The connected esports platforms the calendar aggregates. Mirrors
 * CONNECT_PROVIDERS (lib/integrations-shared.ts) — every provider a member can
 * link can also feed their schedule.
 */
export const SCHEDULE_PROVIDERS = ["faceit", "startgg", "challonge"] as const;

export type ScheduleProvider = (typeof SCHEDULE_PROVIDERS)[number];

/** Brand name shown on a calendar entry's provider chip. */
export const SCHEDULE_PROVIDER_LABELS: Record<ScheduleProvider, string> = {
  faceit: "FACEIT",
  startgg: "start.gg",
  challonge: "Challonge",
};

/**
 * Provider-normalized status. Every adapter maps its own vocabulary onto these
 * four so the calendar renders one system:
 * - scheduled — upcoming, not started
 * - live — underway right now
 * - finished — played out (goes to Results)
 * - cancelled — called off
 */
export type ScheduleStatus = "scheduled" | "live" | "finished" | "cancelled";

/** True for statuses that belong in the "Upcoming" list vs "Results". */
export function isUpcomingStatus(status: ScheduleStatus): boolean {
  return status === "scheduled" || status === "live";
}

/**
 * One normalized calendar entry — a single external match, or a tournament
 * appearance where the provider only exposes tournament granularity. Built from
 * an external_matches row (lib/schedule.ts `toEntry`).
 */
export type ScheduleEntry = {
  id: string;
  provider: ScheduleProvider;
  /** Event/tournament name, or "Match" when the provider gives none. */
  title: string;
  /** Opponent, when the provider resolves one (else null). */
  opponent: string | null;
  /** Round label (e.g. "Quarterfinal"), when known. */
  round: string | null;
  status: ScheduleStatus;
  /** Epoch ms, or null when the provider gives no time. */
  scheduledAt: number | null;
  /** Deep link to the match/tournament on the provider. */
  url: string | null;
};

/** Narrow an arbitrary string to a ScheduleProvider (adapter/read guard). */
export function isScheduleProvider(value: string): value is ScheduleProvider {
  return (SCHEDULE_PROVIDERS as readonly string[]).includes(value);
}
