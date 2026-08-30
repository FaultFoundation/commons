"use client";

import { useEffect, useState } from "react";

// The loading state for Player Data: a climbing progress bar with rotating
// status labels while /api/statistics/player collects from OverFast (a few
// seconds). OverFast gives us no real progress events, so the bar eases toward
// ~92% and the parent unmounts this the moment the data lands — the classic
// "feels like it's working" fill rather than a dead spinner.

const STAGES = [
  "Checking your Overwatch profile…",
  "Collecting your career stats…",
  "Crunching the numbers…",
  "Building your dashboard…",
];

export function StatLoading() {
  const [pct, setPct] = useState(6);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const bar = setInterval(() => {
      // Ease toward 92%, slowing as it climbs so it never looks stalled or done.
      setPct((p) => (p >= 92 ? 92 : p + Math.max(0.4, (92 - p) * 0.05)));
    }, 110);
    const labels = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      1500,
    );
    return () => {
      clearInterval(bar);
      clearInterval(labels);
    };
  }, []);

  return (
    <section
      className="ff-card ff-bubble ff-bubble--full ff-owload"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="ff-owload__label">{STAGES[stage]}</p>
      <div className="ff-owload__track">
        <div className="ff-owload__bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="ff-owload__hint">
        Pulling your latest stats from Overwatch — this can take a few seconds.
      </p>
    </section>
  );
}
