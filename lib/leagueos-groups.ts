import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { competitionSeries } from "@/lib/discovery-series";

/** LeagueOS leagues are containers; seasons, roster sizes and divisions live
 * inside them. Use provider identity, never shared artwork or display names. */
export function leagueosGroup(t: TournamentListEntry) {
  if (t.source !== "leagueos") return null;
  const id = t.discovery?.providerParentId;
  if (!id?.startsWith("series:leagueos:")) return null;
  return { id, name: t.discovery?.providerParentName ?? t.organizer ?? "League" };
}

/** Presentation groups only: preserve source tournaments and existing series
 * identities/links. Academic programs and named competitions remain distinct. */
export function leagueosSections(tournaments: TournamentListEntry[]) {
  const sections = new Map<string, {
    name: string;
    tournaments: TournamentListEntry[];
    latest: number;
  }>();
  for (const t of tournaments) {
    const title = competitionSeries(t)?.name;
    const name = title?.replace(/\(?\b\d+\s*v(?:s\.?)?\s*\d+\b\)?/gi, " ")
      .replace(/\b(?:junior\s+varsity|varsity|jv|club)\b/gi, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\s+/g, " ").replace(/^[\s·|:-]+|[\s·|:-]+$/g, "").trim()
      || "Other competitions";
    const key = name.toLowerCase();
    const section = sections.get(key) ?? { name, tournaments: [], latest: 0 };
    section.tournaments.push(t);
    section.latest = Math.max(section.latest, t.sourceStartsAt ?? t.startsAt ?? 0);
    sections.set(key, section);
  }
  return [...sections.values()].sort((a, b) => b.latest - a.latest || a.name.localeCompare(b.name));
}
