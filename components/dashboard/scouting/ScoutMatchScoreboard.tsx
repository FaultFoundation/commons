"use client";

import { useState } from "react";

import {
  formatCompact,
  formatKd,
  type ScoutMatchDetail,
  type ScoutScoreboardPlayer,
  type ScoutScoreboardTeam,
} from "@/lib/faceit-scouting-shared";

// The expanded body of a match row (mockup #2): per-round tabs, both teams'
// scoreboards, a match-overview panel and hero bans. When a match carries more
// than one round (a control map / Bo>1 collected as one match), tabs switch
// between "Overall" (the aggregate columns) and each round's own numbers.

const RESULT_LABEL = { win: "WIN", loss: "LOSS", draw: "DRAW" } as const;

type Line = {
  elims: number | null;
  deaths: number | null;
  assists: number | null;
  kd: number | null;
  dmg: number | null;
  heal: number | null;
  mit: number | null;
};

/** The stats to show for a player at the selected round (null = aggregate). */
function lineFor(p: ScoutScoreboardPlayer, round: number | null): Line | null {
  if (round == null) {
    return {
      elims: p.eliminations,
      deaths: p.deaths,
      assists: p.assists,
      kd: p.kdRatio,
      dmg: p.damageDealt,
      heal: p.healingDone,
      mit: p.damageMitigated,
    };
  }
  const r = p.rounds[round - 1];
  if (!r) return null;
  return {
    elims: r.eliminations,
    deaths: r.deaths,
    assists: r.assists,
    kd: r.kdRatio,
    dmg: r.damageDealt,
    heal: r.healingDone,
    mit: r.damageMitigated,
  };
}

function kdTone(kd: number | null): string {
  if (kd == null) return "";
  if (kd >= 1) return " ff-sb__kd--pos";
  return " ff-sb__kd--neg";
}

function TeamTable({
  team,
  round,
}: {
  team: ScoutScoreboardTeam;
  round: number | null;
}) {
  return (
    <div className="ff-sb__team">
      <div className="ff-sb__teamhead">
        <span className="ff-sb__teamname">{team.name ?? "Team"}</span>
        {team.result ? (
          <span className={`ff-sb__teamres ff-sb__teamres--${team.result}`}>
            {RESULT_LABEL[team.result]}
          </span>
        ) : null}
        {team.score != null ? (
          <span className="ff-sb__teamscore">{team.score}</span>
        ) : null}
      </div>
      <table className="ff-sb__table">
        <thead>
          <tr>
            <th className="ff-sb__th ff-sb__th--player">Player</th>
            <th className="ff-sb__th">K/D/A</th>
            <th className="ff-sb__th">KD</th>
            <th className="ff-sb__th">DMG</th>
            <th className="ff-sb__th">HEAL</th>
            <th className="ff-sb__th">MIT</th>
          </tr>
        </thead>
        <tbody>
          {team.players.map((p) => {
            const line = lineFor(p, round);
            return (
              <tr
                key={p.playerId}
                className={`ff-sb__row${p.isScouted ? " ff-sb__row--scouted" : ""}`}
              >
                <td className="ff-sb__player">
                  <span className="ff-sb__nick">{p.nickname ?? "—"}</span>
                  {p.role ? <span className="ff-sb__role">{p.role}</span> : null}
                </td>
                {line ? (
                  <>
                    <td className="ff-sb__cell">
                      {line.elims ?? 0}/{line.deaths ?? 0}/{line.assists ?? 0}
                    </td>
                    <td className={`ff-sb__cell ff-sb__kd${kdTone(line.kd)}`}>
                      {formatKd(line.kd)}
                    </td>
                    <td className="ff-sb__cell">{formatCompact(line.dmg)}</td>
                    <td className="ff-sb__cell">{formatCompact(line.heal)}</td>
                    <td className="ff-sb__cell">{formatCompact(line.mit)}</td>
                  </>
                ) : (
                  <td className="ff-sb__cell ff-sb__cell--empty" colSpan={5}>
                    —
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OverviewPanel({ detail }: { detail: ScoutMatchDetail }) {
  const roundLabel = [
    detail.round != null ? `Round ${detail.round}` : null,
    detail.groupNum != null ? `Group ${detail.groupNum}` : null,
    detail.bestOf != null ? `Bo${detail.bestOf}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const facts: { label: string; value: string }[] = [];
  if (detail.serverName) facts.push({ label: "Server", value: detail.serverName });
  // The maps actually played, in order — `detail.mapName` is only the series'
  // first veto pick and is the fallback for pre-rounds matches.
  const played = detail.rounds.filter((r) => r.mapName);
  if (played.length) {
    facts.push({
      label: played.length === 1 ? "Map" : "Maps",
      value: played
        .map((r) =>
          r.scoreSummary ? `${r.mapName} (${r.scoreSummary})` : (r.mapName as string),
        )
        .join(", "),
    });
  } else if (detail.mapName) {
    facts.push({
      label: "Map",
      value: detail.mapMode ? `${detail.mapName} · ${detail.mapMode}` : detail.mapName,
    });
  }
  if (roundLabel) facts.push({ label: "Round", value: roundLabel });
  if (detail.replayCodes.length) {
    facts.push({ label: "Replay", value: detail.replayCodes.join(", ") });
  }

  return (
    <div className="ff-sb__panel">
      <h4 className="ff-sb__paneltitle">Match overview</h4>
      <dl className="ff-tfacts">
        {facts.map((f) => (
          <div className="ff-tfacts__item" key={f.label}>
            <dt className="ff-tfacts__label">{f.label}</dt>
            <dd className="ff-tfacts__value">{f.value}</dd>
          </div>
        ))}
        {detail.faceitUrl ? (
          <div className="ff-tfacts__item">
            <dt className="ff-tfacts__label">Link</dt>
            <dd className="ff-tfacts__value">
              <a href={detail.faceitUrl} target="_blank" rel="noreferrer">
                View on FACEIT
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function ScoutMatchScoreboard({ detail }: { detail: ScoutMatchDetail }) {
  const [round, setRound] = useState<number | null>(null);

  if (!detail.detailed) {
    return (
      <p className="ff-bubble__note">
        Full scoreboard not collected for this match yet. Run a{" "}
        <strong>Deep scan</strong> to pull every match&apos;s detail.
      </p>
    );
  }

  const hasRounds = detail.roundCount > 1;

  return (
    <div className="ff-sb">
      {hasRounds ? (
        <div className="ff-sb__tabs" role="tablist" aria-label="Rounds">
          <button
            type="button"
            role="tab"
            aria-selected={round == null}
            className={`ff-sb__tab${round == null ? " ff-sb__tab--on" : ""}`}
            onClick={() => setRound(null)}
          >
            Overall
          </button>
          {Array.from({ length: detail.roundCount }, (_, i) => i + 1).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={round === r}
              className={`ff-sb__tab${round === r ? " ff-sb__tab--on" : ""}`}
              onClick={() => setRound(r)}
            >
              {/* Each round of a series IS a map, so name it — falling back to
                  the index for matches collected before rounds were stored. */}
              {detail.rounds.find((m) => m.round === r)?.mapName ?? `Round ${r}`}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ff-sb__grid">
        <div className="ff-sb__teams">
          {detail.teams.map((t) => (
            <TeamTable key={t.faction} team={t} round={round} />
          ))}
        </div>
        <aside className="ff-sb__side">
          <OverviewPanel detail={detail} />
          {detail.heroBans.length ? (
            <div className="ff-sb__panel">
              <h4 className="ff-sb__paneltitle">Hero bans</h4>
              <div className="ff-sb__bans">
                {detail.heroBans.map((b) => (
                  <span className="ff-sb__ban" key={b}>
                    {b}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
