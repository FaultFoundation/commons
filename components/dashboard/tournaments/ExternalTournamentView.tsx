import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { sourceKey } from "@/components/brand/SourceLogo";
import { ExternalBracket } from "@/components/dashboard/tournaments/ExternalBracket";
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

  return (
    <div className="ff-bubble-grid">
      <section className="ff-thero">
        <div
          className="ff-thero__banner"
          style={
            tournament.bannerUrl
              ? { backgroundImage: `url(${tournament.bannerUrl})` }
              : undefined
          }
        >
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
          {tournament.description ? (
            <p className="ff-thero__desc">{tournament.description}</p>
          ) : null}
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

      <Bubble title="Bracket" span="full" className="ff-bubble--divided">
        <ExternalBracket events={tournament.events} />
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
