"use client";

import { useRef, useState } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import type { OverfastStatBlock } from "@/lib/overfast";
import {
  OW_ROLES,
  ROLE_LABELS,
  formatCompact,
  formatRank,
  formatTimePlayed,
  formatWinrate,
  type PlayerSnapshot,
  type PlayerStatsData,
  type StatPoint,
} from "@/lib/ow-stats-shared";

// The Overwatch Player Data view: an identity header, headline stat tiles,
// progress-over-time line charts (only once there are ≥2 daily snapshots), and a
// per-role / per-hero breakdown from the latest snapshot. All marks are inline
// SVG (no chart library — the project has no CSS framework and CSP-safe self-
// contained output is the norm). Single-series charts, so each is titled rather
// than legended, per the dataviz guidance.

export function PlayerStatsView({
  data,
  battletag,
  stale = false,
}: {
  data: PlayerStatsData;
  battletag: string;
  stale?: boolean;
}) {
  const { latest } = data;

  return (
    <>
      <IdentityBubble
        latest={latest}
        battletag={battletag}
        snapshotCount={data.snapshotCount}
        stale={stale}
      />
      <HeadlineBubble latest={latest} />
      <ProgressBubble series={data.series} count={data.snapshotCount} />
      <BreakdownBubble stats={data.statsSummary} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Identity — the "what this tab is" first card.
// ---------------------------------------------------------------------------

function IdentityBubble({
  latest,
  battletag,
  snapshotCount,
  stale,
}: {
  latest: PlayerSnapshot;
  battletag: string;
  snapshotCount: number;
  stale: boolean;
}) {
  const avatar = latest.avatarUrl ? (
    // Blizzard/OverFast CDN image; the portal (unlike an artifact) allows remote
    // images. Fixed-size square via the class, alt text from the tag.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="ff-owhero__avatar"
      src={latest.avatarUrl}
      alt=""
      width={56}
      height={56}
    />
  ) : undefined;

  return (
    <Bubble
      title={battletag}
      span="full"
      media={avatar}
      actions={
        latest.endorsementLevel != null ? (
          <span className="ff-owbadge" title="Endorsement level">
            Endorsement {latest.endorsementLevel}
          </span>
        ) : null
      }
    >
      {stale ? (
        <p className="ff-owstale">
          Showing your last saved snapshot — we couldn&apos;t reach the live
          service just now.
        </p>
      ) : null}

      <div className="ff-owranks">
        {OW_ROLES.map((role) => {
          const rank = latest.ranks[role];
          return (
            <div className="ff-owrank" data-role={role} key={role}>
              <span className="ff-owrank__role">{ROLE_LABELS[role]}</span>
              <span className="ff-owrank__value">{formatRank(rank)}</span>
            </div>
          );
        })}
        {latest.ranks.open.division ? (
          <div className="ff-owrank" data-role="open">
            <span className="ff-owrank__role">{ROLE_LABELS.open}</span>
            <span className="ff-owrank__value">
              {formatRank(latest.ranks.open)}
            </span>
          </div>
        ) : null}
      </div>

      <div className="ff-owmeta">
        {latest.title ? (
          <span className="ff-owmeta__item">{latest.title}</span>
        ) : null}
        {latest.compSeason != null ? (
          <span className="ff-owmeta__item">Season {latest.compSeason}</span>
        ) : null}
        <span className="ff-owmeta__item">
          {snapshotCount === 1
            ? "1 snapshot"
            : `${snapshotCount} snapshots`}{" "}
          · updated {formatWhen(latest.capturedAt)}
        </span>
      </div>
    </Bubble>
  );
}

// ---------------------------------------------------------------------------
// Headline stat tiles.
// ---------------------------------------------------------------------------

function HeadlineBubble({ latest }: { latest: PlayerSnapshot }) {
  const tiles: { label: string; value: string; hi?: boolean }[] = [
    { label: "Games Played", value: numOrDash(latest.gamesPlayed) },
    { label: "Win Rate", value: formatWinrate(latest.winrate), hi: true },
    { label: "K/D/A", value: latest.kda != null ? latest.kda.toFixed(2) : "—" },
    { label: "Time Played", value: formatTimePlayed(latest.timePlayed) },
    { label: "Wins", value: numOrDash(latest.gamesWon) },
    { label: "Losses", value: numOrDash(latest.gamesLost) },
    { label: "Eliminations", value: formatCompact(latest.totalEliminations) },
    { label: "Healing", value: formatCompact(latest.totalHealing) },
  ];

  return (
    <Bubble title="Career Overview">
      <div className="ff-owstats-grid">
        {tiles.map((t) => (
          <div className="ff-stat" key={t.label}>
            <span className="ff-stat__label">{t.label}</span>
            <span className={`ff-stat__value${t.hi ? " ff-stat__value--hi" : ""}`}>
              {t.value}
            </span>
          </div>
        ))}
      </div>
    </Bubble>
  );
}

// ---------------------------------------------------------------------------
// Progress over time — small-multiple line charts.
// ---------------------------------------------------------------------------

function ProgressBubble({
  series,
  count,
}: {
  series: PlayerStatsData["series"];
  count: number;
}) {
  if (count < 2) {
    return (
      <Bubble title="Progress Over Time">
        <p className="ff-bubble__note">
          We take a snapshot of your career about once a day. Once there are a few
          of them, this is where you&apos;ll see how your win rate, K/D/A and hours
          are trending. Check back tomorrow.
        </p>
      </Bubble>
    );
  }

  return (
    <Bubble title="Progress Over Time">
      <div className="ff-owcharts">
        <LineChart title="Games Played" values={series.gamesPlayed} format={numOrDash} />
        <LineChart
          title="Win Rate"
          values={series.winrate}
          format={(n) => formatWinrate(n)}
        />
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

/** A single-series SVG line chart with a hover crosshair + tooltip. */
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

  // Plot only points that have a value, positioned by capture time.
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
    // Flat series — pad so the line sits mid-height rather than on an edge.
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
    const frac = (e.clientX - rect.left) / rect.width;
    const target = t0 + frac * span;
    // Nearest point in time.
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

// ---------------------------------------------------------------------------
// Per-role / per-hero breakdown.
// ---------------------------------------------------------------------------

function BreakdownBubble({
  stats,
}: {
  stats: PlayerStatsData["statsSummary"];
}) {
  if (!stats) return null;

  const roleRows = OW_ROLES.map((role) => ({
    key: role,
    label: ROLE_LABELS[role],
    block: stats.roles?.[role] ?? null,
  })).filter((r) => r.block);

  const heroRows = Object.entries(stats.heroes ?? {})
    .map(([key, block]) => ({ key, label: prettyHero(key), block }))
    .filter((h) => h.block && (h.block.time_played ?? 0) > 0)
    .sort((a, b) => (b.block.time_played ?? 0) - (a.block.time_played ?? 0))
    .slice(0, 8);

  if (roleRows.length === 0 && heroRows.length === 0) return null;

  return (
    <Bubble title="By Role & Hero">
      {roleRows.length > 0 ? (
        <StatTable
          caption="Roles"
          rows={roleRows.map((r) => ({ label: r.label, block: r.block! }))}
        />
      ) : null}
      {heroRows.length > 0 ? (
        <StatTable
          caption="Most Played Heroes"
          rows={heroRows.map((h) => ({ label: h.label, block: h.block }))}
        />
      ) : null}
    </Bubble>
  );
}

function StatTable({
  caption,
  rows,
}: {
  caption: string;
  rows: { label: string; block: OverfastStatBlock }[];
}) {
  return (
    <div className="ff-owtable-wrap">
      <table className="ff-owtable">
        <caption className="ff-owtable__caption">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{caption === "Roles" ? "Role" : "Hero"}</th>
            <th scope="col">Games</th>
            <th scope="col">Win %</th>
            <th scope="col">K/D/A</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{numOrDash(r.block.games_played)}</td>
              <td>{formatWinrate(r.block.winrate)}</td>
              <td>{r.block.kda != null ? r.block.kda.toFixed(2) : "—"}</td>
              <td>{formatTimePlayed(r.block.time_played)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function numOrDash(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

/** "soldier_76" → "Soldier 76", "wrecking_ball" → "Wrecking Ball". */
function prettyHero(key: string): string {
  return key
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Relative-ish "updated" label: today / N days ago / a date. */
function formatWhen(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDay(ms);
}
