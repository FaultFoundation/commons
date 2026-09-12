"use client";
import { Fragment, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { teamMapWinrates, formatWinratePct, formatRecord, formatElo, type ScoutTeamMember } from "@/lib/faceit-scouting-shared";

export function TeamMapWinrateChart({ members }: { members: ScoutTeamMember[] }) {
  const [order, setOrder] = useState("mode");
  const [active, setActive] = useState<string | null>(null);
  const id = useId();
  useEffect(() => {
    const hide = () => setActive(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => { window.removeEventListener("scroll", hide, true); window.removeEventListener("resize", hide); };
  }, []);
  const [position, setPosition] = useState({ left: 12, top: 0, above: false });
  const show = (key: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const above = rect.top >= 190;
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(278, window.innerWidth - 24) - 12)), top: above ? rect.top - 8 : rect.bottom + 8, above });
    setActive(key);
  };
  const rows = teamMapWinrates(members).sort((a, b) => (order === "mode" ? (a.mapMode ?? "Other").localeCompare(b.mapMode ?? "Other") : order === "played" ? b.total - a.total : (b.winrate ?? -1) - (a.winrate ?? -1)) || a.map.localeCompare(b.map));
  if (!rows.length) return <p className="ff-bubble__note">Collecting the roster’s map histories…</p>;
  return <div className="ff-scoutmap" role="region" aria-label="Team map profile">
    <label className="ff-scoutmap__sort" htmlFor={id}>Display <select id={id} value={order} onChange={e => setOrder(e.target.value)}>
      <option value="mode">Group by type</option><option value="winrate">Win rate</option><option value="played">Most played</option>
    </select></label>
    <p className="ff-scoutmap__note">Large dot: roster average · Wicks: lowest–highest player · Small dots: players. Hover or focus a dot for details.</p>
    {rows.map((row, index) => {
      const placed: { rate: number; y: number }[] = [];
      const points = row.players.map(p => {
        let lane = 0;
        let y = 0;
        while ((Math.abs(p.rate - (row.winrate ?? -1)) < .035 && y === 0) || placed.some(q => Math.abs(p.rate - q.rate) < .05 && q.y === y)) {
          lane++;
          y = Math.ceil(lane / 2) * 18 * (lane % 2 ? -1 : 1);
        }
        placed.push({ rate: p.rate, y });
        return { ...p, y };
      });
      const height = Math.max(62, ...placed.map(p => Math.abs(p.y) * 2 + 28));
      return <Fragment key={row.map}>
      {order === "mode" && (index === 0 || rows[index - 1].mapMode !== row.mapMode) && <h4 className="ff-scoutmap__heading">{row.mapMode || "Other"}</h4>}
      <div className="ff-scoutmap__row">
      <div className="ff-scoutmap__label"><span className="ff-scoutmap__map">{row.map}</span><span className="ff-scoutmap__mode">{row.mapMode}</span></div>
      <div className="ff-teammap__track" style={{ height }}>
        <span className="ff-teammap__guide" />
        {row.low != null && row.high != null && <span className="ff-teammap__wick" style={{ left: `${row.low * 100}%`, width: `${(row.high - row.low) * 100}%` }} />}
        {row.winrate != null && <button type="button" className="ff-teammap__average" style={{ left: `${row.winrate * 100}%` }} aria-label={`Roster average ${formatWinratePct(row.winrate)} on ${row.map}`} title={`Roster average: ${formatWinratePct(row.winrate)} · ${row.players.length} players`} />}
        {points.map(p => {
          const key = `${row.map}:${p.member.player.playerId}`;
          const player = p.member.player;
          return <div className="ff-teammap__point" key={key} style={{ left: `${p.rate * 100}%`, top: `calc(50% + ${p.y - 9}px)` }} onMouseEnter={e => show(key, e.currentTarget)} onMouseLeave={() => setActive(null)}>
            <button type="button" className="ff-teammap__dot" aria-label={`${player.nickname}: ${formatWinratePct(p.rate)} on ${row.map}`}
              aria-describedby={active === key ? `${id}-tooltip` : undefined} onFocus={e => show(key, e.currentTarget)} onBlur={() => setActive(null)}
              onClick={e => show(key, e.currentTarget)} onKeyDown={e => { if (e.key === "Escape") setActive(null); }} />
            {active === key && createPortal(<div id={`${id}-tooltip`} role="tooltip" className="ff-teammap__tooltip" style={{ left: position.left, top: position.top, transform: position.above ? "translateY(-100%)" : undefined }}>
              <strong>{player.nickname}</strong>
              {player.gamePlayerName && <span>{player.gamePlayerName}</span>}
              <span>{row.map}: {formatWinratePct(p.rate)} · {p.total} maps</span>
              <span>Level {player.skillLevel ?? "—"} · {formatElo(player.faceitElo)} ELO · {player.region ?? player.country ?? "—"}</span>
              {p.member.data && <span>Overall maps: {formatWinratePct(p.member.data.summary.maps.winrate)} · {formatRecord(p.member.data.summary.maps)}</span>}
              <span>{p.member.status === "ready" ? `${player.matchCount} matches collected` : "History still collecting…"}</span>
            </div>, document.body)}
          </div>;
        })}
      </div>
      <div className="ff-scoutmap__value"><span className="ff-scoutmap__pct">{formatWinratePct(row.winrate)}</span><span className="ff-scoutmap__record">{row.players.length}/{members.length} players</span></div>
    </div></Fragment>;
    })}
    <p className="ff-scoutmap__note">Average gives each player equal weight. Players without decided maps are excluded. Team records and the Matches tab use the team’s own history.</p>
  </div>;
}
