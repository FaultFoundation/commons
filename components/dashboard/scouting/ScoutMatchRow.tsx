"use client";

import { useCallback, useState } from "react";

import {
  type ScoutMatch,
  type ScoutMatchDetail,
} from "@/lib/faceit-scouting-shared";
import { ScoutMatchScoreboard } from "@/components/dashboard/scouting/ScoutMatchScoreboard";

// One expandable match in the Matches tab (mockup #2): a summary row (result,
// map, score, own K/D/A, date) that opens to the full both-team scoreboard. The
// heavy detail is fetched lazily on first expand (GET /api/scouting/match), so a
// long list never carries every match's per-player payload up front. Client-
// controlled open state (not a native <details>) precisely so the fetch is gated
// on the first open.

const RESULT_LABEL = { win: "Win", loss: "Loss", draw: "Draw" } as const;

function formatWhen(ms: number | null): string {
  if (!ms) return "Date TBD";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatKda(m: ScoutMatch): string | null {
  if (m.eliminations == null && m.deaths == null && m.assists == null) return null;
  return `${m.eliminations ?? 0}/${m.deaths ?? 0}/${m.assists ?? 0}`;
}

export function ScoutMatchRow({
  match,
  scoutedPlayerId,
}: {
  match: ScoutMatch;
  scoutedPlayerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ScoutMatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (!next || detail || loading) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({
        match_id: match.matchId,
        player: scoutedPlayerId,
      });
      const res = await fetch(`/api/scouting/match?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) setDetail((await res.json()) as ScoutMatchDetail);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [open, detail, loading, match.matchId, scoutedPlayerId]);

  const score =
    match.scoreFor != null && match.scoreAgainst != null
      ? `${match.scoreFor}–${match.scoreAgainst}`
      : null;
  const kda = formatKda(match);
  const meta = [match.mapMode, match.bestOf ? `Bo${match.bestOf}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`ff-scoutmatch${open ? " ff-scoutmatch--open" : ""}`}>
      <button
        type="button"
        className="ff-scoutmatch__summary"
        onClick={toggle}
        aria-expanded={open}
      >
        {match.result ? (
          <span className={`ff-scoutmatch__res ff-scoutmatch__res--${match.result}`}>
            {RESULT_LABEL[match.result]}
          </span>
        ) : (
          <span className="ff-scoutmatch__res ff-scoutmatch__res--none">—</span>
        )}
        <span className="ff-scoutmatch__main">
          <span className="ff-scoutmatch__map">
            {match.mapName ?? match.competitionName ?? "FACEIT match"}
          </span>
          {meta ? <span className="ff-scoutmatch__meta">{meta}</span> : null}
        </span>
        <span className="ff-scoutmatch__score">{score ?? "—"}</span>
        {kda ? <span className="ff-scoutmatch__kda">K/D/A {kda}</span> : null}
        <span className="ff-scoutmatch__when">{formatWhen(match.startedAt)}</span>
        <span className="ff-scoutmatch__chev" aria-hidden="true">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" width="13" height="13">
            <path d="M1.5 4L6 8L10.5 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <div className="ff-scoutmatch__body">
          {loading ? (
            <p className="ff-bubble__note">Loading match…</p>
          ) : error ? (
            <p className="ff-bubble__note">Couldn&apos;t load this match — try again.</p>
          ) : detail ? (
            <ScoutMatchScoreboard detail={detail} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
