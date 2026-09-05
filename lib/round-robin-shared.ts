import {
  compareOrderKeys,
  entrantComponents,
  minOrderKey,
} from "@/lib/bracket-graph-shared";
import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";
import type { BracketSnapshot } from "@/lib/tournaments-shared";

// ---------------------------------------------------------------------------
// Round-robin normalisation — the FIRST concrete per-format view built on the
// tournament-format framework (lib/tournament-format.ts).
//
// The internal (Challonge snapshot) and external (cen-sql projection) data are
// very different shapes; both are flattened here into ONE plain, serialisable
// shape (RRGroup[]) that the client RoundRobinView renders. Same pattern as
// TopFinishers / RecentResults: a shared presentational view fed by per-source
// normalisers. Client-safe (`import type` only from the server modules), so the
// server pages call the builders and pass the result as props.
// ---------------------------------------------------------------------------

export type RREntrant = {
  /** Stable identity within the group (normalised name / participant id). */
  id: string;
  name: string;
  logoUrl: string | null;
};

export type RRMatch = {
  id: string;
  /** Round number (1-based). Round-robin rounds are just numbered. */
  round: number;
  /** Entrant ids for each side; "" for a bye/TBD slot. */
  aId: string;
  bId: string;
  /** Pre-formatted display scores ("2", "–"); never a raw/negative number. */
  aScore: string;
  bScore: string;
  /** Which side won, or null when undecided. */
  winner: "a" | "b" | null;
  state: "done" | "live" | "upcoming";
  /** Pre-formatted date/time ("Sep 4, 5:00 PM"); null when the match has none. */
  timeLabel: string | null;
  /** Deep link to the provider match page; null for internal / no link. */
  url: string | null;
};

export type RRGroup = {
  id: string;
  /** "Group A" for a multi-group stage; "" for a single group (the host then
      titles the bubble plainly, no group name). */
  label: string;
  entrants: RREntrant[];
  matches: RRMatch[];
};

export type RRStanding = {
  id: string;
  name: string;
  logoUrl: string | null;
  w: number;
  l: number;
  pts: number;
  /** Competition-ranked placement (ties share a place); 1-based. */
  placement: number;
};

/** Default to a dash whenever there's no real score — unplayed, TBD, or a
    forfeit/DQ side (negative) — never a blank cell. */
function scoreText(s: number | null): string {
  if (s == null || !Number.isFinite(s) || s < 0) return "–";
  return String(s);
}

/** Sum a Challonge scores_csv ("3-1,2-3,3-0") into set wins per side. Mirrors the
    internal BracketView so the matrix and the bracket agree on a score. */
function setWins(scores: string | null): [string, string] {
  if (!scores) return ["–", "–"];
  let a = 0;
  let b = 0;
  let any = false;
  for (const set of scores.split(",")) {
    const [x, y] = set.split("-").map((n) => Number(n.trim()));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      any = true;
      if (x > y) a += 1;
      else if (y > x) b += 1;
    }
  }
  return any ? [String(a), String(b)] : ["–", "–"];
}

/** A compact match time for the schedule/matrix — "Sep 4, 5:00 PM" in the org's
    ET zone (Intl picks EST/EDT), so a server-rendered label isn't a bare UTC one.
    Degrades to a plain date if a runtime lacks the zone database. */
function formatMatchTime(date: Date | null): string | null {
  if (!date) return null;
  try {
    return date
      .toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      })
      .replace(/ /g, " ");
  } catch {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

/** A round number for an external set: |roundOrder| when present, else the first
    integer in the round name ("Round 3" → 3), else a large fallback. */
function externalRound(m: ExternalTournamentMatch, fallback: number): number {
  if (typeof m.roundOrder === "number" && Number.isFinite(m.roundOrder)) {
    return Math.abs(m.roundOrder);
  }
  const fromName = m.round ? Number.parseInt(m.round.replace(/[^\d]/g, ""), 10) : NaN;
  return Number.isFinite(fromName) ? fromName : fallback;
}

function externalState(m: ExternalTournamentMatch): RRMatch["state"] {
  if (m.winner === 1 || m.winner === 2) return "done";
  switch (m.state?.trim().toLowerCase()) {
    case "2":
    case "active":
    case "ongoing":
    case "ready":
    case "live":
      return "live";
    default:
      return "upcoming";
  }
}

function sideId(name: string | null): string | null {
  const n = name?.trim();
  if (!n || /^tbd$/i.test(n)) return null;
  return n.toLowerCase();
}

function externalSides(
  m: ExternalTournamentMatch,
): [string | null, string | null] {
  return [sideId(m.entrant1Name), sideId(m.entrant2Name)];
}

/** A → "Group A", B → "Group B", … Z → "Group Z", then "Group 27" … */
function groupLetter(index: number): string {
  return index < 26
    ? `Group ${String.fromCharCode(65 + index)}`
    : `Group ${index + 1}`;
}

/** Split an event's matches into round-robin groups. Prefer the explicit
    phase-group columns; otherwise infer groups as connected components of the
    ENTRANT graph — a round-robin group is a clique disconnected from the others,
    which the feed graph can't see (RR sets don't feed each other). One group → no
    split. */
function externalRRGroups(
  matches: ExternalTournamentMatch[],
): { name: string | null; matches: ExternalTournamentMatch[] }[] {
  if (matches.some((m) => m.phaseGroupId != null)) {
    const byGroup = new Map<
      string,
      { order: number; name: string | null; matches: ExternalTournamentMatch[] }
    >();
    matches.forEach((m, index) => {
      const id = m.phaseGroupId ?? "__ungrouped__";
      let g = byGroup.get(id);
      if (!g) {
        g = {
          order: m.phaseGroupOrder ?? 1000 + index,
          name: m.phaseGroupName ?? null,
          matches: [],
        };
        byGroup.set(id, g);
      }
      g.matches.push(m);
    });
    return [...byGroup.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ name: g.name, matches: g.matches }));
  }
  const components = entrantComponents(matches, externalSides);
  if (components.length <= 1) return [{ name: null, matches }];
  return components
    .map((matches) => ({ matches, key: minOrderKey(matches) }))
    .sort((a, b) => compareOrderKeys(a.key, b.key))
    .map(({ matches }) => ({ name: null, matches }));
}

/** Build round-robin groups from the external projection. Flattens all events'
    matches (RR tournaments are single-event in practice), then groups them. */
export function rrGroupsFromExternal(
  events: ExternalTournamentDetail["events"],
): RRGroup[] {
  const all = events.flatMap((event) => event.matches);
  const groups = externalRRGroups(all);
  const multi = groups.length > 1;
  return groups.map((group, groupIndex) => {
    const entrants = new Map<string, RREntrant>();
    const remember = (name: string | null, logo: string | null) => {
      const id = sideId(name);
      if (!id) return;
      const existing = entrants.get(id);
      if (!existing) {
        entrants.set(id, { id, name: (name as string).trim(), logoUrl: logo });
      } else if (!existing.logoUrl && logo) {
        existing.logoUrl = logo;
      }
    };
    for (const m of group.matches) {
      remember(m.entrant1Name, m.entrant1LogoUrl);
      remember(m.entrant2Name, m.entrant2LogoUrl);
    }
    const matches: RRMatch[] = group.matches.map((m, index) => {
      const [a, b] = externalSides(m);
      return {
        id: m.id,
        round: externalRound(m, 900 + index),
        aId: a ?? "",
        bId: b ?? "",
        aScore: scoreText(m.entrant1Score),
        bScore: scoreText(m.entrant2Score),
        winner: m.winner === 1 ? "a" : m.winner === 2 ? "b" : null,
        state: externalState(m),
        timeLabel: formatMatchTime(m.scheduledAt),
        url: m.url,
      };
    });
    return {
      id: group.name ? `g-${group.name}` : `g-${groupIndex}`,
      label: multi ? group.name ?? groupLetter(groupIndex) : "",
      entrants: [...entrants.values()],
      matches,
    };
  });
}

/** Build a single round-robin group from a Challonge snapshot. The snapshot has
    no per-group split (Challonge "group stage" isn't in this shape yet) and no
    per-match time, so it is always one group with untimed matches. */
export function rrGroupsFromSnapshot(snapshot: BracketSnapshot): RRGroup[] {
  const entrants: RREntrant[] = [...snapshot.participants]
    .sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999))
    .map((p) => ({ id: p.id, name: p.name, logoUrl: p.logoUrl }));
  const matches: RRMatch[] = snapshot.matches.map((m) => {
    const [aScore, bScore] = setWins(m.scores);
    return {
      id: m.id,
      round: Math.abs(m.round),
      aId: m.player1Id ?? "",
      bId: m.player2Id ?? "",
      aScore,
      bScore,
      winner:
        m.winnerId && m.winnerId === m.player1Id
          ? "a"
          : m.winnerId && m.winnerId === m.player2Id
            ? "b"
            : null,
      // Challonge exposes no "in progress" state in the snapshot; "open" is the
      // currently-playable match, the closest signal to live.
      state:
        m.state === "complete" ? "done" : m.state === "open" ? "live" : "upcoming",
      timeLabel: null,
      url: null,
    };
  });
  return [{ id: "group", label: "", entrants, matches }];
}

/** The current round — the earliest round with a match not yet decided; the max
    round when every match is done (0 when there are none). Drives the graph's
    "next / second / rest" emphasis and the schedule ordering. */
export function currentRound(matches: RRMatch[]): number {
  let maxRound = 0;
  let current: number | null = null;
  for (const m of matches) {
    if (m.round > maxRound) maxRound = m.round;
    if (m.state !== "done" && (current == null || m.round < current)) {
      current = m.round;
    }
  }
  return current ?? maxRound;
}

/** W–L record + points (match wins) per entrant, competition-ranked (ties share
    a place). Sort: wins desc, losses asc, then the entrants' given order (seed)
    as a stable tiebreak — this is the standings the Standings tab shows for RR. */
export function computeRRStandings(
  entrants: RREntrant[],
  matches: RRMatch[],
): RRStanding[] {
  const rec = new Map<string, { w: number; l: number }>();
  for (const e of entrants) rec.set(e.id, { w: 0, l: 0 });
  for (const m of matches) {
    if (m.winner == null) continue;
    const winnerId = m.winner === "a" ? m.aId : m.bId;
    const loserId = m.winner === "a" ? m.bId : m.aId;
    const won = rec.get(winnerId);
    if (won) won.w += 1;
    const lost = rec.get(loserId);
    if (lost) lost.l += 1;
  }
  const order = new Map(entrants.map((e, i) => [e.id, i]));
  const sorted = [...entrants].sort((a, b) => {
    const ra = rec.get(a.id) ?? { w: 0, l: 0 };
    const rb = rec.get(b.id) ?? { w: 0, l: 0 };
    if (rb.w !== ra.w) return rb.w - ra.w;
    if (ra.l !== rb.l) return ra.l - rb.l;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  const rows: RRStanding[] = [];
  let placement = 0;
  let prevKey: string | null = null;
  sorted.forEach((e, index) => {
    const r = rec.get(e.id) ?? { w: 0, l: 0 };
    const key = `${r.w}-${r.l}`;
    if (key !== prevKey) placement = index + 1;
    prevKey = key;
    rows.push({ id: e.id, name: e.name, logoUrl: e.logoUrl, w: r.w, l: r.l, pts: r.w, placement });
  });
  return rows;
}
