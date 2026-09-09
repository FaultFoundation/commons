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

export function ScoutFacts({
  player,
  summary,
}: {
  player: ScoutPlayer;
  summary: ScoutSummary | null;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Win Rate", value: formatWinratePct(summary?.winrate ?? null) },
    { label: "Record", value: summary ? formatRecord(summary) : "—" },
    {
      label: "Matches",
      value: summary ? String(summary.total) : String(player.matchCount),
    },
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
