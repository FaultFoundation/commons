"use client";

import { useEffect, useRef, useState } from "react";

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
 * Header slot right of "Commons": the signed-in avatar, and nothing else.
 * There is no signed-out control here — a logged-out visitor signs in from
 * the homepage's own CTA instead. The wrapping <li className="ff-auth-when-in">
 * (MainNav.tsx) is what's actually hidden pre-paint via CSS on html[data-auth]
 * (stamped from the localStorage hint), so there's no empty-slot flash on
 * page load. useSession then verifies against the server and corrects the
 * hint if it was stale.
 *
 * Signed in, the avatar is a dropdown toggle (Dashboard / Settings / Sign out),
 * mirroring the About/Partners dropdowns' click-outside + Escape handling.
 */
export function HeaderAuthButton() {
  const { data: session, isPending, error } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only sync the hint on a definitive answer. A failed/ambiguous check
    // (network hiccup, deploy propagation) must not wipe a valid hint —
    // that would repaint the wrong control on the next page load.
    if (isPending || error) return;
    setAuthHint(Boolean(session));
  }, [session, isPending, error]);

  // Close on click-outside / Escape, same as the News dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    let signOutError: unknown;
    try {
      ({ error: signOutError } = await authClient.signOut());
    } catch (thrown) {
      signOutError = thrown;
    }
    if (signOutError) {
      // Session still alive server-side — clearing the hint would repaint us
      // signed-in and look broken. Leave the menu, let them retry.
      console.error("Sign out failed:", signOutError);
      setSigningOut(false);
      return;
    }
    setAuthHint(false);
    window.location.assign("/login/");
  }

  return (
    <div className={`ff-usermenu${open ? " is-open" : ""}`} ref={menuRef}>
      <button
        type="button"
        className="ff-nav__avatar"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        title="Account"
        onClick={() => setOpen((v) => !v)}
      >
        {session?.user.image ? (
          <img src={session.user.image} alt="" />
        ) : (
          <UserSilhouette />
        )}
      </button>
      <div className="ff-usermenu__menu" role="menu">
        <a className="ff-usermenu__item" role="menuitem" href="/home/">
          Dashboard
        </a>
        <a className="ff-usermenu__item" role="menuitem" href="/account/">
          Settings
        </a>
        <button
          type="button"
          className="ff-usermenu__item ff-usermenu__item--danger"
          role="menuitem"
          onClick={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
