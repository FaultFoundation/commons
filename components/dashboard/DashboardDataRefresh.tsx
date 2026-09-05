"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Cached content paints first. TTLs are enforced in D1, including across tabs. */
export function DashboardDataRefresh({
  schedule = false,
  tournaments = false,
}: {
  schedule?: boolean;
  tournaments?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!schedule && !tournaments) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/dashboard/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule, tournaments }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) return;
        const result = await response.json() as { refreshed?: boolean };
        if (!cancelled && result.refreshed === true) router.refresh();
      } catch {
        // The stored view remains usable during provider outages.
      }
    })();
    return () => { cancelled = true; };
  }, [router, schedule, tournaments]);
  return null;
}
