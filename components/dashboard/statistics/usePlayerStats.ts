"use client";

import { useEffect, useState } from "react";

import type { PlayerStatsResponse } from "@/lib/ow-stats-shared";

/**
 * Load the member's Overwatch career from /api/statistics/player.
 *
 * The read is deliberately CLIENT-side: the OverFast round-trip is multi-second
 * and doing it in a server render froze the Statistics tab (see CLAUDE.md). The
 * hook exists so the tab and the Home board's pinned Overwatch bubble share one
 * copy of the fetch + its loading/failure states rather than each keeping their
 * own effect.
 *
 * `linked` false means Battle.net isn't connected — there is nothing to fetch,
 * so the hook stays idle and the caller renders its own connect prompt.
 */
export function usePlayerStats(linked: boolean) {
  const [resp, setResp] = useState<PlayerStatsResponse | null>(null);
  const [loading, setLoading] = useState(linked);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!linked) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    fetch("/api/statistics/player", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as PlayerStatsResponse;
      })
      .then((d) => {
        if (!alive) return;
        setResp(d);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [linked]);

  return { resp, loading, failed };
}
