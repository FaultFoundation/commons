import { Fragment, type ReactNode } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { sourceKey } from "@/components/brand/SourceLogo";
import { AboutLayout } from "@/components/dashboard/tournaments/AboutLayout";
import { ExternalBracket } from "@/components/dashboard/tournaments/ExternalBracket";
import { Markdown } from "@/components/dashboard/tournaments/Markdown";
import { ExternalTournamentRefresh } from "@/components/dashboard/tournaments/ExternalTournamentRefresh";
import {
  TournamentChrome,
  type TournamentTab,
} from "@/components/dashboard/tournaments/TournamentChrome";
import { TopFinishers } from "@/components/dashboard/tournaments/TopFinishers";
import { RecentResults } from "@/components/dashboard/tournaments/RecentResults";
import { TournamentLinks } from "@/components/dashboard/tournaments/TournamentLinks";
import type {
  FinisherEntry,
  HeaderLink,
  HeaderLinkKind,
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

function formatShortDate(date: Date | null): string | null {
  return date
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
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

/** Map a URL's host to a brand icon kind for the header links row. */
function brandForHost(url: string): HeaderLinkKind {
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
    return "x";
  return "website";
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

/** The tournament's own known links, as header icons — only the ones we have. */
function buildHeaderLinks(t: ExternalTournamentDetail): HeaderLink[] {
  const out: HeaderLink[] = [];
  const seen = new Set<string>();
  const push = (kind: HeaderLinkKind, label: string, href: string) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ kind, label, href });
  };

  if (t.videoUrl) push("video", "Watch the video", t.videoUrl);
  if (t.streamUrl) {
    const kind = brandForHost(t.streamUrl) === "twitch" ? "twitch" : "stream";
    push(kind, "Watch the stream", t.streamUrl);
  }
  if (t.contact) {
    const type = t.contactType?.trim().toLowerCase() ?? "";
    if (/^https?:\/\//i.test(t.contact)) {
      const kind =
        type === "discord"
          ? "discord"
          : type === "twitter"
            ? "x"
            : brandForHost(t.contact);
      push(kind, "Contact the organizer", t.contact);
    } else if (type === "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.contact)) {
      push("email", "Email the organizer", `mailto:${t.contact}`);
    }
  }
  if (t.organizerUrl) {
    push("organizer", t.organizer ? `Organizer: ${t.organizer}` : "Organizer", t.organizerUrl);
  }
  for (const link of t.links) push(brandForHost(link.url), link.label, link.url);
  return out;
}

/** The event we read placements from — the one with the most standings (a
    multi-event tournament's main event); null when none are placed yet. */
function primaryStandingsEvent(
  events: ExternalTournamentDetail["events"],
): ExternalTournamentDetail["events"][number] | null {
  const withStandings = events.filter((e) => e.standings.length > 0);
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
          dateLabel: formatShortDate(m.scheduledAt),
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

export function ExternalTournamentView({
  tournament,
}: {
  tournament: ExternalTournamentDetail;
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

  const headerLinks = buildHeaderLinks(tournament);
  const finishers = buildFinishers(tournament.events);
  const recentResults = buildRecentResults(tournament.events);

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
          <TournamentLinks links={headerLinks} />
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
    <div className={`ff-tbracket${recentResults.length ? "" : " ff-tbracket--solo"}`}>
      {recentResults.length ? <RecentResults results={recentResults} /> : null}
      <Bubble title="Bracket" className="ff-bubble--divided ff-tbracket__main">
        <ExternalBracket events={tournament.events} source={tournament.source} />
      </Bubble>
    </div>
  );

  const standings = (
    <Bubble title="Final Standings" span="full">
      {totalStandings === 0 ? (
        <p className="ff-auth__hint">No results yet.</p>
      ) : (
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
                      <th scope="col">Place</th>
                      <th scope="col">Entrant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.standings.map((standing, index) => (
                      <tr key={`${standing.entrantName}-${index}`}>
                        <td>{standing.placement ?? "—"}</td>
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
