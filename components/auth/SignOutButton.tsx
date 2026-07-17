"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    let error: unknown;
    try {
      ({ error } = await authClient.signOut());
    } catch (thrown) {
      error = thrown;
    }
    if (error) {
      // The session is still alive server-side — clearing the hint or
      // navigating would just repaint us signed-in and look like a broken
      // sign-out. Show the failure instead.
      console.error("Sign out failed:", error);
      setFailed(true);
      setPending(false);
      return;
    }
    // Full navigation; clearing the hint makes the destination paint the
    // Sign In pill immediately.
    setAuthHint(false);
    window.location.assign("/login/");
  }

  return (
    <>
      <button
        className="ff-btn ff-btn--outline"
        type="button"
        onClick={onSignOut}
        disabled={pending}
      >
        {failed ? "Retry sign out" : "Sign out"}
      </button>
      {failed ? (
        <p className="ff-signout__error" role="alert">
          Sign out failed — try again in a moment.
        </p>
      ) : null}
    </>
  );
}
