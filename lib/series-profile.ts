import { cache } from "react";

import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { discoveryCatalog } from "@/lib/discovery";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import type { DiscoveryProfile } from "@/lib/discovery-shared";
// Re-exported so a server caller has one import for the whole profile surface;
// the definitions live in the client-safe module because the strip and the card
// grid are client components.
export {
  seriesOverviewPath,
  seriesTournamentPath,
} from "@/lib/discovery-shared";
import { seriesStatus } from "@/lib/series-status";

/**
 * The series/organization profile, resolved ONCE per request.
 *
 * The profile route is now three segments deep — a layout that owns the
 * persistent hero + tournament strip, an index that auto-selects a tournament,
 * and a child that renders one. All three need the same answer ("which profile,
 * which tournaments"), and Next renders them in one request, so this is React
 * `cache`d exactly like `getSessionCached` / `loadTournamentEntries`: the
 * catalog pass over every entry is paid once, not three times.
 */
export type SeriesProfile = {
  profile: DiscoveryProfile;
  /** The profile's member tournaments, newest first. */
  tournaments: TournamentListEntry[];
  /** Lifecycle over the COMPLETE membership (see lib/series-status.ts). */
  lifecycle: ReturnType<typeof seriesStatus>;
  isLeague: boolean;
  /** "League" | "Series" | "Organization" — what the badge and copy call it. */
  kindLabel: string;
};

/** Decode a route param, tolerating a malformed sequence rather than throwing. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * LeagueOS leagues and organization pages collect by provider/organization
 * identity; an inferred series collects by its series id. Kept in one place so
 * the layout, the index and the child page can never disagree about membership
 * (which would let the strip offer a tournament the child then 404s).
 */
function isMember(entry: TournamentListEntry, id: string, profile: DiscoveryProfile): boolean {
  return id.startsWith("series:leagueos:") || profile.kind === "organization"
    ? entry.discovery?.organizationId === id ||
        entry.discovery?.providerParentId === id
    : entry.discovery?.seriesId === id;
}

export const getSeriesProfile = cache(
  async (routeId: string): Promise<SeriesProfile | null> => {
    const id = safeDecode(routeId);
    const entries = await loadTournamentEntries();
    const profiles = await discoveryCatalog(entries);
    const profile =
      profiles.find((p) => p.id === routeId) ?? profiles.find((p) => p.id === id);
    if (!profile) return null;

    // Newest first: the strip is a navigation control, and what is running or
    // just finished is what a member opening a series is looking for. Undated
    // rows sort last rather than jumping to the front on a 0.
    const tournaments = entries
      .filter((t) => isMember(t, profile.id, profile))
      .sort(
        (a, b) =>
          (b.startsAt ?? -Infinity) - (a.startsAt ?? -Infinity) ||
          a.name.localeCompare(b.name),
      );

    const isLeague =
      profile.id.startsWith("series:leagueos:") ||
      tournaments.some((t) => t.discovery?.competition === "league");

    return {
      profile,
      tournaments,
      lifecycle: seriesStatus(tournaments, Date.now()),
      isLeague,
      kindLabel:
        profile.kind === "organization" && !profile.id.startsWith("series:leagueos:")
          ? "Organization"
          : isLeague
            ? "League"
            : "Series",
    };
  },
);

/**
 * Which tournament the series opens on. A member arriving at a season wants
 * whatever is happening now, so: live first, then one taking registrations,
 * then the next upcoming, then the most recent past one. Falls back to the
 * first member tournament so a profile with only undated rows still opens.
 */
export function preferredTournament(
  tournaments: TournamentListEntry[],
): TournamentListEntry | null {
  if (tournaments.length === 0) return null;
  const now = Date.now();
  const live = tournaments.find((t) => t.status === "active");
  if (live) return live;
  const registering = tournaments.find((t) => t.status === "registration");
  if (registering) return registering;
  // `tournaments` is newest-first, so the LAST future row is the soonest one.
  const upcoming = tournaments.filter((t) => (t.startsAt ?? 0) > now);
  if (upcoming.length) return upcoming[upcoming.length - 1];
  const past = tournaments.find((t) => t.startsAt != null);
  return past ?? tournaments[0];
}
