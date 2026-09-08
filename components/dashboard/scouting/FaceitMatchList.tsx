import type { ScoutMatch } from "@/lib/faceit-scouting-shared";

// The scouted player's recent matches, newest first — a presentational list of
// the collected FACEIT scoreboard rows. Deliberately close to the pd_* MatchList
// idiom (result chip, sides, score, out-link) but showing the FACEIT extras the
// scouting cache carries: the map and the player's own K/D/A line.

const RESULT_LABELS = { win: "Win", loss: "Loss", draw: "Draw" } as const;

function formatWhen(ms: number | null): string {
  if (!ms) return "Date TBD";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "11/5/2" from the elim/death/assist line, or null when detail isn't in yet. */
function formatKda(m: ScoutMatch): string | null {
  if (m.eliminations == null && m.deaths == null && m.assists == null) return null;
  return `${m.eliminations ?? 0}/${m.deaths ?? 0}/${m.assists ?? 0}`;
}

export function FaceitMatchList({ matches }: { matches: ScoutMatch[] }) {
  if (!matches.length) {
    return (
      <p className="ff-bubble__note">
        No matches collected yet — they fill in as the search runs.
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
        const kda = formatKda(m);
        const meta = [
          formatWhen(m.startedAt),
          m.mapName,
          m.mapMode,
          m.bestOf ? `Bo${m.bestOf}` : null,
          kda ? `K/D/A ${kda}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li className="ff-pdmatch" key={m.matchId}>
            <div className="ff-pdmatch__main">
              <span className="ff-pdmatch__title">
                {m.competitionName ?? "FACEIT match"}
              </span>
              <span className="ff-pdmatch__sides">
                {m.opponentName ? `vs ${m.opponentName}` : "—"}
              </span>
              <span className="ff-pdmatch__meta">{meta}</span>
            </div>
            <div className="ff-pdmatch__tail">
              {m.result ? (
                <span className={`ff-pdmatch__result ff-pdmatch__result--${m.result}`}>
                  {RESULT_LABELS[m.result]}
                </span>
              ) : null}
              <span className="ff-pdmatch__score">{score ?? "—"}</span>
              {m.faceitUrl ? (
                <a
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  href={m.faceitUrl}
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
