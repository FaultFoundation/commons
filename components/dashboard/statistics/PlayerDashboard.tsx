"use client";

import { useRef, useState } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import type { OverfastRank, OverfastStatBlock } from "@/lib/overfast";
import {
  COMPARE_METRICS,
  OW_ROLES,
  ROLE_LABELS,
  buildHeroComparison,
  formatMetric,
  formatRank,
  formatTimePlayed,
  formatWinrate,
  prettyHeroKey,
  type CompareMetric,
  type HeroMap,
  type PlayerStatsData,
  type StatPoint,
} from "@/lib/ow-stats-shared";

// The Overwatch-career-profile-style dashboard, in our bubbles: a three-column
// layout (Time Played · Most Played Heroes + competitive ranks · Hero
// Comparison) modeled on Blizzard's own career screen, then our own
// Progress-Over-Time charts underneath (the payoff of the daily snapshots —
// something OW's own profile doesn't show). All marks are inline SVG; hero art
// comes from OverFast's /heroes portraits.

export function PlayerDashboard({
  data,
  heroes,
  stale = false,
}: {
  data: PlayerStatsData;
  heroes: HeroMap;
  stale?: boolean;
}) {
  return (
    <>
      {stale ? (
        <p className="ff-owstale">
          Showing your last saved snapshot — we couldn&apos;t reach the live
          service just now.
        </p>
      ) : null}
      <div className="ff-owcols">
        <TimePlayedCard data={data} />
        <HeroesCard data={data} heroes={heroes} />
        <ComparisonCard data={data} heroes={heroes} />
      </div>
      <ProgressCard series={data.series} count={data.snapshotCount} />
    </>
  );
}

// --- Column 1: Time Played -------------------------------------------------

function TimePlayedCard({ data }: { data: PlayerStatsData }) {
  const roles = data.statsSummary?.roles ?? null;
  const roleTimes = OW_ROLES.map((role) => ({
    role,
    seconds: roles?.[role]?.time_played ?? 0,
  }));
  const max = Math.max(1, ...roleTimes.map((r) => r.seconds));

  return (
    <Bubble title="Time Played">
      <div className="ff-owtime__total">{formatTimePlayed(data.latest.timePlayed)}</div>
      <div className="ff-owtime">
        {roleTimes.map(({ role, seconds }) => (
          <div className="ff-owtime__row" key={role}>
            <div className="ff-owtime__head">
              <span className="ff-owtime__label" data-role={role}>
                {ROLE_LABELS[role]}
              </span>
              <span className="ff-owtime__value">{formatTimePlayed(seconds)}</span>
            </div>
            <div className="ff-owtime__track">
              <div
                className="ff-owtime__bar"
                data-role={role}
                style={{ width: `${(seconds / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="ff-owstrip">
        <Stat label="Games" value={numOrDash(data.latest.gamesPlayed)} />
        <Stat label="Win Rate" value={formatWinrate(data.latest.winrate)} hi />
        <Stat
          label="K/D/A"
          value={data.latest.kda != null ? data.latest.kda.toFixed(2) : "—"}
        />
      </div>
    </Bubble>
  );
}

// --- Column 2: Most Played Heroes + competitive ranks ----------------------

function HeroesCard({
  data,
  heroes,
}: {
  data: PlayerStatsData;
  heroes: HeroMap;
}) {
  const top = topHeroes(data.statsSummary?.heroes, 3);
  const platform = data.latest.platform === "console" ? "console" : "pc";
  const comp = data.summary?.competitive?.[platform] ?? null;

  return (
    <Bubble title="Most Played Heroes">
      <div className="ff-owheroes">
        {top.length === 0 ? (
          <p className="ff-bubble__note">No hero data yet.</p>
        ) : (
          top.map(({ key, block }) => {
            const meta = heroes[key];
            return (
              <div className="ff-owhero-row" key={key}>
                <HeroPortrait
                  portrait={meta?.portrait ?? null}
                  role={meta?.role ?? null}
                />
                <div className="ff-owhero-row__meta">
                  <span className="ff-owhero-row__name">
                    {meta?.name ?? prettyHeroKey(key)}
                  </span>
                  <span className="ff-owhero-row__sub">
                    {formatTimePlayed(block.time_played)} · {numOrDash(block.games_played)} games
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="ff-owcomp">
        <div className="ff-owcomp__head">
          <span>Role</span>
          <span>Rank</span>
          <span>Won</span>
          <span>Win %</span>
        </div>
        {OW_ROLES.map((role) => {
          const rank = data.latest.ranks[role];
          const roleBlock = data.statsSummary?.roles?.[role] ?? null;
          const icon = compIcon(comp?.[role] ?? null);
          return (
            <div className="ff-owcomp__row" key={role}>
              <span className="ff-owcomp__role" data-role={role}>
                {ROLE_LABELS[role]}
              </span>
              <span className="ff-owcomp__rank">
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ff-owcomp__rankicon" src={icon} alt="" />
                ) : null}
                {formatRank(rank)}
              </span>
              <span className="ff-owcomp__num">{numOrDash(roleBlock?.games_won)}</span>
              <span className="ff-owcomp__num">{formatWinrate(roleBlock?.winrate)}</span>
            </div>
          );
        })}
      </div>
    </Bubble>
  );
}

// --- Column 3: Hero Comparison ---------------------------------------------

function ComparisonCard({
  data,
  heroes,
}: {
  data: PlayerStatsData;
  heroes: HeroMap;
}) {
  const [metric, setMetric] = useState<CompareMetric>("time_played");
  const rows = buildHeroComparison(data.statsSummary?.heroes, heroes, metric, 10);
  const max = rows.length ? rows[0].value : 1;

  return (
    <Bubble
      title="Hero Comparison"
      actions={
        <select
          className="ff-owselect"
          value={metric}
          onChange={(e) => setMetric(e.target.value as CompareMetric)}
          aria-label="Compare heroes by"
        >
          {COMPARE_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      }
    >
      {rows.length === 0 ? (
        <p className="ff-bubble__note">No hero data yet.</p>
      ) : (
        <div className="ff-owcompare">
          {rows.map((row, i) => (
            <div
              className={`ff-owcompare__row${i === 0 ? " ff-owcompare__row--top" : ""}`}
              key={row.key}
            >
              <HeroPortrait portrait={row.portrait} role={row.role} small />
              <div className="ff-owcompare__main">
                <div className="ff-owcompare__labels">
                  <span className="ff-owcompare__name">{row.name}</span>
                  <span className="ff-owcompare__val">
                    {formatMetric(metric, row.value)}
                  </span>
                </div>
                <div className="ff-owcompare__track">
                  <div
                    className={`ff-owcompare__bar${i === 0 ? " ff-owcompare__bar--top" : ""}`}
                    style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Bubble>
  );
}

// --- Progress over time (our own charts, below the OW-style dashboard) ------

function ProgressCard({
  series,
  count,
}: {
  series: PlayerStatsData["series"];
  count: number;
}) {
  if (count < 2) {
    return (
      <Bubble title="Progress Over Time" span="full">
        <p className="ff-bubble__note">
          We take a snapshot of your career about once a day. Once there are a few,
          this is where your win rate, K/D/A and hours trend over time — check back
          tomorrow.
        </p>
      </Bubble>
    );
  }
  return (
    <Bubble title="Progress Over Time" span="full">
      <div className="ff-owcharts">
        <LineChart title="Games Played" values={series.gamesPlayed} format={numOrDash} />
        <LineChart title="Win Rate" values={series.winrate} format={(n) => formatWinrate(n)} />
        <LineChart
          title="K/D/A"
          values={series.kda}
          format={(n) => (n == null ? "—" : n.toFixed(2))}
        />
        <LineChart
          title="Time Played"
          values={series.timePlayed}
          format={(n) => formatTimePlayed(n)}
        />
      </div>
    </Bubble>
  );
}

// --- Small pieces ----------------------------------------------------------

function Stat({ label, value, hi }: { label: string; value: string; hi?: boolean }) {
  return (
    <div className="ff-stat">
      <span className="ff-stat__label">{label}</span>
      <span className={`ff-stat__value${hi ? " ff-stat__value--hi" : ""}`}>{value}</span>
    </div>
  );
}

function HeroPortrait({
  portrait,
  role,
  small,
}: {
  portrait: string | null;
  role: string | null;
  small?: boolean;
}) {
  const cls = `ff-owportrait${small ? " ff-owportrait--sm" : ""}`;
  if (!portrait) return <div className={`${cls} ff-owportrait--empty`} data-role={role ?? undefined} aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cls} data-role={role ?? undefined} src={portrait} alt="" />
  );
}

/** Top-N heroes by time played from the stats/summary heroes map. */
function topHeroes(
  heroes: Record<string, OverfastStatBlock> | null | undefined,
  n: number,
): { key: string; block: OverfastStatBlock }[] {
  if (!heroes) return [];
  return Object.entries(heroes)
    .map(([key, block]) => ({ key, block }))
    .filter((h) => (h.block.time_played ?? 0) > 0)
    .sort((a, b) => (b.block.time_played ?? 0) - (a.block.time_played ?? 0))
    .slice(0, n);
}

/** A role's rank/tier icon URL from the summary competitive block, if any. */
function compIcon(rank: OverfastRank | null): string | null {
  return rank?.rank_icon ?? rank?.tier_icon ?? null;
}

function numOrDash(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// --- The SVG line chart (single series, hover crosshair + tooltip) ---------

function LineChart({
  title,
  values,
  format,
}: {
  title: string;
  values: StatPoint[];
  format: (n: number | null) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const pts = values.filter((p): p is { t: number; value: number } => p.value != null);
  if (pts.length < 2) {
    return (
      <figure className="ff-owchart">
        <figcaption className="ff-owchart__title">{title}</figcaption>
        <p className="ff-owchart__empty">Not enough history yet</p>
      </figure>
    );
  }

  const t0 = pts[0].t;
  const tN = pts[pts.length - 1].t;
  const span = tN - t0 || 1;
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const W = 320;
  const H = 120;
  const padX = 6;
  const padY = 12;
  const x = (t: number) => padX + ((t - t0) / span) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (H - padY * 2);

  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${padX},${H - padY} ${line} ${(W - padX).toFixed(1)},${H - padY}`;
  const last = pts[pts.length - 1];
  const active = hover != null ? pts[hover] : null;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const target = t0 + ((e.clientX - rect.left) / rect.width) * span;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].t - target);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  }

  return (
    <figure className="ff-owchart">
      <figcaption className="ff-owchart__title">
        {title}
        <span className="ff-owchart__last">{format(last.value)}</span>
      </figcaption>
      <div
        className="ff-owchart__plot"
        ref={wrapRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          className="ff-owchart__svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} over time`}
        >
          <polyline className="ff-owchart__area" points={area} />
          <polyline
            className="ff-owchart__line"
            points={line}
            vectorEffect="non-scaling-stroke"
          />
          {active ? (
            <line
              className="ff-owchart__crosshair"
              x1={x(active.t)}
              x2={x(active.t)}
              y1={padY}
              y2={H - padY}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          <circle
            className="ff-owchart__dot"
            cx={x((active ?? last).t)}
            cy={y((active ?? last).value)}
            r={3}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {active ? (
          <div
            className="ff-owchart__tip"
            style={{ left: `${((active.t - t0) / span) * 100}%` }}
          >
            <span className="ff-owchart__tip-value">{format(active.value)}</span>
            <span className="ff-owchart__tip-date">{formatDay(active.t)}</span>
          </div>
        ) : null}
      </div>
      <div className="ff-owchart__axis">
        <span>{formatDay(t0)}</span>
        <span>{formatDay(tN)}</span>
      </div>
    </figure>
  );
}
