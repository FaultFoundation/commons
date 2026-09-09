"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { FaceitMatchList } from "@/components/dashboard/scouting/FaceitMatchList";
import { MapWinrateChart } from "@/components/dashboard/scouting/MapWinrateChart";
import { ScoutAnalytics } from "@/components/dashboard/scouting/ScoutAnalytics";
import { ScoutDeepLoading } from "@/components/dashboard/scouting/ScoutDeepLoading";
import { ScoutFacts } from "@/components/dashboard/scouting/ScoutFacts";
import { ScoutModeToggle } from "@/components/dashboard/scouting/ScoutModeToggle";
import { StatLoading } from "@/components/dashboard/statistics/StatLoading";
import {
  SCOUT_STATUS_MESSAGES,
  formatElo,
  normalizeNickname,
  type ScoutMode,
  type ScoutResponse,
} from "@/lib/faceit-scouting-shared";
import { usePersistentState } from "@/lib/view-state";

// The whole Scouting surface (Experimental → Scouting). Search ANY FACEIT
// Overwatch player by nickname; the result is a tournament-view-style profile —
// a hero header, Overview / Matches tabs, and a two-column Overview (analytics
// graph cards + Win Rate by Map on the left, a Details facts rail on the right).
//
// Two search depths (ScoutModeToggle). A QUICK search pulls the recent ~50 games
// fast and shows results as they land. A DEEP search opens a load screen and
// drives the ow-data Worker's bounded, resumable collection to completion (a loop
// of POST /api/scouting/advance, reading real progress), so the stats are exact —
// with a safety cap for extreme accounts.
//
// Three calls behind it all: a READ (GET /api/scouting/player) hydrates from the
// cache without triggering anything; a SEARCH (POST /api/scouting/search) asks the
// Worker to collect; an ADVANCE (POST /api/scouting/advance) pushes a deep
// collection forward one chunk.

const CACHE_KEY = "ff-scouting-v1";
const POLL_MS = 4000;
const MAX_POLLS = 4;

// Deep drive-to-completion bounds (the safety cap the user signed off on).
const MAX_ADVANCE = 80;
const DEEP_CAP_MATCHES = 2000;
const ADVANCE_RETRY_MS = 2500;
const MAX_ADVANCE_FAILS = 5;

/** How many rows the Matches tab shows before "Show more". */
const PAGE = 20;

type Cached = { nickname: string; resp: ScoutResponse };
type Tab = "overview" | "matches";
type DeepState = { active: boolean; total: number | null; detailed: number | null };

function readCache(): Cached | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function writeCache(nickname: string, resp: ScoutResponse) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ nickname, resp }));
  } catch {
    // Caching is an optimization, never a must.
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ScoutingView({ initialQuery }: { initialQuery: string }) {
  // The search box + depth remember the last choice across visits; ?q= / the
  // member's own handle is the fallback the server seeded.
  const [query, setQuery, restored] = usePersistentState<string>(
    "scouting:query",
    initialQuery,
    (stored) =>
      typeof stored === "string" && stored.length <= 64 ? stored : undefined,
  );
  const [mode, setMode] = usePersistentState<ScoutMode>(
    "scouting:mode",
    "quick",
    (stored) => (stored === "quick" || stored === "deep" ? stored : undefined),
  );
  const [tab, setTab] = usePersistentState<Tab>(
    "scouting:tab",
    "overview",
    (stored) => (stored === "overview" || stored === "matches" ? stored : undefined),
  );

  const [resp, setResp] = useState<ScoutResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deep, setDeep] = useState<DeepState>({ active: false, total: null, detailed: null });
  const [deepCapped, setDeepCapped] = useState(false);
  const [shown, setShown] = useState(PAGE);

  const alive = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollsLeft = useRef(0);
  // The nickname currently on screen (drives Refresh / Deep scan / polling).
  const activeNick = useRef<string | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    pollsLeft.current = 0;
  }, []);

  const applyResp = useCallback((nickname: string, data: ScoutResponse) => {
    if (!alive.current) return;
    setResp(data);
    setShown(PAGE);
    const shownNick = data.player?.nickname ?? nickname;
    activeNick.current = shownNick;
    writeCache(shownNick, data);
  }, []);

  // A cache-only read (no Worker trigger). Also used by the background poll and
  // the Refresh control.
  const runRead = useCallback(
    async (nickname: string, playerId?: string): Promise<ScoutResponse | null> => {
      const params = new URLSearchParams();
      if (playerId) params.set("player_id", playerId);
      else params.set("nickname", nickname);
      try {
        const res = await fetch(`/api/scouting/player?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as ScoutResponse;
      } catch {
        return null;
      }
    },
    [],
  );

  // Re-read a handful of times while a quick search is still collecting, so maps
  // and scoreboards surface on their own. Stops as soon as status is terminal.
  const schedulePoll = useCallback(
    (nickname: string, playerId?: string) => {
      clearPoll();
      pollsLeft.current = MAX_POLLS;
      const tick = async () => {
        if (!alive.current || pollsLeft.current <= 0) return;
        pollsLeft.current -= 1;
        const data = await runRead(nickname, playerId);
        if (!alive.current) return;
        if (data && data.status !== "idle") {
          applyResp(nickname, data);
          if (data.status === "collecting" && pollsLeft.current > 0) {
            pollTimer.current = setTimeout(tick, POLL_MS);
          }
        } else if (pollsLeft.current > 0) {
          pollTimer.current = setTimeout(tick, POLL_MS);
        }
      };
      pollTimer.current = setTimeout(tick, POLL_MS);
    },
    [applyResp, clearPoll, runRead],
  );

  // A quick search: ask the Worker to collect, then read back + poll a few times.
  const runQuick = useCallback(
    async (raw: string) => {
      const nickname = normalizeNickname(raw);
      if (!nickname) return;
      clearPoll();
      setLoading(true);
      setResp(null);
      setDeepCapped(false);
      try {
        const res = await fetch("/api/scouting/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname, mode: "quick" }),
        });
        const data = res.ok
          ? ((await res.json()) as ScoutResponse)
          : ({ status: "error", player: null, data: null } as ScoutResponse);
        if (!alive.current) return;
        applyResp(nickname, data);
        if (data.status === "collecting") {
          schedulePoll(nickname, data.player?.playerId);
        }
      } catch {
        if (alive.current) setResp({ status: "error", player: null, data: null });
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [applyResp, clearPoll, schedulePoll],
  );

  // A deep search: register + first page, then loop /advance behind the load
  // screen until the whole history is collected (status "ready") or a safety cap.
  const runDeep = useCallback(
    async (raw: string) => {
      const nickname = normalizeNickname(raw);
      if (!nickname) return;
      clearPoll();
      setLoading(false);
      setResp(null);
      setDeepCapped(false);
      setDeep({ active: true, total: null, detailed: null });

      const post = async (path: string, body: unknown): Promise<ScoutResponse | null> => {
        try {
          const res = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return res.ok ? ((await res.json()) as ScoutResponse) : null;
        } catch {
          return null;
        }
      };

      // 1. Register the deep search + do the first page.
      let current =
        (await post("/api/scouting/search", { nickname, mode: "deep" })) ??
        ({ status: "error", player: null, data: null } as ScoutResponse);
      if (!alive.current) return;

      // A definitive non-result (not found / unconfigured / error with no player)
      // ends here — nothing to advance.
      if (!current.player) {
        setDeep({ active: false, total: null, detailed: null });
        applyResp(nickname, current);
        return;
      }

      const playerId = current.player.playerId;
      let total = current.progress?.total ?? null;
      let detailed = current.progress?.detailed ?? null;
      setDeep({ active: true, total, detailed });

      // 2. Drive to completion (unless the trigger already reported it done).
      let fails = 0;
      let capped = false;
      for (let i = 0; current.status !== "ready" && i < MAX_ADVANCE; i++) {
        if (!alive.current) return;
        const adv = await post("/api/scouting/advance", {
          player_id: playerId,
          mode: "deep",
        });
        if (!alive.current) return;
        if (!adv) {
          if (++fails >= MAX_ADVANCE_FAILS) break;
          await sleep(ADVANCE_RETRY_MS);
          continue;
        }
        fails = 0;
        current = adv;
        // A terminal non-collecting status (e.g. the Worker went unreachable) —
        // stop rather than spin out the whole budget.
        if (adv.status === "not_found" || adv.status === "not_configured") break;
        total = adv.progress?.total ?? total;
        detailed = adv.progress?.detailed ?? detailed;
        setDeep({ active: true, total, detailed });
        if (adv.status === "ready") break;
        if ((total ?? 0) >= DEEP_CAP_MATCHES) {
          capped = true;
          break;
        }
      }

      // 3. Done — drop the load screen and show the collected profile.
      if (!alive.current) return;
      setDeep({ active: false, total: null, detailed: null });
      setDeepCapped(capped || (current.status !== "ready" && (total ?? 0) > 0));
      applyResp(nickname, current);
    },
    [applyResp, clearPoll],
  );

  const runSearch = useCallback(
    (raw: string, m: ScoutMode) => (m === "deep" ? runDeep(raw) : runQuick(raw)),
    [runDeep, runQuick],
  );

  // Refresh: re-read the current player from the cache (picks up background
  // detail the Worker has since filled).
  const onRefresh = useCallback(async () => {
    const nick = activeNick.current;
    if (!nick || refreshing) return;
    setRefreshing(true);
    const data = await runRead(nick, resp?.player?.playerId);
    if (alive.current) {
      if (data && data.status !== "idle") applyResp(nick, data);
      setRefreshing(false);
    }
  }, [applyResp, refreshing, resp?.player?.playerId, runRead]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearPoll();
    };
  }, [clearPoll]);

  // On mount (after the remembered query restores): repaint any cached result.
  // No Worker trigger without an explicit search — opening the tab shouldn't kick
  // off a collection.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!restored || hydrated.current) return;
    hydrated.current = true;
    const seed = normalizeNickname(query);
    const cached = readCache();
    if (cached && seed && cached.nickname.toLowerCase() === seed.toLowerCase()) {
      setResp(cached.resp);
      activeNick.current = cached.nickname;
    }
    // Run once after restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runSearch(query, mode);
  }

  const player = resp?.player ?? null;
  const data = resp?.data ?? null;
  const status = resp?.status ?? "idle";
  const collecting = status === "collecting";
  const busy = loading || deep.active;

  return (
    <div className="ff-owpage">
      <Bubble title="Scouting" span="full">
        <form className="ff-scoutsearch" onSubmit={onSubmit} role="search">
          <input
            className="ff-auth__input ff-scoutsearch__input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FACEIT nickname"
            aria-label="FACEIT nickname"
            autoComplete="off"
            spellCheck={false}
          />
          <ScoutModeToggle mode={mode} onChange={setMode} disabled={busy} />
          <button
            type="submit"
            className="ff-btn ff-btn--brand"
            disabled={busy || !normalizeNickname(query)}
          >
            {busy ? "Scouting…" : "Scout"}
          </button>
        </form>
        <p className="ff-scoutsearch__hint">
          {mode === "quick"
            ? "Quick — the recent ~50 games, fast."
            : "Deep — waits for the full match history, so every stat is exact."}
        </p>
      </Bubble>

      {deep.active ? (
        <ScoutDeepLoading total={deep.total} detailed={deep.detailed} />
      ) : loading ? (
        <StatLoading />
      ) : status === "not_found" || status === "error" || status === "not_configured" ? (
        <Bubble title="Scouting" span="full">
          <p className="ff-bubble__lede">{SCOUT_STATUS_MESSAGES[status]}</p>
        </Bubble>
      ) : player && data ? (
        <>
          <ScoutHeader
            resp={resp!}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onDeep={() => runDeep(activeNick.current ?? query)}
          />

          {deepCapped ? (
            <p className="ff-scoutcap">
              Showing the most recent {DEEP_CAP_MATCHES.toLocaleString()}+ matches —
              this account&apos;s history is large, so the deep scan stopped at the
              safety cap. The stats above reflect what was collected.
            </p>
          ) : null}

          <div className="ff-owtabs" role="tablist" aria-label="Scouting sections">
            {(["overview", "matches"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`ff-owtab${tab === t ? " ff-owtab--active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "overview" ? "Overview" : "Matches"}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="ff-toverview">
              <div className="ff-tpanel">
                <ScoutAnalytics matches={data.matches} />
                <Bubble
                  title="Win Rate by Map"
                  span="full"
                  actions={
                    data.summary ? (
                      <span className="ff-scoutmap__summary">
                        {data.summary.withMap} of {data.summary.total} mapped
                      </span>
                    ) : null
                  }
                >
                  {collecting && data.mapWinrates.length === 0 ? (
                    <p className="ff-bubble__note">
                      Collecting matches… map win rates appear as each match&apos;s
                      overview is pulled.
                    </p>
                  ) : (
                    <MapWinrateChart rows={data.mapWinrates} />
                  )}
                </Bubble>
              </div>
              <div className="ff-toverview__side">
                <ScoutFacts player={player} summary={data.summary} />
              </div>
            </div>
          ) : (
            <Bubble title="Recent Matches" span="full">
              {collecting ? (
                <p className="ff-bubble__note">
                  Still collecting — more matches keep arriving. Open a match for its
                  full scoreboard.
                </p>
              ) : null}
              <FaceitMatchList
                matches={data.matches.slice(0, shown)}
                scoutedPlayerId={player.playerId}
              />
              {data.matches.length > shown ? (
                <div className="ff-bubble__cta">
                  <button
                    type="button"
                    className="ff-btn ff-btn--outline ff-btn--sm"
                    onClick={() => setShown((s) => s + PAGE)}
                  >
                    Show more ({data.matches.length - shown} remaining)
                  </button>
                </div>
              ) : null}
            </Bubble>
          )}
        </>
      ) : null}
    </div>
  );
}

// --- Profile header (identity only; the stats live in the Details rail) ------

function ScoutHeader({
  resp,
  refreshing,
  onRefresh,
  onDeep,
}: {
  resp: ScoutResponse;
  refreshing: boolean;
  onRefresh: () => void;
  onDeep: () => void;
}) {
  const player = resp.player!;
  const collecting = resp.status === "collecting";
  const canDeepen = player.searchMode !== "deep";

  return (
    <section className="ff-card ff-bubble ff-bubble--full ff-scouthead">
      <div className="ff-scouthead__body">
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="ff-scouthead__avatar"
            src={player.avatarUrl}
            alt=""
            width={64}
            height={64}
          />
        ) : (
          <div className="ff-scouthead__avatar ff-scouthead__avatar--empty" aria-hidden="true" />
        )}
        <div className="ff-scouthead__meta">
          <h2 className="ff-scouthead__name">
            {player.nickname}
            {collecting ? (
              <span className="ff-scouthead__collecting">Collecting…</span>
            ) : null}
          </h2>
          <div className="ff-scouthead__sub">
            {player.skillLevel != null ? (
              <span className="ff-owbadge">Level {player.skillLevel}</span>
            ) : null}
            {player.faceitElo != null ? (
              <span>{formatElo(player.faceitElo)} elo</span>
            ) : null}
            {player.region ? <span>{player.region}</span> : null}
            {player.gamePlayerName ? <span>{player.gamePlayerName}</span> : null}
          </div>
        </div>
        <div className="ff-scouthead__actions">
          {canDeepen ? (
            <button
              type="button"
              className="ff-btn ff-btn--outline ff-btn--sm"
              onClick={onDeep}
              title="Collect the full match history for exact stats"
            >
              Deep scan
            </button>
          ) : null}
          {player.faceitUrl ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={player.faceitUrl}
              target="_blank"
              rel="noreferrer"
            >
              FACEIT profile
            </a>
          ) : null}
          <button
            type="button"
            className="ff-icon-btn"
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh scouting data"
          >
            <svg
              className={refreshing ? "ff-spin" : undefined}
              viewBox="0 0 16 16"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M13.5 2.5V5H11" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
