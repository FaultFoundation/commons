import { Fragment, type ReactNode } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { sourceKey } from "@/components/brand/SourceLogo";
import { ExternalBracket } from "@/components/dashboard/tournaments/ExternalBracket";
import { Markdown } from "@/components/dashboard/tournaments/Markdown";
import { ExternalTournamentRefresh } from "@/components/dashboard/tournaments/ExternalTournamentRefresh";
import { TOURNAMENT_STATUS_LABELS } from "@/lib/tournaments-shared";
import type { ExternalTournamentDetail } from "@/lib/external-tournaments";

// The branded Commons view for an external (start.gg / FACEIT) tournament,
// rendered entirely from the cen-sql projection — the same hero template the
// internal tournament page uses, plus a bracket (the scraped sets) and final
// standings. It never calls a provider itself; freshness comes from the
// scraper's projection (and, layered on top, the on-demand refresh in
// ExternalTournamentRefresh).

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

function formatDate(date: Date | null): string | null {
  return date
    ? date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
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

/** True when the whole blurb is just a single URL (no prose around it). start.gg
    organizers routinely drop a bare rules link into the `rules` field — the only
    description field the API exposes — instead of writing an about. We surface it
    as a "Rules" row in the details panel rather than a naked autolink. */
function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Render an organizer contact by its type: an email as a mailto, a URL (Discord
    invite, Twitter, site) as a labelled external link, anything else as plain
    text. */
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

export function ExternalTournamentView({
  tournament,
}: {
  tournament: ExternalTournamentDetail;
}) {
  const live =
    tournament.status === "registration" || tournament.status === "active";
  const source = sourceKey(tournament.source);
  const sourceLabel = SOURCE_LABELS[source] ?? tournament.source;
  const startDate = formatDate(tournament.startAt);
  const multiEvent = tournament.events.length > 1;

  const totalStandings = tournament.events.reduce(
    (sum, event) => sum + event.standings.length,
    0,
  );

  // start.gg exposes no about prose beyond a (often bare) rules link, so the
  // "About" bubble carries whatever real prose exists PLUS a start.gg-style
  // details panel of the tournament's structured facts. `prose` is a genuine
  // blurb (FACEIT, or a start.gg organizer who actually wrote one); a lone URL
  // becomes the "Rules" row instead of a naked autolink.
  const description = tournament.description?.trim() ?? "";
  const prose = description && !isBareUrl(description) ? description : "";
  const rulesUrl = description && isBareUrl(description) ? description : null;

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
  // Only surface a registration deadline that's still ahead — a past one is noise
  // on an active/finished event.
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
        <a
          href={tournament.streamUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
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
  if (tournament.videoUrl) {
    details.push({
      label: "Video",
      node: (
        <a href={tournament.videoUrl} target="_blank" rel="noreferrer noopener">
          Watch ↗
        </a>
      ),
    });
  }
  if (tournament.organizer) {
    details.push({
      label: "Organized by",
      node: tournament.organizerUrl ? (
        <a
          href={tournament.organizerUrl}
          target="_blank"
          rel="noreferrer noopener"
        >
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
  if (rulesUrl) {
    details.push({
      label: "Rules",
      node: (
        <a href={rulesUrl} target="_blank" rel="noreferrer noopener">
          View ruleset ↗
        </a>
      ),
    });
  }

  return (
    <div className="ff-bubble-grid">
      <section className="ff-thero">
        <div className="ff-thero__banner">
          {tournament.bannerUrl ? (
            // A real <img> (like the list cards) rather than a CSS background,
            // so a valid URL always paints and there's no inline-style URL
            // escaping to get wrong. Falls back to the branded gradient (from
            // .ff-thero__banner) when there's no banner.
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
            {startDate ? (
              <div className="ff-stat">
                <span className="ff-stat__label">Starts</span>
                <span className="ff-stat__value">{startDate}</span>
              </div>
            ) : null}
            <div className="ff-stat">
              <span className="ff-stat__label">Source</span>
              <span className="ff-stat__value">{sourceLabel}</span>
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
          </div>
        </div>
      </section>

      {prose || details.length || tournament.images.length ? (
        <Bubble title="About" span="full" className="ff-bubble--divided">
          {prose ? (
            // Real prose flows into two columns divided by a hairline (like
            // start.gg's own About layout), collapsing to one column when narrow.
            <div className="ff-ext-about ff-ext-about--cols">
              <Markdown source={prose} />
            </div>
          ) : null}
          {details.length ? (
            // The structured facts, two columns split by a hairline — start.gg's
            // own "About" is this panel, not prose. Sits under the blurb when both.
            <dl className={`ff-ext-details${prose ? " ff-ext-details--after" : ""}`}>
              {details.map((detail) => (
                <div className="ff-ext-details__item" key={detail.label}>
                  <dt className="ff-ext-details__label">{detail.label}</dt>
                  <dd className="ff-ext-details__value">{detail.node}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {tournament.images.length ? (
            // Extra graphics the organizer added (schedules, sponsor art) — a
            // thumbnail strip, each linking out to the full image.
            <div className="ff-ext-gallery">
              {tournament.images.map((image) => (
                <a
                  key={image.url}
                  className="ff-ext-gallery__item"
                  href={image.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <img src={image.url} alt={image.caption ?? ""} loading="lazy" />
                  {image.caption ? (
                    <span className="ff-ext-gallery__cap">{image.caption}</span>
                  ) : null}
                </a>
              ))}
            </div>
          ) : null}
        </Bubble>
      ) : null}

      <Bubble title="Bracket" span="full" className="ff-bubble--divided">
        <ExternalBracket events={tournament.events} source={tournament.source} />
      </Bubble>

      <Bubble title="Final standings" span="full">
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
                            {standing.entrantName}
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
    </div>
  );
}
