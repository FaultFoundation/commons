"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";

function UserSilhouette() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 12c2.68 0 4.85-2.17 4.85-4.85S14.68 2.3 12 2.3 7.15 4.47 7.15 7.15 9.32 12 12 12Zm0 2.42c-3.24 0-9.7 1.63-9.7 4.86v2.42h19.4v-2.42c0-3.23-6.46-4.86-9.7-4.86Z" />
    </svg>
  );
}

/**
 * Header slot right of "Join Today!". Both controls are in the DOM; CSS on
 * html[data-auth] (stamped pre-paint from the localStorage hint) decides
 * which one shows, so there's no signed-out flash on page load. useSession
 * then verifies against the server and corrects the hint if it was stale.
 */
export function HeaderAuthButton() {
  const { data: session, isPending, error } = authClient.useSession();

  useEffect(() => {
    // Only sync the hint on a definitive answer. A failed/ambiguous check
    // (network hiccup, deploy propagation) must not wipe a valid hint —
    // that would repaint the wrong control on the next page load.
    if (isPending || error) return;
    setAuthHint(Boolean(session));
  }, [session, isPending, error]);

  return (
    <>
      <a className="ff-btn ff-btn--outline ff-auth-when-out" href="/login/">
        Sign In
      </a>
      <a
        className="ff-nav__avatar ff-auth-when-in"
        href="/home/"
        aria-label="Member area"
        title="Member area"
      >
        {session?.user.image ? (
          <img src={session.user.image} alt="" />
        ) : (
          <UserSilhouette />
        )}
      </a>
    </>
  );
}
