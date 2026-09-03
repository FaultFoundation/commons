"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { MatchList } from "@/components/dashboard/statistics/MatchList";
import { StatLoading } from "@/components/dashboard/statistics/StatLoading";
import {
  PD_PROVIDER_LABELS,
  PD_STATUS_MESSAGES,
  type MatchDataResponse,
} from "@/lib/player-data-shared";

// The Match Data tab body: the member's match history across every linked
// platform (FACEIT / start.gg / Challonge), pulled through
// /api/statistics/matches (which runs the TTL-gated provider sync behind the
// scenes, so the first open can take a few seconds — hence the same climbing
// loading bar as Player Data).
//
// Client caching: the last response is kept in sessionStorage and painted
// IMMEDIATELY on return visits (stale-while-revalidate) — the fetch still runs
// and swaps in fresh data when it lands, so tab-hopping never re-waits on the
// providers. The refresh icon forces a sync past the TTL (the server applies a
// short floor) and refetches.

const CACHE_KEY = "ff-matchdata-v1";

function readCache(): MatchDataResponse | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: MatchDataResponse };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(data: MatchDataResponse) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Quota/serialization failure — caching is an optimization, never a must.
  }
}

/** How many rows render initially; "Show more" reveals the rest client-side. */
const PAGE = 25;

export function MatchPanel() {
  const [resp, setResp] = useState<MatchDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const alive = useRef(true);

  const load = useCallback(async (force: boolean) => {
    try {
      if (force) {
        // Ask the server to sync past the TTL before re-reading.
        await fetch("/api/player-data/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }).catch(() => null);
      }
      const res = await fetch("/api/statistics/matches", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as MatchDataResponse;
      if (!alive.current) return;
      setResp(data);
      setFailed(false);
      writeCache(data);
    } catch {
      if (!alive.current) return;
      // Keep whatever is on screen (cache or previous fetch); only report a
      // failure when there's nothing at all to show.
      setFailed((prev) => prev || !readCache());
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const cached = readCache();
    if (cached) {
      setResp(cached);
      setLoading(false);
    }
    void load(false);
    return () => {
      alive.current = false;
    };
  }, [load]);

  function onRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    void load(true);
  }

  if (loading && !resp) return <StatLoading />;

  if (failed && !resp) {
    return (
      <Bubble title="Match Data" span="full">
        <p className="ff-bubble__lede">
          We couldn&apos;t load your match history just now.
        </p>
        <p className="ff-bubble__note">
          This is usually temporary — reload the page in a moment.
        </p>
      </Bubble>
    );
  }

  const providers = resp?.providers ?? [];
  const matches = resp?.matches ?? [];
  const problems = providers.filter(
    (p) => p.status && p.status !== "ok",
  );
  const backfilling = providers.some((p) => p.status === "ok" && !p.backfillDone);

  return (
    <div className="ff-bubble-grid ff-bubble-grid--single">
      <Bubble
        title="Match Data"
        span="full"
        actions={
          <span className="ff-pd-toolbar">
            {refreshing ? (
              <span className="ff-ext-refresh" aria-live="polite">
                <span className="ff-ext-refresh__dot" aria-hidden="true" />
                Updating…
              </span>
            ) : null}
            <button
              type="button"
              className="ff-icon-btn"
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh match data"
              aria-label="Refresh match data"
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
                <path
                  d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <path
                  d="M13.5 2.5V5H11"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </span>
        }
      >
        {providers.length === 0 ? (
          <p className="ff-bubble__lede">
            Connect FACEIT, start.gg, or Challonge in{" "}
            <a href="/account/">Account → Integrations</a> to pull your match
            history from across platforms into one place.
          </p>
        ) : (
          <>
            {problems.map((p) => (
              <p className="ff-pd-problem" key={p.provider} role="status">
                <strong>{PD_PROVIDER_LABELS[p.provider]}:</strong>{" "}
                {p.statusDetail ??
                  PD_STATUS_MESSAGES[
                    p.status as keyof typeof PD_STATUS_MESSAGES
                  ]}
              </p>
            ))}
            {backfilling ? (
              <p className="ff-bubble__note">
                Still backfilling your full history — older matches keep
                arriving with each sync.
              </p>
            ) : null}
            <MatchList matches={matches.slice(0, shown)} />
            {matches.length > shown ? (
              <div className="ff-bubble__cta">
                <button
                  type="button"
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  onClick={() => setShown((s) => s + PAGE)}
                >
                  Show more ({matches.length - shown} remaining)
                </button>
              </div>
            ) : null}
          </>
        )}
      </Bubble>
    </div>
  );
}
