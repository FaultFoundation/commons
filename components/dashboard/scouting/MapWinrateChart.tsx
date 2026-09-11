"use client";

import { useId, useState } from "react";
import {
  formatRecord,
  formatWinratePct,
  type MapWinrate,
} from "@/lib/faceit-scouting-shared";

const MIN_PLAYS = 7;
type MapOrder = "mode" | "winrate" | "played";
const MODES = ["Control", "Escort", "Hybrid", "Push", "Flashpoint", "Clash"];

function MapRows({ rows, grouped }: { rows: MapWinrate[]; grouped: boolean }) {
  return rows.map((row) => (
    <div className="ff-scoutmap__row" key={row.map}>
      <div className="ff-scoutmap__label">
        <span className="ff-scoutmap__map">{row.map}</span>
        {!grouped && row.mapMode ? (
          <span className="ff-scoutmap__mode">{row.mapMode}</span>
        ) : null}
      </div>
      <div className="ff-scoutmap__track" aria-hidden="true">
        <div className="ff-scoutmap__bar" style={{ width: `${(row.winrate ?? 0) * 100}%` }} />
      </div>
      <div className="ff-scoutmap__value">
        <span className="ff-scoutmap__pct">{formatWinratePct(row.winrate)}</span>
        <span className="ff-scoutmap__record">
          {formatRecord(row)} · {row.total} {row.total === 1 ? "play" : "plays"}
        </span>
      </div>
    </div>
  ));
}

function MapSection({ rows, order }: { rows: MapWinrate[]; order: MapOrder }) {
  if (order !== "mode") return <MapRows rows={rows} grouped={false} />;
  const groups = new Map<string, MapWinrate[]>();
  for (const row of rows) {
    const mode = row.mapMode || "Other";
    groups.set(mode, [...(groups.get(mode) ?? []), row]);
  }
  const rank = (mode: string) => MODES.includes(mode) ? MODES.indexOf(mode) : MODES.length;
  return [...groups].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([mode, maps]) => {
      const wins = maps.reduce((sum, row) => sum + row.wins, 0);
      const decided = maps.reduce((sum, row) => sum + row.wins + row.losses, 0);
      const total = maps.reduce((sum, row) => sum + row.total, 0);
      return (
        <section className="ff-scoutmap__group" key={mode} aria-label={mode}>
          <h4 className="ff-scoutmap__heading">
            <span>{mode}</span>
            <span className="ff-scoutmap__mode">
              {formatWinratePct(decided ? wins / decided : null)} win rate · {total} {total === 1 ? "play" : "plays"}
            </span>
          </h4>
          <MapRows rows={maps} grouped />
        </section>
      );
    });
}

export function MapWinrateChart({ rows }: { rows: MapWinrate[] }) {
  const [order, setOrder] = useState<MapOrder>("mode");
  const selectId = useId();
  if (!rows.length) {
    return <p className="ff-bubble__note">No map data yet — win rates appear here as each match&apos;s map is collected. Give it a moment and refresh.</p>;
  }
  const sorted = [...rows].sort((a, b) =>
    (order === "played" ? b.total - a.total : 0)
    || (b.winrate ?? -1) - (a.winrate ?? -1)
    || b.total - a.total
    || a.map.localeCompare(b.map),
  );
  const established = sorted.filter((row) => row.total >= MIN_PLAYS);
  return (
    <div className="ff-scoutmap" role="region" aria-label="Map Profile">
      <label className="ff-scoutmap__sort" htmlFor={selectId}>
        Display
        <select id={selectId} value={order} onChange={(event) => setOrder(event.target.value as MapOrder)}>
          <option value="mode">Group by type</option>
          <option value="winrate">Win rate</option>
          <option value="played">Most played</option>
        </select>
      </label>
      <MapSection rows={established} order={order} />
      <p className="ff-scoutmap__note">Win rate excludes draws. Group totals cover the maps shown in each group.</p>
    </div>
  );
}
