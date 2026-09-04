import { Fragment, type ReactNode } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { sourceKey } from "@/components/brand/SourceLogo";
import { AboutLayout } from "@/components/dashboard/tournaments/AboutLayout";
import { ExternalBracket } from "@/components/dashboard/tournaments/ExternalBracket";
import { Markdown } from "@/components/dashboard/tournaments/Markdown";
import { ExternalTournamentRefresh } from "@/components/dashboard/tournaments/ExternalTournamentRefresh";
import { ShareBar } from "@/components/dashboard/tournaments/ShareBar";
import {
  TournamentChrome,
  type TournamentTab,
} from "@/components/dashboard/tournaments/TournamentChrome";
import { TopFinishers } from "@/components/dashboard/tournaments/TopFinishers";
import { BracketWithSidebar } from "@/components/dashboard/tournaments/BracketWithSidebar";
import type {
  FinisherEntry,
  ResultRow,
} from "@/components/dashboard/tournaments/tournament-view-shared";
import { TOURNAMENT_STATUS_LABELS } from "@/lib/tournaments-shared";
import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";

// The branded Commons view for an external (start.gg / FACEIT) tournament,
// rendered entirely from the cen-sql projection. The hero (banner behind the
// title, then a meta row and the tournament's own known-links) is always
// visible; everything else lives in in-page tabs (Overview / Bracket /
// Standings / Rules) via TournamentChrome — the same shell the internal
// Challonge view uses, so the two are visually identical. It never calls a
// provider itself; freshness comes from the scraper's projection (and, layered
// on top, the on-demand refresh in ExternalTournamentRefresh).

const SOURCE_LABELS: Record<string, string> = {
  startgg: "start.gg",
  faceit: "FACEIT",
  challonge: "Challonge",
  commons: "The Fault Foundation",
};

function statusLabel(status: string): string {
  return (
    TOURNAMENT_STATUS_LABELS[status as keyof typeof TOURNAMENT_STATUS_LABELS] ??
    status
  );
}

function formatDateTime(date: Date | null): string | null {
  return date
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
}

/** The Recent Results corner stamp — "Sep 4, 2026, @ 5:00 pm EST".
    Deliberately pinned to the org's zone (Intl picks EST/EDT itself) rather
    than left to the Worker's UTC: this is server-rendered like every other date
    here (see ScheduleView's note), and a bare clock time with no zone on it is
    worse than one labelled in the zone the org actually schedules in. Degrades
    to a plain date if a runtime ever lacks the zone database. */
const RESULT_TIME_ZONE = "America/New_York";

function formatResultDateTime(date: Date | null): string | null {
  if (!date) return null;
  try {
    const day = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: RESULT_TIME_ZONE,
    });
    const time = date
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: RESULT_TIME_ZONE,
        timeZoneName: "short",
      })
      .replace(/\bAM\b/, "am")
      .replace(/\bPM\b/, "pm");
    return `${day}, @ ${time}`;
  } catch {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
}

/** A compact human range for the header — "Aug 30 – 31, 2026", collapsing a
    shared month/year. Falls back to a single date, or null when there's none. */
function formatDateRange(start: Date | null, end: Date | null): string | null {
  if (!start && !end) return null;
  if (start && !end) {
    return start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (!start && end) {
    return end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const s = start as Date;
  const e = end as Date;
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const left = s.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = sameMonth
    ? `${e.getDate()}, ${e.getFullYear()}`
    : e.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  return `${left} – ${right}`;
}

/** True when the whole blurb is just a single URL (no prose around it). */
function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Default to a dash whenever there's no real score to show — unplayed, TBD, or
    a forfeit/DQ side (negative) — never a blank cell. */
function scoreText(s: number | null): string {
  if (s == null || !Number.isFinite(s) || s < 0) return "–";
  return String(s);
}

/** Render an organizer contact by its type — an email as a mailto, a URL as a
    labelled external link, anything else as plain text. */
function contactNode(contact: string, contactType: string | null): ReactNode {
  const type = contactType?.trim().toLowerCase() ?? "";
  if (type === "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return <a href={`mailto:${contact}`}>{contact}</a>;
  }
  if (/^https?:\/\//i.test(contact)) {
    const label =
      type === "discord"
        ? "Discord ↗"
        : type === "twitter"
          ? "Twitter / X ↗"
          : type
            ? `${type[0].toUpperCase()}${type.slice(1)} ↗`
            : "Website ↗";
    return (
      <a href={contact} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
    );
  }
  return contact;
}

/** The event we read placements from — the one with the most standings (a
    multi-event tournament's main event); null when none are placed yet. */
function primaryStandingsEvent(
  events: ExternalTournamentDetail["events"],
): ExternalTournamentDetail["events"][number] | null {
  const withStandings = events.filter((e) =>
    e.standings.some((standing) => standing.placement != null),
  );
  if (withStandings.length === 0) return null;
  return withStandings.sort((a, b) => b.standings.length - a.standings.length)[0];
}

function buildFinishers(events: ExternalTournamentDetail["events"]): FinisherEntry[] {
  const event = primaryStandingsEvent(events);
  if (!event) return [];
  return event.standings
    .filter((s) => s.placement != null && s.placement >= 1 && s.placement <= 3)
    .map((s) => ({
      place: s.placement as number,
      name: s.entrantName,
      logoUrl: s.entrantLogoUrl,
    }));
}

/** Decided matches, most recent first (finals first when untimed) — for the
    bracket-tab Recent Results sidebar. */
function buildRecentResults(events: ExternalTournamentDetail["events"]): ResultRow[] {
  const scored: { row: ResultRow; time: number | null; order: number }[] = [];
  for (const event of events) {
    for (const m of event.matches) {
      if (m.winner == null) continue;
      scored.push({
        time: m.scheduledAt?.getTime() ?? null,
        order: m.roundOrder == null ? 0 : Math.abs(m.roundOrder),
        row: {
          id: m.id,
          round: m.round,
          dateLabel: formatResultDateTime(m.scheduledAt),
          a: {
            name: m.entrant1Name ?? "TBD",
            logoUrl: m.entrant1LogoUrl,
            score: scoreText(m.entrant1Score),
            winner: m.winner === 1,
          },
          b: {
            name: m.entrant2Name ?? "TBD",
            logoUrl: m.entrant2LogoUrl,
            score: scoreText(m.entrant2Score),
            winner: m.winner === 2,
          },
          url: m.url,
        },
      });
    }
  }
  scored.sort(
    (a, b) => (b.time ?? -Infinity) - (a.time ?? -Infinity) || b.order - a.order,
  );
  return scored.slice(0, 50).map((s) => s.row);
}

type DerivedStanding = {
  entrantName: string;
  entrantLogoUrl: string | null;
  placement: number;
};

type DerivedPool = {
  id: string;
  label: string;
  order: number;
  standings: DerivedStanding[];
};

/** Bracket-derived placements when the projection carries no `ext_standings`.
    A plain event is `single` (one ranking); a pool stage is `pools` (one ranking
    per pool, e.g. an Open Qualifier's A1–A4). */
type DerivedResults =
  | { kind: "single"; standings: DerivedStanding[] }
  | { kind: "pools"; pools: DerivedPool[] };

/** Until the scraper collects start.gg's real progression (how many advance per
    pool), a pool's "advancing" entrants default to its winner — the one result
    we can always derive with certainty. Swap for the collected count later. */
const POOL_ADVANCE_DEFAULT = 1;

/**
 * Rank ONE connected bracket's entrants from its decided matches — champion +
 * runner-up from the highest winners-side match (the grand final / final), then
 * the rest by elimination stage (a later losers-bracket exit places higher),
 * ties shared. Null when it isn't a rankable bracket (too few matches / no
 * final). Identity is by entrant name (byes/TBD are skipped).
 */
function rankBracket(
  matches: ExternalTournamentMatch[],
): DerivedStanding[] | null {
  const decided = matches.filter((m) => m.winner === 1 || m.winner === 2);
  if (decided.length < 1) return null;

  type Rec = { name: string; logo: string | null; losses: number[] };
  const byName = new Map<string, Rec>();
  const rec = (name: string, logo: string | null): Rec => {
    let r = byName.get(name);
    if (!r) {
      r = { name, logo, losses: [] };
      byName.set(name, r);
    }
    if (!r.logo && logo) r.logo = logo;
    return r;
  };

  let final: { winner: string; loser: string; order: number } | null = null;
  for (const m of decided) {
    const n1 = m.entrant1Name?.trim();
    const n2 = m.entrant2Name?.trim();
    if (!n1 || !n2 || /^tbd$/i.test(n1) || /^tbd$/i.test(n2)) continue;
    const winnerName = m.winner === 1 ? n1 : n2;
    const loserName = m.winner === 1 ? n2 : n1;
    const winnerLogo = m.winner === 1 ? m.entrant1LogoUrl : m.entrant2LogoUrl;
    const loserLogo = m.winner === 1 ? m.entrant2LogoUrl : m.entrant1LogoUrl;
    rec(winnerName, winnerLogo);
    rec(loserName, loserLogo).losses.push(m.roundOrder ?? 0);
    const ro = m.roundOrder ?? 0;
    if (ro >= 0 && (!final || ro > final.order)) {
      final = { winner: winnerName, loser: loserName, order: ro };
    }
  }
  if (!final || byName.size < 2) return null;

  const hasLosers = decided.some((m) => (m.roundOrder ?? 0) < 0);
  const placed: DerivedStanding[] = [];
  const seen = new Set<string>();
  const push = (name: string, placement: number) => {
    if (seen.has(name)) return;
    const r = byName.get(name);
    if (!r) return;
    seen.add(name);
    placed.push({ entrantName: r.name, entrantLogoUrl: r.logo, placement });
  };
  push(final.winner, 1);
  push(final.loser, 2);

  const elimValue = (r: Rec): number => {
    const losers = r.losses.filter((o) => o < 0);
    const pool = hasLosers && losers.length ? losers : r.losses;
    return pool.reduce((max, o) => Math.max(max, Math.abs(o)), 0);
  };
  const rest = [...byName.values()]
    .filter((r) => !seen.has(r.name))
    .sort((a, b) => elimValue(b) - elimValue(a));

  let place = placed.length + 1;
  let prev: number | null = null;
  let groupSize = 0;
  for (const r of rest) {
    const v = elimValue(r);
    if (prev !== null && v !== prev) {
      place += groupSize;
      groupSize = 0;
    }
    push(r.name, place);
    groupSize += 1;
    prev = v;
  }
  return placed;
}

/** Natural order for start.gg set identifiers ("A".."Z".."AA"): shorter first,
    then lexical; null last. (Mirrors ExternalBracket.) */
function compareOrderKeys(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

/** Weakly-connected components of the feed graph — disjoint pools share no
    prereq edges, so each pool falls out as its own component. Mirrors
    ExternalBracket's pool inference so the derived standings split into exactly
    the pools the bracket tabs show, even when `phaseGroupId` is absent (the
    common case: the scraper often lands the CRL-style qualifiers with prereq
    edges but no phase-group labels). */
function connectedComponents(
  matches: ExternalTournamentMatch[],
): ExternalTournamentMatch[][] {
  const indexById = new Map<string, number>();
  matches.forEach((m, i) => indexById.set(m.sourceMatchId, i));
  const parent = matches.map((_, i) => i);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    while (parent[x] !== root) {
      const next = parent[x];
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  matches.forEach((m, i) => {
    for (const feeder of [m.prereq1Id, m.prereq2Id]) {
      if (!feeder) continue;
      const j = indexById.get(feeder);
      if (j != null) union(i, j);
    }
  });
  const byRoot = new Map<number, ExternalTournamentMatch[]>();
  matches.forEach((m, i) => {
    const root = find(i);
    const list = byRoot.get(root) ?? [];
    list.push(m);
    byRoot.set(root, list);
  });
  return [...byRoot.values()];
}

/** Smallest bracket-position key across a set — orders inferred pools left→right
    in seed order (like the bracket tabs). */
function minOrderKey(matches: ExternalTournamentMatch[]): string | null {
  let best: string | null = null;
  let seen = false;
  for (const m of matches) {
    if (!seen) {
      best = m.orderKey;
      seen = true;
    } else if (compareOrderKeys(m.orderKey, best) < 0) {
      best = m.orderKey;
    }
  }
  return best;
}

/**
 * Derive placements from a COMPLETED bracket when the projection carries no
 * placed standings (bracket tournaments routinely land matches but no
 * `ext_standings`). A single bracket ranks as one list; a multi-pool stage
 * (A1–A4) ranks EACH pool on its own — there's no single champion, so the
 * Overview shows the pool winners, sorted by pool. Pools are split the SAME way
 * the bracket view does: prefer explicit `phaseGroupId`, else infer them as
 * connected components of the feed graph.
 */
function deriveBracketResults(
  events: ExternalTournamentDetail["events"],
  status: string,
): DerivedResults | null {
  if (status !== "completed") return null;
  const all = events
    .flatMap((e) => e.matches)
    .filter((m) => m.winner === 1 || m.winner === 2);
  if (all.length < 2) return null;

  type Group = {
    id: string;
    label: string;
    order: number;
    matches: ExternalTournamentMatch[];
  };
  let groups: Group[];
  if (all.some((m) => m.phaseGroupId)) {
    const byGroup = new Map<
      string,
      { order: number; name: string | null; matches: ExternalTournamentMatch[] }
    >();
    all.forEach((m, index) => {
      const id = m.phaseGroupId ?? "__none__";
      let g = byGroup.get(id);
      if (!g) {
        g = {
          order: m.phaseGroupOrder ?? 1000 + index,
          name: m.phaseGroupName,
          matches: [],
        };
        byGroup.set(id, g);
      }
      g.matches.push(m);
    });
    groups = [...byGroup.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, g], index) => ({
        id,
        label: g.name ? `Pool ${g.name}` : `Pool ${index + 1}`,
        order: g.order,
        matches: g.matches,
      }));
  } else {
    groups = connectedComponents(all)
      .map((c) => ({ c, key: minOrderKey(c) }))
      .sort((a, b) => compareOrderKeys(a.key, b.key))
      .map(({ c }, index) => ({
        id: `pool-${index}`,
        label: `Pool ${index + 1}`,
        order: index,
        matches: c,
      }));
  }

  if (groups.length <= 1) {
    const standings = rankBracket(groups[0]?.matches ?? all);
    return standings ? { kind: "single", standings } : null;
  }

  const pools: DerivedPool[] = groups.flatMap((g) => {
    const standings = rankBracket(g.matches);
    return standings && standings.length
      ? [{ id: g.id, label: g.label, order: g.order, standings }]
      : [];
  });
  return pools.length ? { kind: "pools", pools } : null;
}

/** A derived-standings table (single bracket or one pool). `advanceCount`, when
    set, tags the top-N rows as advancing. */
function DerivedStandingsTable({
  standings,
  showPlace,
  advanceCount,
}: {
  standings: DerivedStanding[];
  showPlace: boolean;
  advanceCount?: number;
}) {
  return (
    <div className="ff-ticket-table-wrap">
      <table className="ff-ticket-table">
        <thead>
          <tr>
            {showPlace ? <th scope="col">Place</th> : null}
            <th scope="col">Entrant</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, index) => {
            const advancing = advanceCount != null && s.placement <= advanceCount;
            return (
              <tr key={`${s.entrantName}-${index}`}>
                {showPlace ? <td>{s.placement}</td> : null}
                <td className="ff-ticket-subject">
                  <span className="ff-ext-entrant">
                    {s.entrantLogoUrl ? (
                      <img
                        className="ff-ext-entrant__logo"
                        src={s.entrantLogoUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                    <span>{s.entrantName}</span>
                    {advancing ? (
                      <span className="ff-ext-adv">Advancing</span>
                    ) : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The Overview finishers row from derived results: top-3 for a single bracket,
    or each pool's advancing entrant(s) (labelled by pool) for a pool stage. */
function finishersFromDerived(derived: DerivedResults | null): FinisherEntry[] {
  if (!derived) return [];
  if (derived.kind === "single") {
    return derived.standings
      .filter((s) => s.placement >= 1 && s.placement <= 3)
      .map((s) => ({
        place: s.placement,
        name: s.entrantName,
        logoUrl: s.entrantLogoUrl,
      }));
  }
  return derived.pools.flatMap((pool) =>
    pool.standings.slice(0, POOL_ADVANCE_DEFAULT).map((s) => ({
      place: s.placement,
      name: s.entrantName,
      logoUrl: s.entrantLogoUrl,
      poolLabel: pool.label,
    })),
  );
}

export function ExternalTournamentView({
  tournament,
  shareUrl,
  shareMessage,
}: {
  tournament: ExternalTournamentDetail;
  /** Absolute Commons URL for this tournament, for the ShareBar (same share
      affordance the internal tournament view uses). */
  shareUrl: string;
  shareMessage: string;
}) {
  const live =
    tournament.status === "registration" || tournament.status === "active";
  const source = sourceKey(tournament.source);
  const sourceLabel = SOURCE_LABELS[source] ?? tournament.source;
  const dateRange = formatDateRange(tournament.startAt, tournament.endAt);
  const multiEvent = tournament.events.length > 1;

  const totalStandings = tournament.events.reduce(
    (sum, event) => sum + event.standings.length,
    0,
  );
  const hasPlacedStandings = tournament.events.some((event) =>
    event.standings.some((standing) => standing.placement != null),
  );

  // When the projection carries placed standings, use them; otherwise derive
  // them from the completed bracket. Attendee rows have null placements and do
  // not suppress this fallback. A pool stage derives one ranking per pool.
  const derived =
    !hasPlacedStandings
      ? deriveBracketResults(tournament.events, tournament.status)
      : null;
  const finishers: FinisherEntry[] =
    hasPlacedStandings
      ? buildFinishers(tournament.events)
      : finishersFromDerived(derived);
  const recentResults = buildRecentResults(tournament.events);
  const derivedHasStandings =
    derived != null &&
    (derived.kind === "single"
      ? derived.standings.length > 0
      : derived.pools.length > 0);
  const hasDisplayedPlacements = hasPlacedStandings || derivedHasStandings;

  // Overview "About": the provider's own prose/widget layout, plus a details
  // panel of structured facts. `prose` is a genuine blurb (FACEIT, or a start.gg
  // organizer who wrote one); a lone URL becomes the "Rules" tab instead.
  const hasLayout = tournament.aboutLayout.length > 0;
  const description = tournament.description?.trim() ?? "";
  const prose = description && !isBareUrl(description) ? description : "";
  const rulesUrl = description && isBareUrl(description) ? description : null;
  const hasAbout = hasLayout || Boolean(prose);

  const location = [tournament.city, tournament.country]
    .filter(Boolean)
    .join(", ");
  const details: { label: string; node: ReactNode }[] = [];
  if (tournament.game) details.push({ label: "Game", node: tournament.game });
  if (location) details.push({ label: "Location", node: location });
  const startsAt = formatDateTime(tournament.startAt);
  if (startsAt) details.push({ label: "Starts", node: startsAt });
  const endsAt = formatDateTime(tournament.endAt);
  if (endsAt) details.push({ label: "Ends", node: endsAt });
  if (tournament.numAttendees != null) {
    details.push({ label: "Entrants", node: String(tournament.numAttendees) });
  }
  const closesAt = tournament.registrationClosesAt;
  if (closesAt && closesAt.getTime() > Date.now()) {
    const closesLabel = formatDateTime(closesAt);
    if (closesLabel) {
      details.push({ label: "Registration closes", node: closesLabel });
    }
  }
  if (tournament.streamUrl) {
    details.push({
      label: "Stream",
      node: (
        <a href={tournament.streamUrl} target="_blank" rel="noreferrer noopener">
          Watch live ↗
        </a>
      ),
    });
  }
  if (tournament.contact) {
    details.push({
      label: "Contact",
      node: contactNode(tournament.contact, tournament.contactType),
    });
  }
  if (tournament.prizePool) {
    details.push({ label: "Prize pool", node: tournament.prizePool });
  }
  if (tournament.organizer) {
    details.push({
      label: "Organized by",
      node: tournament.organizerUrl ? (
        <a href={tournament.organizerUrl} target="_blank" rel="noreferrer noopener">
          {tournament.organizer} ↗
        </a>
      ) : (
        tournament.organizer
      ),
    });
  }
  if (tournament.links.length) {
    details.push({
      label: "Links",
      node: (
        <>
          {tournament.links.map((link, index) => (
            <Fragment key={link.url}>
              {index > 0 ? " · " : ""}
              <a href={link.url} target="_blank" rel="noreferrer noopener">
                {link.label} ↗
              </a>
            </Fragment>
          ))}
        </>
      ),
    });
  }

  const header = (
    <section className="ff-thero">
      <div className="ff-thero__banner">
        {tournament.bannerUrl ? (
          <img
            className="ff-thero__banner-img"
            src={tournament.bannerUrl}
            alt=""
            loading="eager"
            decoding="async"
          />
        ) : null}
        <div className="ff-thero__head">
          <span
            className={`ff-thero__status${live ? " ff-thero__status--live" : ""}`}
          >
            {statusLabel(tournament.status)}
          </span>
          <h2 className="ff-thero__title">{tournament.name}</h2>
        </div>
      </div>
      <div className="ff-thero__body">
        <div className="ff-thero__meta">
          <div className="ff-thero__stats">
            {tournament.game ? (
              <div className="ff-stat">
                <span className="ff-stat__label">Game</span>
                <span className="ff-stat__value">{tournament.game}</span>
              </div>
            ) : null}
            <div className="ff-stat">
              <span className="ff-stat__label">Entrants</span>
              <span className="ff-stat__value ff-stat__value--hi">
                {tournament.numAttendees ?? "—"}
              </span>
            </div>
            {dateRange ? (
              <div className="ff-stat">
                <span className="ff-stat__label">Dates</span>
                <span className="ff-stat__value">{dateRange}</span>
              </div>
            ) : null}
            <div className="ff-stat">
              <span className="ff-stat__label">Source</span>
              <span className="ff-stat__value">{sourceLabel}</span>
            </div>
          </div>
        </div>
        <div className="ff-thero__actions">
          {tournament.url ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={tournament.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              View on {sourceLabel}
            </a>
          ) : null}
          <ExternalTournamentRefresh id={tournament.id} />
          <ShareBar
            url={shareUrl}
            title={tournament.name}
            message={shareMessage}
          />
        </div>
      </div>
    </section>
  );

  const overview = (
    <div className="ff-tpanel">
      <TopFinishers finishers={finishers} />
      {hasAbout || details.length ? (
        <div className="ff-toverview">
          {hasAbout ? (
            <Bubble title="About" className="ff-toverview__about">
              {hasLayout ? (
                <AboutLayout rows={tournament.aboutLayout} />
              ) : (
                <div className="ff-ext-about">
                  <Markdown source={prose} />
                </div>
              )}
            </Bubble>
          ) : null}
          {details.length ? (
            <Bubble title="Details" className="ff-toverview__facts">
              <dl className="ff-tfacts">
                {details.map((detail) => (
                  <div className="ff-tfacts__item" key={detail.label}>
                    <dt className="ff-tfacts__label">{detail.label}</dt>
                    <dd className="ff-tfacts__value">{detail.node}</dd>
                  </div>
                ))}
              </dl>
            </Bubble>
          ) : null}
        </div>
      ) : (
        <Bubble title="About" span="full">
          <p className="ff-auth__hint">No details have been published yet.</p>
        </Bubble>
      )}
    </div>
  );

  const bracket = (
    <BracketWithSidebar results={recentResults}>
      <Bubble title="Bracket" className="ff-bubble--divided">
        <ExternalBracket events={tournament.events} source={tournament.source} />
      </Bubble>
    </BracketWithSidebar>
  );

  const standings = (
    <Bubble title={hasDisplayedPlacements ? "Final Standings" : "Entrants"} span="full">
      {!hasPlacedStandings && derived ? (
        derived.kind === "single" ? (
          <div className="ff-ext-section">
            <DerivedStandingsTable
              standings={derived.standings}
              showPlace={hasDisplayedPlacements}
            />
          </div>
        ) : (
          derived.pools.map((pool) => (
            <div key={pool.id} className="ff-ext-section">
              <h4 className="ff-ext-section__head">{pool.label}</h4>
              <DerivedStandingsTable
                standings={pool.standings}
                showPlace
                advanceCount={POOL_ADVANCE_DEFAULT}
              />
            </div>
          ))
        )
      ) : totalStandings > 0 ? (
        tournament.events.map((event) =>
          event.standings.length === 0 ? null : (
            <div key={event.id} className="ff-ext-section">
              {multiEvent && event.name ? (
                <h4 className="ff-ext-section__head">{event.name}</h4>
              ) : null}
              <div className="ff-ticket-table-wrap">
                <table className="ff-ticket-table">
                  <thead>
                    <tr>
                      {hasDisplayedPlacements ? <th scope="col">Place</th> : null}
                      <th scope="col">Entrant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.standings.map((standing, index) => (
                      <tr key={`${standing.entrantName}-${index}`}>
                        {hasDisplayedPlacements ? (
                          <td>{standing.placement ?? "—"}</td>
                        ) : null}
                        <td className="ff-ticket-subject">
                          <span className="ff-ext-entrant">
                            {standing.entrantLogoUrl ? (
                              <img
                                className="ff-ext-entrant__logo"
                                src={standing.entrantLogoUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                              />
                            ) : null}
                            <span>{standing.entrantName}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        )
      ) : (
        <p className="ff-auth__hint">No results yet.</p>
      )}
    </Bubble>
  );

  const rules = (
    <Bubble title="Rules" span="full">
      {rulesUrl ? (
        <p className="ff-ext-about">
          <a href={rulesUrl} target="_blank" rel="noreferrer noopener">
            View the full ruleset ↗
          </a>
        </p>
      ) : tournament.url ? (
        <p className="ff-auth__hint">
          Full rules and eligibility are posted on the organizer&apos;s{" "}
          <a href={tournament.url} target="_blank" rel="noreferrer noopener">
            {sourceLabel} page ↗
          </a>
          .
        </p>
      ) : (
        <p className="ff-auth__hint">No rules have been posted.</p>
      )}
    </Bubble>
  );

  const tabs: TournamentTab[] = [
    { id: "overview", label: "Overview", node: overview },
    { id: "bracket", label: "Bracket", node: bracket },
    { id: "standings", label: "Standings", node: standings },
    { id: "rules", label: "Rules", node: rules },
  ];

  return (
    <div className="ff-tview">
      <TournamentChrome header={header} tabs={tabs} />
    </div>
  );
}
