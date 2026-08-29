import type {
  ExternalTournamentDetail,
  ExternalTournamentMatch,
} from "@/lib/external-tournaments";

// The branded bracket for an external (start.gg / FACEIT) tournament. It reuses
// the internal bracket's card/column styling (the ff-bracket__* classes) but is
// driven by the scraped matches, so the ROUND NAMES are the provider's own
// ("Winners Round 1", "Grand Final", "Losers Semi-Final", …) rather than the
// generic labels the Challonge-backed BracketView derives. Rounds are laid out
// as columns; there are no feed-forward connectors because the projection has
// no match-to-match structure to draw them from — the columns + real round
// names give the bracket its shape.

type BracketRound = {
  label: string;
  timeLabel: string;
  matches: ExternalTournamentMatch[];
};

// A round belongs to the losers bracket when its provider name says so. Kept
// deliberately loose to catch start.gg / FACEIT spellings ("Losers", "Loser's",
// "Lower", "LB").
const LOSERS_RE = /los(?:er|ers|ing)?|lower|\blb\b/i;

function isLosersRound(name: string | null): boolean {
  return name != null && LOSERS_RE.test(name);
}

function roundTimeLabel(matches: ExternalTournamentMatch[]): string {
  const times = matches
    .map((m) => m.scheduledAt?.getTime())
    .filter((t): t is number => t != null);
  if (!times.length) return "Time unavailable";
  return new Date(Math.min(...times)).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Group matches into rounds by their provider round name, preserving the order
    matches arrive in (getExternalTournament sorts them soonest-scheduled first,
    so rounds fall out roughly chronologically). */
function groupRounds(matches: ExternalTournamentMatch[]): BracketRound[] {
  const order: string[] = [];
  const byName = new Map<string, ExternalTournamentMatch[]>();
  for (const match of matches) {
    const label = match.round?.trim() || "Bracket";
    let list = byName.get(label);
    if (!list) {
      list = [];
      byName.set(label, list);
      order.push(label);
    }
    list.push(match);
  }
  return order.map((label) => {
    const list = byName.get(label) ?? [];
    return { label, matches: list, timeLabel: roundTimeLabel(list) };
  });
}

function ExternalMatchCard({ match }: { match: ExternalTournamentMatch }) {
  const card = (
    <div className="ff-bracket__match" data-state={match.state ?? undefined}>
      <div className="ff-bracket__slot">
        <span className="ff-bracket__slot-name">
          {match.entrant1Name ?? "TBD"}
        </span>
      </div>
      <div className="ff-bracket__slot">
        <span className="ff-bracket__slot-name">
          {match.entrant2Name ?? "TBD"}
        </span>
      </div>
    </div>
  );
  return match.url ? (
    <a
      className="ff-bracket__match-link"
      href={match.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      {card}
    </a>
  ) : (
    card
  );
}

function BracketSection({
  rounds,
  title,
}: {
  rounds: BracketRound[];
  title: string | null;
}) {
  if (!rounds.length) return null;
  return (
    <section className="ff-bracket__section">
      {title ? <h3 className="ff-bracket__section-title">{title}</h3> : null}
      <div className="ff-bracket__rounds">
        {rounds.map((round) => (
          <div className="ff-bracket__round" key={round.label}>
            <div className="ff-bracket__round-label">
              {round.label}
              <span className="ff-bracket__round-time">{round.timeLabel}</span>
            </div>
            <div className="ff-bracket__round-matches">
              {round.matches.map((match) => (
                <ExternalMatchCard key={match.id} match={match} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ExternalBracket({
  events,
}: {
  events: ExternalTournamentDetail["events"];
}) {
  const allMatches = events.flatMap((event) => event.matches);
  if (allMatches.length === 0) {
    return <p className="ff-ticket-empty">No bracket data collected yet.</p>;
  }
  const winners = groupRounds(allMatches.filter((m) => !isLosersRound(m.round)));
  const losers = groupRounds(allMatches.filter((m) => isLosersRound(m.round)));
  return (
    <div className="ff-bracket">
      <BracketSection
        rounds={winners}
        title={losers.length ? "Winners Bracket" : null}
      />
      <BracketSection rounds={losers} title="Losers Bracket" />
    </div>
  );
}
