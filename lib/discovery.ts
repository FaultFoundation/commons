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
    const key = d.organizationId
      ? `${d.organizationId}|${t.game ?? "unknown"}|${seriesName(t.name).toLowerCase()}`
      : null;
    if (key) {
      const group = candidates.get(key) ?? [];
      group.push(t);
      candidates.set(key, group);
    }
    return { ...t, discovery: d, candidateKey: key };
  });
  return enriched.map(({ candidateKey, ...t }) => {
    if (candidateKey) {
      const group = candidates.get(candidateKey)!;
      // A named league/season can stand alone; recurrence needs at least two
      // tournaments AND an explicit installment marker, not merely equal names.
      if (
        /\b(?:league|season|series)\b/i.test(t.name) ||
        (group.length > 1 && group.some((x) => seriesName(x.name) !== x.name))
      ) {
        t.discovery.seriesId = discoveryId("series", candidateKey);
        t.discovery.reasons.push(
          "Series inferred from source organizer, game and title; season/division preserved",
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
      (t.discovery.seriesId?.startsWith("series:tournament:") ? t.name : seriesName(t.name));
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
