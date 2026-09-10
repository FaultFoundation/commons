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
  leagueosSeries,
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
  return enriched.map(({ candidateKey, tournamentKey, ...t }) => {
    const linkedSeries = leagueosSeries(t);
    if (linkedSeries) {
      t.discovery.seriesId = linkedSeries.id;
      t.discovery.reasons.push("LeagueOS league identity and explicit season title link games and divisions");
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
    if (!t.discovery.seriesId && candidateKey) {
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
    if (!t.discovery.seriesId && /\b(?:league|season|series)\b/i.test(t.name)) {
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
    t.discovery.organizationName =
      overlay.profiles.find((p) => p.id === t.discovery.organizationId)?.name ??
      t.organizer ??
      undefined;
    t.discovery.seriesName =
      overlay.profiles.find((p) => p.id === t.discovery.seriesId)?.name ??
      (linkedSeries?.id === t.discovery.seriesId ? linkedSeries?.name : undefined) ??
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
            ? (t.organizer ?? "Unconfirmed Organization")
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
