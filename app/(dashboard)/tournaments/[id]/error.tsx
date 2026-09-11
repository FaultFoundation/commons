"use client";

import { useEffect } from "react";

// Route error boundary for a tournament page. getExternalTournament /
// getTournament already swallow read failures and fall through to notFound(),
// so this catches only unexpected throws — e.g. a transient read while the
// projection is mid-reload. It degrades to a friendly, retryable card instead
// of a raw crash, and `reset()` re-renders the segment (a fresh read).
export default function TournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Tournament page error:", error);
  }, [error]);

  return (
    <div className="ff-bubble-grid">
      <div className="ff-card ff-error-card">
        <h2 className="ff-error-card__title">Couldn&apos;t load this tournament</h2>
        <p className="ff-error-card__body">
          The tournament data may be refreshing. Give it a moment and try again.
        </p>
        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="button"
          onClick={() => reset()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
