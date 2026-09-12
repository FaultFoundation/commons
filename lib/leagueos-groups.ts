import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";

/** LeagueOS leagues are containers; seasons, roster sizes and divisions live
 * inside them. Use provider identity, never shared artwork or display names. */
export function leagueosGroup(t: TournamentListEntry) {
  if (t.source !== "leagueos") return null;
  const id = t.discovery?.providerParentId;
  if (!id?.startsWith("series:leagueos:")) return null;
  return { id, name: t.discovery?.providerParentName ?? t.organizer ?? "League" };
}
