"use client";

import { useEffect, useMemo, useState } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  currentRound,
  type RREntrant,
  type RRGroup,
  type RRMatch,
} from "@/lib/round-robin-shared";

// The round-robin view — the first per-format tournament view (routed to by the
// format framework's `roundrobin` kind). Three linked pieces on one panel:
//
//   1. Results matrix (full-width): rows/cols = entrants, cell = the row team's
//      result vs the column team, shaded by round. Click a cell → match detail.
//   2. At-a-glance graph (lower-left): entrants on a circle, every matchup a
//      curved edge; the current round (incl. live) is emphasised, the next
//      lighter, the rest dashed. All geometry computed here on the client.
//   3. Rounds schedule (lower-right): each round's matches with a time, a score,
//      or a LIVE marker — the RecentResults idiom.
//
// Fed one plain RRGroup[] by lib/round-robin-shared's per-source normalisers, so
// the internal (Challonge) and external (start.gg/FACEIT) paths render
// identically. A multi-group stage shows one group at a time behind group tabs.

/** Order-independent key for the single match between two entrants. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** A short mark for a node / column head — an acronym of the words, else the
    first few characters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return name.trim().slice(0, 3).toUpperCase();
}

/** A subtle per-round background tint so cells read as grouped by round. Spread
    the hue across the rounds and keep the alpha low, so it layers legibly over
    the card surface in both light and dark themes. */
function roundShade(round: number, maxRound: number): string {
  const hue = maxRound > 1 ? Math.round(((round - 1) / (maxRound - 1)) * 280) : 210;
  return `hsla(${hue}, 65%, 55%, 0.13)`;
}

function EntrantLogo({
  entrant,
  className,
}: {
  entrant: Pick<RREntrant, "name" | "logoUrl">;
  className: string;
}) {
  if (entrant.logoUrl) {
    return (
      <img
        className={className}
        src={entrant.logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className={`${className} ${className}--empty`} aria-hidden="true">
      {initials(entrant.name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Results matrix
// ---------------------------------------------------------------------------

function ResultsMatrix({
  group,
  onSelect,
}: {
  group: RRGroup;
  onSelect: (m: RRMatch) => void;
}) {
  const { entrants } = group;
  const byPair = useMemo(() => {
    const map = new Map<string, RRMatch>();
    for (const m of group.matches) {
      if (m.aId && m.bId) map.set(pairKey(m.aId, m.bId), m);
    }
    return map;
  }, [group.matches]);
  const maxRound = useMemo(
    () => Math.max(1, ...group.matches.map((m) => m.round)),
    [group.matches],
  );

  return (
    <div className="ff-rr-matrix-wrap">
      <table className="ff-rr-matrix">
        <thead>
          <tr>
            <th className="ff-rr-matrix__corner" aria-hidden="true" />
            {entrants.map((col) => (
              <th key={col.id} scope="col" className="ff-rr-matrix__colhead" title={col.name}>
                <EntrantLogo entrant={col} className="ff-rr-matrix__logo" />
                <span className="ff-rr-matrix__abbr">{initials(col.name)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entrants.map((row) => (
            <tr key={row.id}>
              <th scope="row" className="ff-rr-matrix__rowhead" title={row.name}>
                <EntrantLogo entrant={row} className="ff-rr-matrix__logo" />
                <span className="ff-rr-matrix__rowname">{row.name}</span>
              </th>
              {entrants.map((col) => {
                if (col.id === row.id) {
                  return (
                    <td key={col.id} className="ff-rr-matrix__cell ff-rr-matrix__cell--self">
                      —
                    </td>
                  );
                }
                const match = byPair.get(pairKey(row.id, col.id));
                if (!match) {
                  return (
                    <td key={col.id} className="ff-rr-matrix__cell ff-rr-matrix__cell--none">
                      <span aria-hidden="true">·</span>
                      <span className="screen-reader-text">Not yet played</span>
                    </td>
                  );
                }
                const rowIsA = match.aId === row.id;
                const rowScore = rowIsA ? match.aScore : match.bScore;
                const colScore = rowIsA ? match.bScore : match.aScore;
                const rowWon = match.winner === (rowIsA ? "a" : "b");
                const rowLost = match.winner != null && !rowWon;

                if (match.state === "live") {
                  return (
                    <td key={col.id} className="ff-rr-matrix__cell ff-rr-matrix__cell--live">
                      <button type="button" className="ff-rr-matrix__btn" onClick={() => onSelect(match)}>
                        <span className="ff-rr-live">LIVE</span>
                      </button>
                    </td>
                  );
                }
                if (match.state === "upcoming") {
                  return (
                    <td
                      key={col.id}
                      className="ff-rr-matrix__cell ff-rr-matrix__cell--upcoming"
                      style={{ background: roundShade(match.round, maxRound) }}
                    >
                      <button
                        type="button"
                        className="ff-rr-matrix__btn"
                        onClick={() => onSelect(match)}
                        title={match.timeLabel ?? "Scheduled"}
                      >
                        <span aria-hidden="true">·</span>
                        <span className="screen-reader-text">
                          {match.timeLabel ?? "Scheduled"}
                        </span>
                      </button>
                    </td>
                  );
                }
                return (
                  <td
                    key={col.id}
                    className={`ff-rr-matrix__cell${rowWon ? " ff-rr-matrix__cell--win" : rowLost ? " ff-rr-matrix__cell--loss" : ""}`}
                    style={{ background: roundShade(match.round, maxRound) }}
                  >
                    <button type="button" className="ff-rr-matrix__btn" onClick={() => onSelect(match)}>
                      <span className="ff-rr-matrix__wl">{rowWon ? "W" : rowLost ? "L" : ""}</span>
                      <span className="ff-rr-matrix__score">
                        {rowScore}–{colScore}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ff-rr-matrix__note">
        row = team&apos;s result vs column team · dot = not yet played · click a cell
        for match detail
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// At-a-glance matchup graph
// ---------------------------------------------------------------------------

type EdgeClass = "live" | "next" | "second" | "rest" | "done";

function MatchupGraph({ group }: { group: RRGroup }) {
  const cur = useMemo(() => currentRound(group.matches), [group.matches]);

  const geometry = useMemo(() => {
    const n = group.entrants.length;
    const cx = 50;
    const cy = 50;
    const R = 37;
    const r = Math.max(3.6, Math.min(8, 60 / Math.max(n, 1)));
    const pos = new Map<string, { x: number; y: number }>();
    group.entrants.forEach((e, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      pos.set(e.id, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
    });

    const edgeClass = (m: RRMatch): EdgeClass => {
      if (m.state === "live") return "live";
      if (m.state === "done") return "done";
      if (m.round === cur) return "next";
      if (m.round === cur + 1) return "second";
      return "rest";
    };
    // Rank so a node adopts its most-prominent match's status ring.
    const rank: Record<EdgeClass, number> = { live: 4, next: 3, second: 2, done: 1, rest: 0 };
    const nodeClass = new Map<string, EdgeClass>();
    const edges: { d: string; cls: EdgeClass; key: string }[] = [];
    for (const m of group.matches) {
      const a = pos.get(m.aId);
      const b = pos.get(m.bId);
      if (!a || !b) continue;
      const cls = edgeClass(m);
      // A quadratic curve bowed toward the centre — the organic "web" look that
      // matches the bracket's curved connectors, rather than straight chords.
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const qx = mx + (cx - mx) * 0.35;
      const qy = my + (cy - my) * 0.35;
      edges.push({
        d: `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${qx.toFixed(2)} ${qy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
        cls,
        key: m.id,
      });
      for (const id of [m.aId, m.bId]) {
        const prev = nodeClass.get(id);
        if (!prev || rank[cls] > rank[prev]) nodeClass.set(id, cls);
      }
    }
    // Draw the faint (done/rest) edges first so live/next sit on top.
    edges.sort((x, y) => rank[x.cls] - rank[y.cls]);
    const nodes = group.entrants.map((e) => ({
      id: e.id,
      name: e.name,
      cls: nodeClass.get(e.id) ?? "rest",
      ...(pos.get(e.id) as { x: number; y: number }),
      r,
    }));
    return { edges, nodes };
  }, [group.entrants, group.matches, cur]);

  if (group.entrants.length < 2) return null;

  return (
    <div className="ff-rr-graph">
      <svg viewBox="0 0 100 100" className="ff-rr-graph__svg" role="img" aria-label="All matchups">
        <g className="ff-rr-graph__edges">
          {geometry.edges.map((e) => (
            <path key={e.key} d={e.d} className={`ff-rr-edge ff-rr-edge--${e.cls}`} />
          ))}
        </g>
        <g className="ff-rr-graph__nodes">
          {geometry.nodes.map((node) => (
            <g key={node.id} className={`ff-rr-node ff-rr-node--${node.cls}`}>
              <title>{node.name}</title>
              <circle cx={node.x} cy={node.y} r={node.r} className="ff-rr-node__dot" />
              <text x={node.x} y={node.y} className="ff-rr-node__label" dominantBaseline="central" textAnchor="middle">
                {initials(node.name)}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="ff-rr-graph__legend">
        <span className="ff-rr-legend ff-rr-legend--done">Played</span>
        <span className="ff-rr-legend ff-rr-legend--live">Live now</span>
        <span className="ff-rr-legend ff-rr-legend--next">This round</span>
        <span className="ff-rr-legend ff-rr-legend--rest">Upcoming</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rounds schedule
// ---------------------------------------------------------------------------

function ScheduleRow({
  match,
  byId,
  onSelect,
}: {
  match: RRMatch;
  byId: Map<string, RREntrant>;
  onSelect: (m: RRMatch) => void;
}) {
  const a = byId.get(match.aId);
  const b = byId.get(match.bId);
  const meta =
    match.state === "live" ? (
      <span className="ff-rr-live">LIVE</span>
    ) : match.state === "done" ? (
      <span className="ff-rr-sched__score">
        {match.aScore}–{match.bScore}
      </span>
    ) : (
      <span className="ff-rr-sched__time">{match.timeLabel ?? "Time TBD"}</span>
    );
  return (
    <button type="button" className="ff-rr-sched__row" onClick={() => onSelect(match)}>
      <span className="ff-rr-sched__teams">
        <span className="ff-rr-sched__team">
          {a ? <EntrantLogo entrant={a} className="ff-rr-sched__logo" /> : null}
          <span className="ff-rr-sched__name">{a?.name ?? "TBD"}</span>
        </span>
        <span className="ff-rr-sched__vs">vs</span>
        <span className="ff-rr-sched__team">
          {b ? <EntrantLogo entrant={b} className="ff-rr-sched__logo" /> : null}
          <span className="ff-rr-sched__name">{b?.name ?? "TBD"}</span>
        </span>
      </span>
      <span className="ff-rr-sched__meta">{meta}</span>
    </button>
  );
}

function RoundSchedule({
  group,
  onSelect,
}: {
  group: RRGroup;
  onSelect: (m: RRMatch) => void;
}) {
  const byId = useMemo(
    () => new Map(group.entrants.map((e) => [e.id, e])),
    [group.entrants],
  );
  // Latest round first (the current/live round sits on top, done rounds below).
  const rounds = useMemo(() => {
    const byRound = new Map<number, RRMatch[]>();
    for (const m of group.matches) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    return [...byRound.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([round, matches]) => ({
        round,
        matches,
        done: matches.every((m) => m.state === "done"),
      }));
  }, [group.matches]);

  if (!rounds.length) {
    return <p className="ff-ticket-empty">No matches scheduled yet.</p>;
  }

  return (
    <div className="ff-rr-sched">
      {rounds.map((r) => (
        <div className="ff-rr-sched__group" key={r.round}>
          <div className="ff-rr-sched__head">
            Round {r.round}
            {r.done ? <span className="ff-rr-sched__done"> · done</span> : null}
          </div>
          <div className="ff-rr-sched__list">
            {r.matches.map((m) => (
              <ScheduleRow key={m.id} match={m} byId={byId} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match detail popup
// ---------------------------------------------------------------------------

function MatchDetailPopup({
  match,
  byId,
  onClose,
}: {
  match: RRMatch;
  byId: Map<string, RREntrant>;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a = byId.get(match.aId);
  const b = byId.get(match.bId);
  const statusLabel =
    match.state === "live" ? "Live" : match.state === "done" ? "Final" : "Scheduled";

  return (
    <div
      className="ff-daypop"
      role="dialog"
      aria-modal="true"
      aria-label="Match detail"
      onClick={onClose}
    >
      <div
        className="ff-daypop__panel ff-rr-detail"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ff-daypop__head">
          <h2 className="ff-daypop__title">Round {match.round}</h2>
          <button className="ff-daypop__close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="ff-daypop__body ff-rr-detail__body">
          <div className="ff-rr-detail__match">
            <div className="ff-rr-detail__side">
              {a ? <EntrantLogo entrant={a} className="ff-rr-detail__logo" /> : null}
              <span className="ff-rr-detail__name">{a?.name ?? "TBD"}</span>
            </div>
            <div className="ff-rr-detail__center">
              {match.state === "upcoming" ? (
                <span className="ff-rr-detail__vs">vs</span>
              ) : (
                <span className="ff-rr-detail__score">
                  {match.aScore} – {match.bScore}
                </span>
              )}
              <span
                className={`ff-rr-detail__status${match.state === "live" ? " ff-rr-detail__status--live" : ""}`}
              >
                {statusLabel}
              </span>
            </div>
            <div className="ff-rr-detail__side">
              {b ? <EntrantLogo entrant={b} className="ff-rr-detail__logo" /> : null}
              <span className="ff-rr-detail__name">{b?.name ?? "TBD"}</span>
            </div>
          </div>
          {match.timeLabel ? (
            <p className="ff-rr-detail__time">{match.timeLabel}</p>
          ) : null}
          {match.url ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={match.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              View match ↗
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The composite
// ---------------------------------------------------------------------------

export function RoundRobinView({ groups }: { groups: RRGroup[] }) {
  const [activeGroup, setActiveGroup] = useState(0);
  const [detail, setDetail] = useState<RRMatch | null>(null);

  const usable = groups.filter((g) => g.entrants.length > 0);
  if (usable.length === 0) {
    return (
      <Bubble title="Groups" span="full">
        <p className="ff-ticket-empty">No round-robin data collected yet.</p>
      </Bubble>
    );
  }

  const groupIndex = Math.min(activeGroup, usable.length - 1);
  const group = usable[groupIndex];
  const byId = new Map(group.entrants.map((e) => [e.id, e]));
  const matrixTitle = group.label ? `${group.label} — Results Matrix` : "Results Matrix";

  return (
    <div className="ff-rr">
      {usable.length > 1 ? (
        <div className="ff-bracket__tabs" role="tablist" aria-label="Groups">
          {usable.map((g, index) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={index === groupIndex}
              className={`ff-bracket__tab${index === groupIndex ? " ff-bracket__tab--active" : ""}`}
              onClick={() => setActiveGroup(index)}
            >
              {g.label || `Group ${index + 1}`}
            </button>
          ))}
        </div>
      ) : null}

      <Bubble title={matrixTitle} span="full" className="ff-bubble--divided">
        <ResultsMatrix group={group} onSelect={setDetail} />
      </Bubble>

      <div className="ff-rr__lower">
        <Bubble title="All Matchups">
          <MatchupGraph group={group} />
        </Bubble>
        <Bubble title="Schedule">
          <RoundSchedule group={group} onSelect={setDetail} />
        </Bubble>
      </div>

      {detail ? (
        <MatchDetailPopup match={detail} byId={byId} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  );
}
