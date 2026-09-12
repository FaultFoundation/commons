import { TeamMapWinrateChart } from "./TeamMapWinrateChart";
import {
  computeWinLossStrip,
  formatWinratePct,
  type MapWinrate,
  type ScoutMatch,
  type ScoutSummary,
  type ScoutTeamMember,
} from "@/lib/faceit-scouting-shared";

import { MapWinrateChart } from "@/components/dashboard/scouting/MapWinrateChart";
import { ScoutGraphCard } from "@/components/dashboard/scouting/ScoutGraphCard";
import { WinLossStrip } from "@/components/dashboard/scouting/charts/WinLossStrip";

// Map Profile leads the collapsible analytics cards and opens by default.

const STREAK_LETTER = { win: "W", loss: "L", draw: "D" } as const;

export function ScoutAnalytics({
  matches,
  mapWinrates,
  summary,
  collecting,
  members,
}: {
  matches: ScoutMatch[];
  mapWinrates: MapWinrate[];
  summary: ScoutSummary;
  collecting: boolean;
  members?: ScoutTeamMember[];
}) {
  const wl = computeWinLossStrip(matches);

  const streakCaption = wl.streak
    ? `${STREAK_LETTER[wl.streak.type]}${wl.streak.count} streak`
    : undefined;
  const streakTone =
    wl.streak?.type === "win" ? "pos" : wl.streak?.type === "loss" ? "neg" : undefined;

  const mapCaption = summary.maps.total
    ? `${formatWinratePct(summary.maps.winrate)} · ${summary.maps.total} maps across ${summary.matchesWithMaps} ${summary.matchesWithMaps === 1 ? "match" : "matches"}`
    : "no maps yet";

  return (
    <div className="ff-scoutanalytics">
      <ScoutGraphCard title="Map Profile" caption={members ? `Team record: ${mapCaption}` : mapCaption} defaultOpen>
        {collecting && mapWinrates.length === 0 ? (
          <p className="ff-bubble__note">
            Collecting matches… map win rates appear as each match&apos;s rounds
            are pulled.
          </p>
        ) : (
          members ? <TeamMapWinrateChart members={members} /> : <MapWinrateChart rows={mapWinrates} />
        )}
      </ScoutGraphCard>

      <ScoutGraphCard title="Win / loss strip" caption={streakCaption} tone={streakTone}>
        <WinLossStrip data={wl} />
      </ScoutGraphCard>
    </div>
  );
}
