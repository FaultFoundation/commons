/**
 * A greyed-out integration card for a platform we can't connect yet — today
 * only LeagueSpot, which offers no public user OAuth (it's B2B/white-label), so
 * a member can't self-serve link it. Presentational and inert: it advertises
 * the platform as planned without pretending it's connectable. Give it a real
 * IntegrationCard the day a link flow exists.
 */
export function ComingSoonIntegration({
  label,
  mark,
  note,
}: {
  /** Platform name, shown as the card heading. */
  label: string;
  /** Short glyph text for the placeholder logo, e.g. "LS". */
  mark: string;
  /** Optional fine print explaining why it isn't available. */
  note?: string;
}) {
  return (
    <div className="ff-integration ff-integration--soon">
      <div className="ff-integration__head">
        <span className="ff-integration__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" role="presentation">
            <text
              x="12"
              y="16"
              textAnchor="middle"
              fontSize={9}
              fontWeight={800}
              fill="currentColor"
              fontFamily="inherit"
            >
              {mark}
            </text>
          </svg>
        </span>
        <span className="ff-integration__name">{label}</span>
      </div>

      <p className="ff-integration__status">Coming soon</p>
      {note ? <p className="ff-integration__note">{note}</p> : null}

      <div className="ff-integration__action">
        <button className="ff-btn ff-btn--outline" type="button" disabled>
          Connect
        </button>
      </div>
    </div>
  );
}
