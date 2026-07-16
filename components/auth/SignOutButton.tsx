"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    await authClient.signOut();
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
