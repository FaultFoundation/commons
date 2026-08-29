"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { recheckConnections } from "@/app/account/actions";

/**
 * The reload control in the Integrations bubble header. Forces a fresh
 * public-API reachability test for the member's linked FACEIT/start.gg accounts
 * (past the 30-min TTL), then refreshes so the cards reflect it. Icon-only, with
 * a spinner while it runs.
 */
export function RecheckConnectionsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function onClick() {
    if (pending) return;
    setError(false);
    startTransition(async () => {
      const result = await recheckConnections();
      if (!result.ok) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      className="ff-icon-btn"
      onClick={onClick}
      disabled={pending}
      title={error ? "Couldn't re-check — try again" : "Re-check connections"}
      aria-label="Re-check connection status"
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
