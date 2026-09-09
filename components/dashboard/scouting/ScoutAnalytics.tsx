import {
  computeConsistency,
  computeDamageHealing,
  computeKdOverTime,
  computePerformanceAnomalies,
  computeWinLossStrip,
  formatKd,
  type ScoutMatch,
} from "@/lib/faceit-scouting-shared";

import { ScoutGraphCard } from "@/components/dashboard/scouting/ScoutGraphCard";
import { AnomaliesList } from "@/components/dashboard/scouting/charts/AnomaliesList";
import { ConsistencyBars } from "@/components/dashboard/scouting/charts/ConsistencyBars";
import { DamageHealingChart } from "@/components/dashboard/scouting/charts/DamageHealingChart";
import { KdOverTimeChart } from "@/components/dashboard/scouting/charts/KdOverTimeChart";
import { WinLossStrip } from "@/components/dashboard/scouting/charts/WinLossStrip";

// The Overview left column: a stack of collapsible graph cards derived from the
// player's collected matches. Pure (all derivations are pure, all cards are
// native <details>), so no client directive. On a Quick search these read from
// the recent window; a Deep search fills them out.

const STREAK_LETTER = { win: "W", loss: "L", draw: "D" } as const;

export function ScoutAnalytics({ matches }: { matches: ScoutMatch[] }) {
  const kd = computeKdOverTime(matches);
  const wl = computeWinLossStrip(matches);
  const dh = computeDamageHealing(matches);
  const anom = computePerformanceAnomalies(matches);
  const cons = computeConsistency(matches);

  const streakCaption = wl.streak
    ? `${STREAK_LETTER[wl.streak.type]}${wl.streak.count} streak`
    : undefined;
  const streakTone =
    wl.streak?.type === "win" ? "pos" : wl.streak?.type === "loss" ? "neg" : undefined;

  return (
    <div className="ff-scoutanalytics">
      <ScoutGraphCard
        title="K/D over time"
        caption={kd.avg != null ? `${formatKd(kd.avg)} avg · last ${kd.window}` : "no data yet"}
        defaultOpen
      >
        <KdOverTimeChart data={kd} />
      </ScoutGraphCard>

      <ScoutGraphCard title="Win / loss strip" caption={streakCaption} tone={streakTone}>
        <WinLossStrip data={wl} />
      </ScoutGraphCard>

      <ScoutGraphCard
        title="Damage vs healing"
        caption={`${dh.detailedCount} detailed matches`}
      >
        <DamageHealingChart data={dh} />
      </ScoutGraphCard>

      <ScoutGraphCard
        title="Performance anomalies"
        caption={`${anom.flagged.length} flagged · >2 SD`}
        tone={anom.flagged.length ? "warn" : undefined}
      >
        <AnomaliesList data={anom} />
      </ScoutGraphCard>

      <ScoutGraphCard title="Consistency by stat" caption="CV · lower is steadier">
        <ConsistencyBars data={cons} />
      </ScoutGraphCard>
    </div>
  );
}
