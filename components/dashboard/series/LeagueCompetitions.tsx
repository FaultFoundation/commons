import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { TournamentCards } from "@/components/dashboard/tournaments/TournamentList";
import { leagueosSections } from "@/lib/leagueos-groups";
import { seriesStatus } from "@/lib/series-status";

/** Retain each source event's division dropdown and original title; group
 * separate JV/varsity records under the same season and game. */
export function LeagueCompetitions({ tournaments }: { tournaments: TournamentListEntry[] }) {
  const now = Date.now();
  return <div className="ff-league-competitions">
    {leagueosSections(tournaments).map((section) => {
      const state = seriesStatus(section.tournaments, now);
      const games = [...new Set(section.tournaments.map((t) => t.game ?? "Other games"))].sort();
      return <details key={section.name} className="ff-league-season" open={!state.concluded}>
        <summary>
          <span>{section.name}</span>
          <span className="ff-league-season__meta">{section.tournaments.length} tournaments · {state.status}</span>
        </summary>
        {games.map((game) => <section key={game} className="ff-league-game">
          <h3>{game}</h3>
          <TournamentCards tournaments={section.tournaments.filter((t) => (t.game ?? "Other games") === game)} empty="No tournaments recorded here yet." />
        </section>)}
      </details>;
    })}
  </div>;
}
