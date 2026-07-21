"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";

/** Starts the Discord OAuth link flow (full-page redirect, like AuthForm). */
export function LinkDiscordButton({
  callbackURL = "/home/",
}: {
  /** Where Discord sends the member back — pass the page the button is on. */
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);

  async function onLink() {
    if (pending) return;
    setPending(true);
    const result = await authClient.linkSocial({
      provider: "discord",
      callbackURL,
    });
    if (result.error) {
      setPending(false);
    }
    // On success the browser navigates to Discord; no state to reset.
  }

  return (
    <button
      className="ff-btn ff-btn--outline"
      type="button"
      onClick={onLink}
      disabled={pending}
    >
      Link Discord
    </button>
  );
}
