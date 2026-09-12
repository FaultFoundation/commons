"use client";

import { useEffect } from "react";

// Route error boundary for a tournament inside a series shell. It sits below
// the layout, so a failure here leaves the hero and strip in place and the
// member can simply pick another tournament — or retry this one.
export default function SeriesTournamentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Series tournament page error:", error);
  }, [error]);

  return (
    <div className="ff-card ff-error-card">
      <h2 className="ff-error-card__title">Couldn&apos;t load this tournament</h2>
      <p className="ff-error-card__body">
        The tournament data may be refreshing. Give it a moment and try again,
        or pick another tournament from the strip above.
      </p>
      <button
        className="ff-btn ff-btn--outline ff-btn--sm"
        type="button"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
