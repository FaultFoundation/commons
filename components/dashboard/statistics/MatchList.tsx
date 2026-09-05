import {
  ChallongeMark,
  FaceitMark,
  StartggMark,
} from "@/components/brand/ProviderMark";
import {
  PD_PROVIDER_LABELS,
  type ExternalMatchRow,
  type PdProvider,
} from "@/lib/player-data-shared";

// The universal external-match row list — shared (no directive) so the server
// -rendered team detail and the client-side Match Data tab draw identical rows.
// Deliberately simple for now: platform mark, competition, sides, score, a
// result chip, and an out-link to the provider's own match page. A proper
// design pass comes later; the point today is all the data in one place.

function ProviderGlyph({ provider }: { provider: PdProvider }) {
  return (
    <span
      className="ff-pdmatch__mark"
      title={PD_PROVIDER_LABELS[provider]}
      aria-label={PD_PROVIDER_LABELS[provider]}
    >
      {provider === "faceit" ? (
        <FaceitMark />
      ) : provider === "startgg" ? (
        <StartggMark />
      ) : (
        <ChallongeMark />
      )}
    </span>
  );
}

function formatWhen(ms: number | null): string {
  if (!ms) return "Date TBD";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const RESULT_LABELS = { win: "Win", loss: "Loss", draw: "Draw" } as const;

export function MatchList({ matches }: { matches: ExternalMatchRow[] }) {
  if (!matches.length) {
    return (
      <p className="ff-bubble__note">
        No matches synced yet — history fills in as providers are polled.
      </p>
    );
  }
  return (
    <ul className="ff-pdmatches">
      {matches.map((m) => {
        const score =
          m.scoreFor != null && m.scoreAgainst != null
            ? `${m.scoreFor}–${m.scoreAgainst}`
            : null;
        const meta = [
          formatWhen(m.startedAt),
          m.game,
          m.roundText,
          m.status === "live"
            ? "Live"
            : m.status === "scheduled"
              ? "Upcoming"
              : m.status === "cancelled"
                ? "Cancelled"
                : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li className="ff-pdmatch" key={m.id}>
            <ProviderGlyph provider={m.provider} />
            <div className="ff-pdmatch__main">
              <span className="ff-pdmatch__title">
                {m.competitionName ?? PD_PROVIDER_LABELS[m.provider]}
              </span>
              <span className="ff-pdmatch__sides">
                {m.teamName && m.opponentName
                  ? `${m.teamName} vs ${m.opponentName}`
                  : m.opponentName
                    ? `vs ${m.opponentName}`
                    : (m.teamName ?? "—")}
              </span>
              <span className="ff-pdmatch__meta">{meta}</span>
              {m.reportedTime ? <span className="ff-pdmatch__meta">Team-reported time: {new Date(m.reportedTime.scheduledAt).toLocaleString()} · <a href={m.reportedTime.sourceUrl} target="_blank" rel="noreferrer">Source</a>{m.reportedTime.conflictsWithProvider ? " · Differs from provider time" : ""}</span> : null}
            </div>
            <div className="ff-pdmatch__tail">
              {m.result ? (
                <span className={`ff-pdmatch__result ff-pdmatch__result--${m.result}`}>
                  {RESULT_LABELS[m.result]}
                </span>
              ) : null}
              <span className="ff-pdmatch__score">{score ?? "—"}</span>
              {m.url ? (
                <a
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  href={m.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
