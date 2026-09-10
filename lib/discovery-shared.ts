import { inferAudience } from "@/lib/discovery-audience";

/** Pure discovery rules. Unknown is a first-class value, never "not collegiate". */
export type DiscoveryFacts = {
  audience: "collegiate" | "open" | "unknown";
  venue: "online" | "in-person" | "hybrid" | "unknown";
  competition: "league" | "tournament" | "unknown";
  organizationId: string | null;
  seriesId: string | null;
  featured: boolean;
};
export type DiscoveryMetadata = DiscoveryFacts & {
  organizationName?: string;
  seriesName?: string;
  reasons: string[];
  reviewed: boolean;
};
export type DiscoverySource = {
  id: string;
  name: string;
  source?: string | null;
  game?: string | null;
  academicVerificationRequired?: boolean;
  description?: string | null;
  organizer?: string | null;
  organizerUrl?: string | null;
  startsAt: number | null;
  sourceStartsAt?: number | null;
  endsAt?: number | null;
  country?: string | null;
  city?: string | null;
  featured: boolean;
};
export type DiscoveryProfile = {
  id: string;
  kind: "organization" | "series";
  name: string;
  description: string;
  website: string | null;
  ownerId: string | null;
};
export function safeWebsite(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function organizerIdentity(t: DiscoverySource): string | null {
  const url = safeWebsite(t.organizerUrl);
  if (!url) return null;
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  return `${t.source ?? "commons"}:${u.href.replace(/\/$/, "")}`;
}
// Reversible URL-safe ids retain the whole key; no lossy hash or acronym merge.
export function discoveryId(
  kind: "organization" | "series",
  key: string,
): string {
  return `${kind}:${key}`;
}
export function profilePath(id: string): string {
  return `/tournaments/discovery/${encodeURIComponent(id)}/`;
}
export function seriesName(name: string): string {
  // Keep game numbers, season/year and division intact. Only explicit installment
  // markers and trailing stages are removed; "Open"/"Championship" are brands too.
  return name
    .replace(/\s*(?:[-–—|:]\s*)?(?:week|wk|round|day)\s*#?\d+\b/gi, "")
    .replace(/\s*(?:#\d+|\(\d+\))\s*$/g, "")
    .replace(
      /\s*[-–—|:]\s*(?:(?:regional|grand)\s+)?(?:playoffs?|finals?|qualifier(?:s)?(?:\s*#?\d+)?|group stage)\s*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Every LeagueOS tournament carries its authoritative parent league id.
 * League membership spans games, divisions and seasons; titles and dates describe
 * the children, not the identity of their parent. */
export function leagueosSeries(t: DiscoverySource & { sourceTournamentId?: string | null }):
  { id: string; name: string } | null {
  if (t.source !== "leagueos") return null;
  const identity = /^([a-z0-9]+):[a-z0-9]+$/i.exec(t.sourceTournamentId ?? "");
  if (!identity) return null;
  return {
    id: discoveryId("series", `leagueos:${identity[1]}`),
    name: t.organizer?.trim() || `LeagueOS league ${identity[1]}`,
  };
}

/** Provider-scoped parent membership, deliberately independent of seasons and
 * title similarity. Owner/community groups are broad catalogs, not proof that
 * every child belongs to the same competitive season. */
export function providerParentSeries(t: DiscoverySource & {
  sourceTournamentId?: string | null;
  externalUrl?: string | null;
}): { id: string; name: string; reason: string } | null {
  const league = leagueosSeries(t);
  if (league) return { ...league, reason: "LeagueOS parent league identity links tournaments across games, divisions and seasons" };
  const raw = t.source === "startgg" || t.source === "faceit"
    ? t.organizerUrl : (!t.source || t.source === "challonge") ? t.externalUrl : null;
  const safe = safeWebsite(raw);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.port) return null;
  let key: string | undefined;
  let label: string | undefined;
  if (t.source === "startgg" && ["start.gg", "www.start.gg"].includes(url.hostname)) {
    const match = /^\/user\/([a-zA-Z0-9_-]+)\/?$/.exec(url.pathname);
    if (match) { key = `startgg:owner:${match[1]}`; label = `start.gg organizer ${match[1]}`; }
  } else if (t.source === "faceit" && ["faceit.com", "www.faceit.com"].includes(url.hostname)) {
    const match = /^\/(?:[a-z]{2}\/)?organizers\/([a-zA-Z0-9_-]+)(?:\/[^/]+)?\/?$/.exec(url.pathname);
    if (match && match[1] !== "faceit") { key = `faceit:organizer:${match[1]}`; label = `FACEIT organizer ${match[1]}`; }
  } else if (!t.source || t.source === "challonge") {
    const match = /^([a-z0-9-]+)\.challonge\.com$/.exec(url.hostname);
    if (match && !["www", "api", "connect", "community", "kb", "feedback", "blog", "feedback2", "support"].includes(match[1])) {
      key = `challonge:community:${match[1]}`; label = match[1];
    }
  }
  return key ? { id: discoveryId("series", key), name: t.organizer?.trim() || label!,
    reason: "Shared provider owner or community identity links tournaments across games and seasons" } : null;
}

export function isProviderParentSeriesId(id: string): boolean {
  return /^series:(?:leagueos:[a-z0-9]+|startgg:owner:[a-zA-Z0-9_-]+|faceit:organizer:[a-zA-Z0-9_-]+|challonge:community:[a-z0-9-]+)$/.test(id);
}
export function inferFacts(t: DiscoverySource): DiscoveryMetadata {
  const text = `${t.name}\n${(t.description ?? "").slice(0, 20000)}`;
  const audience = inferAudience(t);
  const online =
    /\b(?:online[- ]only|online (?:tournament|event|league|competition)|(?:venue|location|format)\s*:\s*online)\b/i.test(
      text,
    );
  const physical =
    /\b(?:in[- ]person|LAN (?:finals?|events?|tournaments?))/i.test(
      text,
    );
  const hybrid = /\bhybrid\b/i.test(text) || (online && physical);
  const league = /\b(?:league|conference)\b/i.test(t.name);
  return {
    audience: audience.audience,
    venue: hybrid
      ? "hybrid"
      : online
        ? "online"
        : physical
          ? "in-person"
          : "unknown",
    competition: league ? "league" : "unknown",
    organizationId: null,
    seriesId: null,
    featured: t.featured,
    reviewed: false,
    reasons: [
      ...audience.reasons,
      league && "League wording in title",
      (online || physical || hybrid) && "Venue wording in source",
    ].filter((v): v is string => Boolean(v)),
  };
}
export function validFacts(value: unknown): value is DiscoveryFacts {
  if (!value || typeof value !== "object") return false;
  const v = value as DiscoveryFacts;
  return (
    ["collegiate", "open", "unknown"].includes(v.audience) &&
    ["online", "in-person", "hybrid", "unknown"].includes(v.venue) &&
    ["league", "tournament", "unknown"].includes(v.competition) &&
    typeof v.featured === "boolean" &&
    [v.organizationId, v.seriesId].every(
      (id) => id === null || (typeof id === "string" && id.length <= 2000),
    )
  );
}
export type DiscoveryFilters = {
  query: string;
  audience: string;
  venue: string;
  competition: string;
  source: string;
  country: string;
  registration: string;
  days: string;
  following: boolean;
};
/**
 * Platforms the tournament list can filter by, and their labels — one list, so
 * the popover's switches and the validator below cannot drift.
 *
 * **Discord is deliberately absent.** Discord-sourced tournaments never reach
 * the general list (`withoutDiscordSourced` in lib/tournaments-shared.ts keeps
 * them to the Series tab), so the facet could only ever return an empty page.
 */
export const DISCOVERY_SOURCE_FILTERS: { value: string; label: string }[] = [
  { value: "startgg", label: "start.gg" },
  { value: "faceit", label: "FACEIT" },
  { value: "challonge", label: "Challonge" },
];

export const EMPTY_FILTERS: DiscoveryFilters = {
  query: "",
  audience: "",
  venue: "",
  competition: "",
  source: "",
  country: "",
  registration: "",
  days: "",
  following: false,
};
/**
 * Revive a persisted (or otherwise untrusted) filter blob into a known-good set.
 * Unknown keys are dropped and a wrong-typed or oversized field falls back to
 * its empty value, so a stale shape in a member's browser can never smuggle
 * anything unexpected into `matchesDiscovery`.
 */
export function asDiscoveryFilters(raw: unknown): DiscoveryFilters {
  if (!raw || typeof raw !== "object") return { ...EMPTY_FILTERS };
  const v = raw as Record<string, unknown>;
  const str = (key: keyof DiscoveryFilters): string => {
    const value = v[key];
    return typeof value === "string" && value.length <= 200 ? value : "";
  };
  // `source` is checked against the offered platforms rather than merely
  // type-checked: a filter persisted while "Discord" was still on offer would
  // otherwise strand its owner on a permanently empty list, with no switch left
  // in the popover to turn it back off.
  const source = str("source");
  return {
    query: str("query"),
    audience: str("audience"),
    venue: str("venue"),
    competition: str("competition"),
    source: DISCOVERY_SOURCE_FILTERS.some((o) => o.value === source)
      ? source
      : "",
    country: str("country"),
    registration: str("registration"),
    days: str("days"),
    following: v.following === true,
  };
}
export function matchesDiscovery(
  t: DiscoverySource & {
    discovery?: DiscoveryMetadata;
    registrationClosesAt?: number | null;
  },
  f: DiscoveryFilters,
  follows: string[],
  now: number,
): boolean {
  const d = t.discovery ?? inferFacts(t);
  if (
    f.query &&
    !`${t.name} ${t.organizer ?? ""} ${t.game ?? ""}`
      .toLowerCase()
      .includes(f.query.toLowerCase())
  )
    return false;
  if (f.audience && d.audience !== f.audience) return false;
  if (f.venue && d.venue !== f.venue) return false;
  // The Type switch sends "league" | "tournament"; "tournament" means "anything
  // that isn't a league" so inferred (unknown-competition) events still show.
  // "series" (kept for completeness) means "belongs to a series".
  if (f.competition === "series") {
    if (!d.seriesId) return false;
  } else if (f.competition === "league") {
    if (d.competition !== "league") return false;
  } else if (f.competition === "tournament") {
    if (d.competition === "league") return false;
  }
  if (f.source && (t.source ?? "challonge") !== f.source) return false;
  if (f.country && t.country !== f.country) return false;
  if (
    f.registration &&
    !(
      t.registrationClosesAt &&
      t.registrationClosesAt > now &&
      t.registrationClosesAt <= now + 72 * 3600000
    )
  )
    return false;
  if (
    f.days &&
    !(
      t.startsAt &&
      t.startsAt <= now + Number(f.days) * 86400000 &&
      (t.endsAt ?? t.startsAt) >= now
    )
  )
    return false;
  if (
    f.following &&
    ![d.organizationId, d.seriesId].some((id) => id && follows.includes(id))
  )
    return false;
  return true;
}
export function discoveryScore(
  t: {
    discovery?: DiscoveryMetadata;
    featured: boolean;
    status: string;
    registrationClosesAt?: number | null;
  },
  now: number,
): number {
  return (
    ((t.discovery?.featured ?? t.featured) ? 1000 : 0) +
    (t.discovery?.audience === "collegiate" ? 100 : 0) +
    (t.discovery?.competition === "league" ? 20 : 0) +
    (t.discovery?.seriesId ? 10 : 0) +
    (t.status === "active" ? 5 : 0) +
    (t.registrationClosesAt &&
    t.registrationClosesAt > now &&
    t.registrationClosesAt < now + 72 * 3600000
      ? 15
      : 0)
  );
}
