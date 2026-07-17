"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    const { error } = await authClient.signOut();
    if (error) {
      // The session is still alive server-side — clearing the hint or
      // navigating would just repaint us signed-in and look like a broken
      // sign-out. Surface the failure instead.
      console.error("Sign out failed:", error);
      setPending(false);
      return;
    }
    // Full navigation; clearing the hint makes the destination paint the
    // Sign In pill immediately.
    setAuthHint(false);
    window.location.assign("/login/");
  }

  return (
    <button
      className="ff-btn ff-btn--outline"
      type="button"
      onClick={onSignOut}
      disabled={pending}
    >
      Sign out
    </button>
  );
}
