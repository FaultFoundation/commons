"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    if (pending) return;
    setPending(true);
    await authClient.signOut();
    // Full navigation so the header's session state is fresh on arrival.
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
