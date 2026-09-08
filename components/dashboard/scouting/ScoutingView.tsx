"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { FaceitMatchList } from "@/components/dashboard/scouting/FaceitMatchList";
import { MapWinrateChart } from "@/components/dashboard/scouting/MapWinrateChart";
import { StatLoading } from "@/components/dashboard/statistics/StatLoading";
import {
  SCOUT_STATUS_MESSAGES,
  formatElo,
  formatRecord,
  formatWinratePct,
  normalizeNickname,
  type ScoutResponse,
} from "@/lib/faceit-scouting-shared";
import { usePersistentState } from "@/lib/view-state";

// The whole Scouting surface (Experimental → Scouting). Search ANY FACEIT
// Overwatch player by nickname; the headline is win rate by map, over the
// search-driven `faceit_*` cache the ow-data Worker fills. The heavy work (the
// FACEIT search + collection) runs server-side behind a loading bar via
// /api/scouting/*, mirroring the Statistics tab.
//
// Two calls: a READ (GET /api/scouting/player) hydrates from the cache without
// triggering anything (used on mount + Refresh); a SEARCH (POST
// /api/scouting/search) asks the Worker to collect the player, then reads back.
// While the Worker is still collecting, we re-read a few times so maps and
// scoreboards appear without the searcher hunting for the refresh button.

const CACHE_KEY = "ff-scouting-v1";
const POLL_MS = 4000;
const MAX_POLLS = 4;

type Cached = { nickname: string; resp: ScoutResponse };

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

/** How many rows the Recent Matches card shows before "Show more". */
const PAGE = 20;

export function ScoutingView({ initialQuery }: { initialQuery: string }) {
  // The search box remembers the last query across visits; ?q= / the member's
  // own handle is the fallback the server seeded.
  const [query, setQuery, restored] = usePersistentState<string>(
    "scouting:query",
    initialQuery,
    (stored) =>
      typeof stored === "string" && stored.length <= 64 ? stored : undefined,
  );

  const [resp, setResp] = useState<ScoutResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  // Re-read a handful of times while the Worker is still collecting, so maps and
  // scoreboards surface on their own. Stops as soon as status is terminal.
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

  // A full search: ask the Worker to collect, then read back + start polling.
  const runSearch = useCallback(
    async (raw: string, mode: "quick" | "deep" = "quick") => {
      const nickname = normalizeNickname(raw);
      if (!nickname) return;
      clearPoll();
      if (mode === "deep") setRefreshing(true);
      else {
        setLoading(true);
        setResp(null);
      }
      try {
        const res = await fetch("/api/scouting/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nickname, mode }),
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
        if (alive.current) {
          setResp({ status: "error", player: null, data: null });
        }
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applyResp, clearPoll, schedulePoll],
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

  // On mount (after the remembered query restores): paint any cached result and
  // do a cache-only read for the seeded query. No Worker trigger without an
  // explicit search — opening the tab shouldn't kick off a collection.
  const hydrated = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearPoll();
    };
  }, [clearPoll]);

  useEffect(() => {
    if (!restored || hydrated.current) return;
    hydrated.current = true;
    // Repaint a search made earlier THIS session (cache only exists after a
    // search) so hopping away and back doesn't re-wait. No network read on
    // mount: until the member actually searches, the screen is just the header
    // and the search bar — the seeded query only pre-fills the box.
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
    void runSearch(query, "quick");
  }

  const player = resp?.player ?? null;
  const data = resp?.data ?? null;
  const status = resp?.status ?? "idle";
  const collecting = status === "collecting";

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
          <button
            type="submit"
            className="ff-btn ff-btn--brand"
            disabled={loading || !normalizeNickname(query)}
          >
            {loading ? "Searching…" : "Scout"}
          </button>
        </form>
      </Bubble>

      {loading ? (
        <StatLoading />
      ) : status === "not_found" || status === "error" || status === "not_configured" ? (
        <Bubble title="Scouting" span="full">
          <p className="ff-bubble__lede">{SCOUT_STATUS_MESSAGES[status]}</p>
        </Bubble>
      ) : player ? (
        <>
          <ScoutHeader resp={resp!} refreshing={refreshing} onRefresh={onRefresh} />

          <Bubble
            title="Win Rate by Map"
            span="full"
            actions={
              data?.summary ? (
                <span className="ff-scoutmap__summary">
                  {data.summary.withMap} of {data.summary.total} matches mapped
                </span>
              ) : null
            }
          >
            {collecting && (!data || data.mapWinrates.length === 0) ? (
              <p className="ff-bubble__note">
                Collecting matches… map win rates appear here as each match&apos;s
                overview is pulled. This can take a moment on the first search.
              </p>
            ) : (
              <MapWinrateChart rows={data?.mapWinrates ?? []} />
            )}
          </Bubble>

          <Bubble title="Recent Matches" span="full">
            {collecting ? (
              <p className="ff-bubble__note">
                Still collecting — more matches keep arriving.
              </p>
            ) : null}
            <FaceitMatchList matches={(data?.matches ?? []).slice(0, shown)} />
            {(data?.matches.length ?? 0) > shown ? (
              <div className="ff-bubble__cta">
                <button
                  type="button"
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  onClick={() => setShown((s) => s + PAGE)}
                >
                  Show more ({(data?.matches.length ?? 0) - shown} remaining)
                </button>
              </div>
            ) : null}
          </Bubble>
        </>
      ) : null}
    </div>
  );
}

// --- Profile header ---------------------------------------------------------

function ScoutHeader({
  resp,
  refreshing,
  onRefresh,
}: {
  resp: ScoutResponse;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const player = resp.player!;
  const summary = resp.data?.summary ?? null;
  const collecting = resp.status === "collecting";

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
      <div className="ff-scouthead__stats">
        <HeadStat
          label="Win Rate"
          value={formatWinratePct(summary?.winrate ?? null)}
          hi
        />
        <HeadStat
          label="Record"
          value={summary ? formatRecord(summary) : "—"}
        />
        <HeadStat
          label="Matches"
          value={summary ? String(summary.total) : String(player.matchCount)}
        />
      </div>
    </section>
  );
}

function HeadStat({ label, value, hi }: { label: string; value: string; hi?: boolean }) {
  return (
    <div className="ff-stat">
      <span className="ff-stat__label">{label}</span>
      <span className={`ff-stat__value${hi ? " ff-stat__value--hi" : ""}`}>{value}</span>
    </div>
  );
}
