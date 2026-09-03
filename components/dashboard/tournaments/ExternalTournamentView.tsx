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

/** True when the whole blurb is just a single URL (no prose around it). start.gg
    organizers routinely drop a bare rules link into the `rules` field — the only
    description field the API exposes — instead of writing an about. Rendered as a
    naked autolink that reads as an empty "About"; we surface it as a labelled
    link instead. */
function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
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

  const description = tournament.description?.trim() ?? "";
  const descriptionIsLink = description !== "" && isBareUrl(description);

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

      {description ? (
        <Bubble title="About" span="full" className="ff-bubble--divided">
          {descriptionIsLink ? (
            // Just a rules link, not prose — render it as a clear labelled link
            // rather than a naked URL that reads as an empty About.
            <p className="ff-ext-about ff-ext-about--link">
              <a href={description} target="_blank" rel="noreferrer noopener">
                Tournament rules &amp; information ↗
              </a>
            </p>
          ) : (
            // Real prose flows into two columns divided by a hairline (like
            // start.gg's own About layout), collapsing to one column when narrow.
            <div className="ff-ext-about ff-ext-about--cols">
              <Markdown source={description} />
            </div>
          )}
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
