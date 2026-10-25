"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { setAuthHint } from "@/lib/auth-hint";
import { withNext } from "@/lib/next-path";
import { clearViewState } from "@/lib/view-state";

/**
 * "Switch account" on the standalone sign-up form, which has no header avatar
 * to sign out from: signs out, then comes back to this same form through
 * sign-in. A shared machine at an event is the case it serves — the next player
 * must not sign up under the last one's account.
 */
export function SwitchAccountButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onSwitch() {
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
      // Still signed in server-side: navigating away would bring them straight
      // back here as the same member. Say so and let them retry.
      console.error("Sign out failed:", error);
      setFailed(true);
      setPending(false);
      return;
    }
    setAuthHint(false);
    clearViewState();
    window.location.assign(withNext("/login/", next));
  }

  return (
    <button className="ff-survey__linkbtn" type="button" onClick={onSwitch} disabled={pending}>
      {failed ? "Couldn't sign out — retry" : pending ? "Signing out…" : "Switch account"}
    </button>
  );
}
