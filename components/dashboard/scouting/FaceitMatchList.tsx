import type { ScoutMatch } from "@/lib/faceit-scouting-shared";
import { ScoutMatchRow } from "@/components/dashboard/scouting/ScoutMatchRow";

// The scouted player's recent matches, newest first — now a list of expandable
// rows (ScoutMatchRow) rather than a flat list: each opens to the full both-team
// scoreboard + per-round tabs, fetched on demand.

export function FaceitMatchList({
  matches,
  scoutedPlayerId,
}: {
  matches: ScoutMatch[];
  scoutedPlayerId: string;
}) {
  if (!matches.length) {
    return (
      <p className="ff-bubble__note">
        No matches collected yet — they fill in as the search runs.
      </p>
    );
  }
  return (
    <div className="ff-scoutmatches">
      {matches.map((m) => (
        <ScoutMatchRow key={m.matchId} match={m} scoutedPlayerId={scoutedPlayerId} />
      ))}
    </div>
  );
}
