"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// The external player-data top-up controls for the Teams surfaces, following
// the ExternalTournamentRefresh pattern: pages render from D1 first (never
// blank), then these fire the sync route after paint. Only a real change
// re-renders the server page.

async function postRefresh(force: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/player-data/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = (await res.json().catch(() => ({}))) as { changed?: boolean };
    return data.changed === true;
  } catch {
    return false; // best-effort: the cached view is already on screen
  }
}

/**
 * Fires the TTL-gated sync when a member opens a teams surface; shows a quiet
 * "Updating…" chip while it runs and refreshes the page only when the sync
 * actually changed something.
 */
export function PlayerDataAutoRefresh() {
  const router = useRouter();
  const [updating, setUpdating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const changed = await postRefresh(false);
      if (!cancelled && changed) router.refresh();
      if (!cancelled) setUpdating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!updating) return null;
  return (
    <span className="ff-ext-refresh" aria-live="polite">
      <span className="ff-ext-refresh__dot" aria-hidden="true" />
      Updating…
    </span>
  );
}

/**
 * The explicit refresh icon: forces a sync past the TTL (the server still
 * applies a short floor, so clicking repeatedly can't hammer the providers).
 */
export function PlayerDataRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    startTransition(async () => {
      const changed = await postRefresh(true);
      if (changed) router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="ff-icon-btn"
      onClick={onClick}
      disabled={pending}
      title="Refresh external team data"
      aria-label="Refresh external team data"
    >
      <svg
        className={pending ? "ff-spin" : undefined}
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
  );
}
