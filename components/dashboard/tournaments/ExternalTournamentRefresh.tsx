"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Fires the on-demand top-up when a member opens an external tournament: POSTs
// the refresh route (which asks the scraper to re-pull it), and only when the
// projection actually changed does it re-render the server page with the fresh
// data. The page has already painted from cache, so this is purely additive —
// a brief "Updating…" while the bracket catches up, never a blank state.
export function ExternalTournamentRefresh({ id }: { id: string }) {
  const router = useRouter();
  const [updating, setUpdating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/tournaments/external/${encodeURIComponent(id)}/refresh`,
          { method: "POST" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          refreshed?: boolean;
        };
        if (!cancelled && data.refreshed) router.refresh();
      } catch {
        // Best-effort: the cached view is already on screen.
      } finally {
        if (!cancelled) setUpdating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (!updating) return null;
  return (
    <span className="ff-ext-refresh" aria-live="polite">
      <span className="ff-ext-refresh__dot" aria-hidden="true" />
      Updating…
    </span>
  );
}
