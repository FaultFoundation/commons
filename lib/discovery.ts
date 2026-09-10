import { competitionSeries } from "@/lib/discovery-series";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  discoveryProfiles,
  discoveryOverrides,
  discoveryIdentities,
  discoveryFollows,
} from "@/db/schema";
import {
  discoveryId,
  inferFacts,
  organizerIdentity,
  seriesName,
  providerParent,
  validFacts,
  type DiscoveryProfile,
} from "@/lib/discovery-shared";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
export const loadDiscoveryOverlay = cache(async () => {
  const db = getDb();
  try {
    const [profiles, overrides, identities] = await db.batch([
      db.select().from(discoveryProfiles),
      db.select().from(discoveryOverrides),
      db.select().from(discoveryIdentities),
    ]);
    return { profiles, overrides, identities, available: true };
  } catch (error) {
    console.error("Discovery storage unavailable", error);
    return { profiles: [], overrides: [], identities: [], available: false };
  }
});
export async function enrichDiscovery(
  entries: TournamentListEntry[],
): Promise<TournamentListEntry[]> {
  const overlay = await loadDiscoveryOverlay();
  const identities = overlay.identities;
  const overrides = new Map(
    overlay.overrides.map((o) => [o.tournamentId, o.data]),
  );
  const candidates = new Map<string, TournamentListEntry[]>();
  // Every game a single provider tournament runs projects to its own external
  // row, all sharing `${source}:${sourceTournamentId}`. Rows sharing that key are
  // literally one tournament's several games — group size >1 means "runs multiple
  // games", which is exactly a series (the user's definition), so we group them
  // deterministically, without needing the fragile organizer/name inference (an
  // older event may carry no organizer at all).
  const tournamentGroups = new Map<string, TournamentListEntry[]>();
  const enriched = entries.map((t) => {
    const d = inferFacts(t);
    const identity = organizerIdentity(t);
    // Missing source identity never groups unrelated organizers by display name.
    const attributionStart = t.sourceStartsAt ?? t.startsAt;
    const identityRule =
      identity && attributionStart != null
        ? identities
            .filter(
              (i) =>
                i.identity === identity &&
                attributionStart >= i.validFrom &&
                (i.validTo == null || attributionStart < i.validTo),
            )
            .sort((a, b) => b.validFrom - a.validFrom)[0]
        : null;
    d.organizationId = identity
      ? (identityRule?.organizationId ?? discoveryId("organization", identity))
      : null;
    const tournamentKey =
      t.source && t.sourceTournamentId
        ? `${t.source}:${t.sourceTournamentId}`
        : null;
    if (tournamentKey) {
      const group = tournamentGroups.get(tournamentKey) ?? [];
      group.push(t);
      tournamentGroups.set(tournamentKey, group);
    }
    // Organizer + season/series name, GAME-INDEPENDENT: a program that runs the
    // same season across several games (or several per-game tournaments) is one
    // series, so the game is deliberately NOT part of the key. Season/year and
    // division stay (via seriesName), so different seasons remain distinct.
    const key = d.organizationId
      ? `${d.organizationId}|${seriesName(t.name).toLowerCase()}`
      : null;
    if (key) {
      const group = candidates.get(key) ?? [];
      group.push(t);
      candidates.set(key, group);
    }
    return { ...t, discovery: d, candidateKey: key, tournamentKey };
  });
  // Per-game projections can have uneven metadata. An unambiguous parent on
  // one sibling applies to every row of that same provider tournament.
  const tournamentParents = new Map<string, NonNullable<ReturnType<typeof providerParent>>>();
  for (const [key, group] of tournamentGroups) {
    const parents = group.map(providerParent).filter((p) => p != null);
    if (new Set(parents.map(p => p.id)).size === 1) {
      tournamentParents.set(key, parents[0]);
    }
  }
  const parentNames = new Map<string, string>();
  for (const t of [...entries].sort((a,b) => a.id.localeCompare(b.id))) {
    const parent = providerParent(t);
    if (parent && t.organizer?.trim() && !parentNames.has(parent.id)) parentNames.set(parent.id, t.organizer.trim());
  }
  const providerDetails = new Map(enriched.map(t => {
    const parent = (t.tournamentKey ? tournamentParents.get(t.tournamentKey) : null) ?? providerParent(t);
    const competition = parent ? competitionSeries(t) : null;
    const key = parent && competition ? `series:competition:${JSON.stringify([parent.id, competition.key])}` : null;
    return [t.id, {parent, competition, key}];
  }));
  const providerCounts = new Map<string, number>();
  for (const {key} of providerDetails.values()) if (key) providerCounts.set(key, (providerCounts.get(key) ?? 0) + 1);
  return enriched.map(({ candidateKey, tournamentKey, ...t }) => {
    const {parent, competition, key} = providerDetails.get(t.id)!;
    let linkedSeriesName: string | undefined;
    if (parent) {
      // Keep the organizer-level link even when no competition can be inferred.
      t.discovery.organizationId ??= parent.id.replace(/^series:/, "organization:");
      if (competition && key && ((providerCounts.get(key) ?? 0) > 1 || /\b(?:20\d{2}|season\s+\w+)\b/i.test(competition.name))) {
        t.discovery.seriesId = key;
        const parentName = parentNames.get(parent.id) ?? parent.name;
        linkedSeriesName = t.source === "leagueos" && t.organizer?.trim()
          ? `${parentName} · ${competition.name}` : competition.name;
        t.discovery.reasons.push("Competition title groups games and installments within the source organizer; season and program retained");
      }
    }
    // Highest confidence: this tournament runs several games (its per-game rows
    // share one source tournament id). That IS a series — group its games under
    // one bubble regardless of what the name or organizer say.
    if (!t.discovery.seriesId && tournamentKey && (tournamentGroups.get(tournamentKey)?.length ?? 0) > 1) {
      t.discovery.seriesId = discoveryId("series", `multigame:${tournamentKey}`);
      t.discovery.reasons.push(
        "One source tournament runs multiple games at once",
      );
    }
    if (!parent && !t.discovery.seriesId && candidateKey) {
      const group = candidates.get(candidateKey)!;
      // A named league/season can stand alone; recurrence needs at least two
      // tournaments AND an explicit installment marker, not merely equal names.
      if (
        /\b(?:league|season|series)\b/i.test(t.name) ||
        (group.length > 1 && group.some((x) => seriesName(x.name) !== x.name))
      ) {
        t.discovery.seriesId = discoveryId("series", candidateKey);
        t.discovery.reasons.push(
          "Series inferred from source organizer and title, across games; season/division preserved",
        );
      }
    }
    if (!parent && !t.discovery.seriesId && /\b(?:league|season|series)\b/i.test(t.name)) {
      t.discovery.seriesId = discoveryId("series", `tournament:${t.id}`);
      t.discovery.reasons.push(
        "Single source tournament describes a league, season or series",
      );
    }
    const raw = overrides.get(t.id);
    if (raw) {
      try {
        const facts: unknown = JSON.parse(raw);
        if (validFacts(facts))
          t.discovery = {
            ...facts,
            reviewed: true,
            reasons: ["Classification reviewed by Commons"],
          };
      } catch {
        /* invalid overlay cannot corrupt source */
      }
    }
    if (parent) {
      t.discovery.providerParentId = parent.id;
      t.discovery.providerParentName = parentNames.get(parent.id) ?? parent.name;
    }
    t.discovery.organizationName =
      overlay.profiles.find((p) => p.id === t.discovery.organizationId)?.name ??
      t.organizer ??
      t.discovery.providerParentName;
    t.discovery.seriesName =
      overlay.profiles.find((p) => p.id === t.discovery.seriesId)?.name ??
      (key === t.discovery.seriesId ? linkedSeriesName : undefined) ??
      // A single-tournament series (whether it's a lone named event or a
      // multi-game tournament) is named for the tournament itself; an inferred
      // cross-tournament series uses the season/series name.
      (t.discovery.seriesId?.startsWith("series:tournament:") ||
      t.discovery.seriesId?.startsWith("series:multigame:")
        ? t.name
        : seriesName(t.name));
    return t;
  });
}
export async function discoveryCatalog(
  entries: TournamentListEntry[],
): Promise<DiscoveryProfile[]> {
  const overlay = await loadDiscoveryOverlay();
  const profiles = new Map<string, DiscoveryProfile>(
    overlay.profiles.map((p) => [p.id, p]),
  );
  for (const t of entries) {
    const parentId = t.discovery?.providerParentId;
    if (parentId) {
      // Historical parent links/follows still resolve, now as organizer pages.
      // They are not memberships in the Series list anymore.
      const existing = profiles.get(parentId);
      profiles.set(parentId, {
        id: parentId,
        name: t.discovery?.providerParentName ?? "Organizer name unavailable",
        description: "",
        website: t.organizerUrl ?? null,
        ownerId: null,
        ...existing,
        kind: "organization",
      });
    }
    for (const kind of ["organization", "series"] as const) {
      const id =
        kind === "organization"
          ? t.discovery?.organizationId
          : t.discovery?.seriesId;
      if (!id || profiles.has(id)) continue;
      profiles.set(id, {
        id,
        kind,
        name:
          kind === "organization"
            ? (t.discovery?.organizationName ?? t.organizer ?? "Organizer name unavailable")
            : t.discovery?.seriesName ?? seriesName(t.name),
        description: "",
        website: kind === "organization" ? (t.organizerUrl ?? null) : null,
        ownerId: null,
      });
    }
  }
  return [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function discoveryFollowIds(userId: string): Promise<string[]> {
  try {
    return (
      await getDb()
        .select({ targetId: discoveryFollows.targetId })
        .from(discoveryFollows)
        .where(eq(discoveryFollows.userId, userId))
    ).map((f) => f.targetId);
  } catch {
    return [];
  }
}
