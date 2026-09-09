import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  formatElo,
  formatRecord,
  formatWinratePct,
  type ScoutPlayer,
  type ScoutSummary,
} from "@/lib/faceit-scouting-shared";

// The Overview right rail — the tournament-view "Details" facts panel, moved off
// the header. Win rate / record / matches / ELO / Blizzard ID lead (what a scout
// wants first), then identity extras when present.
//
// The record is given in BOTH units, labelled, because an Overwatch FACEIT match
// is a Bo3/Bo5 series: the MAP row is the number faceit.com/players/<name>/ow
// shows (its "Matches" and "Win rate %" count maps), while the SERIES row is the
// one that matches the match list below. Showing only one of them means a scout
// comparing against the FACEIT profile sees a mismatch and distrusts the page.

export function ScoutFacts({
  player,
  summary,
}: {
  player: ScoutPlayer;
  summary: ScoutSummary | null;
}) {
  const rows: { label: string; value: string }[] = [
    {
      label: "Map Win Rate",
      value: formatWinratePct(summary?.maps.winrate ?? null),
    },
    { label: "Map Record", value: summary ? formatRecord(summary.maps) : "—" },
    {
      label: "Series Record",
      value: summary
        ? `${formatRecord(summary)} · ${formatWinratePct(summary.winrate)}`
        : "—",
    },
    {
      label: "Matches",
      value: summary ? String(summary.total) : String(player.matchCount),
    },
    { label: "Maps Played", value: summary ? String(summary.maps.total) : "—" },
    { label: "ELO", value: formatElo(player.faceitElo) },
    { label: "Blizzard ID", value: player.gamePlayerName ?? "—" },
  ];
  if (player.skillLevel != null) {
    rows.push({ label: "Skill Level", value: String(player.skillLevel) });
  }
  if (player.region) rows.push({ label: "Region", value: player.region });
  if (player.country) rows.push({ label: "Country", value: player.country });

  return (
    <Bubble title="Details">
      <dl className="ff-tfacts">
        {rows.map((r) => (
          <div className="ff-tfacts__item" key={r.label}>
            <dt className="ff-tfacts__label">{r.label}</dt>
            <dd className="ff-tfacts__value">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Bubble>
  );
}
