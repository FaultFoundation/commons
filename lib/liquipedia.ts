import type { ExternalTournamentDetail } from "@/lib/external-tournaments";

// ---------------------------------------------------------------------------
// Liquipedia portability (STRUCTURE ONLY — no UI/export yet).
//
// A future project will port our tournaments to Liquipedia. This module is the
// staging ground: it maps the data we already hold onto Liquipedia's
// `{{Infobox league}}` parameter names (the Overwatch Tournament Template — see
// https://liquipedia.net/overwatch/Liquipedia:Tournament_Template and the
// Notability Guidelines) and, just as importantly, records every parameter we
// CANNOT fill from our data so the gaps are visible before that project starts.
//
// It is intentionally NOT wired to any page or endpoint yet — `toLiquipediaInfobox`
// is a pure function over our detail shape, and nothing imports it in the UI.
// When the export project begins, the wikitext emitter and its surface (staff
// button / script) get built on top of this, and `LIQUIPEDIA_UNMAPPED` is the
// checklist of what still needs a source.
//
// Both tournament kinds map here: the fields below name where each value comes
// from for EXTERNAL (start.gg/FACEIT, the cen-sql projection) tournaments; an
// internal (Challonge) tournament fills the same params from its own row
// (`name`, `format` → `format`, `startsAt` → sdate, `maxParticipants` →
// team_number, `rulesUrl` → a link), so the same param vocabulary covers both.
// ---------------------------------------------------------------------------

/** A Liquipedia `{{Infobox league}}` parameter set — string values keyed by the
    template's own parameter names, ready for a future wikitext emitter. Only
    parameters we can source are present; the rest are listed in
    `LIQUIPEDIA_UNMAPPED` for a human/editor to complete. */
export type LiquipediaInfobox = {
  /** The filled `{{Infobox league}}` params, by their template names. */
  params: Record<string, string>;
  /** Template params we could not fill from this tournament's data, each with
      the reason — the porting checklist for this specific tournament. */
  missing: { param: string; reason: string }[];
};

/** Liquipedia link-param names keyed by our brand detection, so a tournament's
    `links`/contact/stream become the template's typed link params. */
const LINK_PARAM_BY_BRAND: Record<string, string> = {
  discord: "discord",
  twitch: "twitch",
  youtube: "youtube",
  facebook: "facebook",
  instagram: "instagram",
  twitter: "twitter",
};

/** Template params that our data model simply has no source for — editorial or
    provider-absent. This is the "note any missing parameters/fields" deliverable:
    a stable list a porting pass must fill by hand (or by extending the scraper).
    Per-tournament gaps (e.g. a specific event with no prize) are added at runtime
    by `toLiquipediaInfobox`. */
export const LIQUIPEDIA_UNMAPPED: { param: string; reason: string }[] = [
  {
    param: "liquipediatier",
    reason:
      "Editorial — Liquipedia assigns the tier (S/A/B/…); no provider field maps to it.",
  },
  {
    param: "liquipediatiertype",
    reason:
      "Editorial — Qualifier/Weekly/Showmatch classification is Liquipedia's, not the provider's.",
  },
  {
    param: "patch",
    reason: "Game patch/version is not collected by the scraper.",
  },
  {
    param: "type",
    reason:
      "Online vs Offline/LAN is not distinguished in our data (start.gg/FACEIT rarely expose it cleanly).",
  },
  {
    param: "venue",
    reason: "Physical venue is not collected (we store city/country only).",
  },
  {
    param: "series",
    reason:
      "Circuit/series grouping is not modelled — would need a manual mapping of tournament families.",
  },
  {
    param: "publishertier",
    reason: "Publisher-official status (e.g. OWCS) is editorial; not in our data.",
  },
  {
    param: "points",
    reason: "Circuit points system is editorial and series-specific.",
  },
  {
    param: "image / imagedark",
    reason:
      "We hold a hero banner_url (raster) rather than the SVG/logo Liquipedia infoboxes use; a raster can seed `image` but the ideal asset is missing.",
  },
];

/** Map a Liquipedia "game" key from our display game name. Liquipedia keys are
    short slugs ("ow" / "ow2"); we store a human name, so this is best-effort and
    a mismatch is reported as a gap by the caller. */
function liquipediaGameKey(game: string | null): string | null {
  if (!game) return null;
  const g = game.toLowerCase();
  if (g.includes("overwatch 2")) return "ow2";
  if (g.includes("overwatch")) return "ow";
  // Everything else: pass the display name through — a porting pass may need to
  // translate it to a Liquipedia wiki/game key.
  return game;
}

/** yyyy-mm-dd in UTC, the format Liquipedia date params expect. */
function isoDate(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

function brandOf(url: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "website";
  }
  if (host.includes("discord")) return "discord";
  if (host.includes("twitch")) return "twitch";
  if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
  if (host.includes("facebook") || host.includes("fb.")) return "facebook";
  if (host.includes("instagram")) return "instagram";
  if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter"))
    return "twitter";
  return "website";
}

/**
 * Map one external tournament onto Liquipedia `{{Infobox league}}` params, plus
 * the per-tournament list of params that couldn't be filled. Pure — safe to call
 * from anywhere; not yet used by any UI (see the file header).
 */
export function toLiquipediaInfobox(
  t: ExternalTournamentDetail,
): LiquipediaInfobox {
  const params: Record<string, string> = {};
  const missing: { param: string; reason: string }[] = [...LIQUIPEDIA_UNMAPPED];
  const set = (param: string, value: string | null | undefined) => {
    if (value != null && value !== "") params[param] = String(value);
  };
  const gap = (param: string, reason: string) => missing.push({ param, reason });

  set("name", t.name);

  const gameKey = liquipediaGameKey(t.game);
  set("game", gameKey);
  if (t.game && gameKey === t.game) {
    gap("game", `"${t.game}" has no known Liquipedia game key — verify the slug.`);
  } else if (!t.game) {
    gap("game", "No game recorded on this tournament.");
  }

  const sdate = isoDate(t.startAt);
  const edate = isoDate(t.endAt);
  set("sdate", sdate);
  set("edate", edate);
  if (!sdate && !edate) gap("date/sdate/edate", "No start or end date recorded.");

  // Prize pool: Liquipedia wants a numeric `prizepool` (+ `localcurrency`) or
  // `prizepoolusd`. We only hold a display string, so it seeds `prizepool` as-is
  // and is flagged for normalization.
  if (t.prizePool) {
    set("prizepool", t.prizePool);
    gap(
      "prizepool",
      `Stored as the display string "${t.prizePool}" — split into a numeric amount + currency for Liquipedia.`,
    );
  } else {
    gap("prizepool", "No structured prize pool (often lives in the About markdown).");
  }

  set("organizer", t.organizer);
  set("organizer-link", t.organizerUrl);
  if (!t.organizer) gap("organizer", "No organizer name recorded.");

  set("country", t.country);
  set("city", t.city);
  if (!t.country && !t.city) {
    gap("country/location", "No location recorded (typical for online events).");
  }

  // Entrant count → team_number or player_number depending on the entrant type.
  // Our standings carry an is-team flag; fall back to team_number when unknown.
  const anySolo = t.events.some((e) => e.standings.some((s) => !s.isTeam));
  if (t.numAttendees != null) {
    set(anySolo ? "player_number" : "team_number", String(t.numAttendees));
  } else {
    gap("team_number/player_number", "No entrant count recorded.");
  }

  // External tournaments carry no explicit bracket format string in the
  // projection (it's inferred from the bracket shape at render time).
  gap(
    "format",
    "Not stored for external tournaments — inferred from the bracket shape only. (Internal tournaments fill this from `format`.)",
  );

  // Typed link params from the tournament's own links + stream + contact.
  const linkSeen = new Set<string>();
  const addLink = (url: string | null) => {
    if (!url || linkSeen.has(url)) return;
    linkSeen.add(url);
    const brand = brandOf(url);
    const param = LINK_PARAM_BY_BRAND[brand] ?? "website";
    // Don't clobber an already-set typed link; keep the first.
    if (!(param in params)) params[param] = url;
  };
  for (const link of t.links) addLink(link.url);
  addLink(t.streamUrl);
  if (t.contact && /^https?:\/\//i.test(t.contact)) addLink(t.contact);

  return { params, missing };
}
