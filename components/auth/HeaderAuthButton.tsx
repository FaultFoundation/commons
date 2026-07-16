"use client";

import { authClient } from "@/lib/auth-client";

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
 * Header slot right of "Join Today!": the Sign In pill for visitors, a
 * default user icon linking to the member area once a session exists.
 * Session state resolves client-side so every page stays prerenderable.
 */
export function HeaderAuthButton() {
  const { data: session } = authClient.useSession();

  if (session) {
    return (
      <a
        className="ff-nav__avatar"
        href="/dashboard/"
        aria-label="Member area"
        title="Member area"
      >
        {session.user.image ? (
          <img src={session.user.image} alt="" />
        ) : (
          <UserSilhouette />
        )}
      </a>
    );
  }

  return (
    <a className="ff-btn ff-btn--outline" href="/login/">
      Sign In
    </a>
  );
}
