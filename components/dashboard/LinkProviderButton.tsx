"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { LinkableProvider } from "@/lib/integrations-shared";

/**
 * Starts a provider's OAuth link flow (full-page redirect, like AuthForm).
 *
 * Same-tab on purpose: better-auth sets the OAuth state/PKCE cookies for this
 * browsing context and the provider redirects back to the callback, which then
 * lands the member on `callbackURL` with the account freshly linked. Opening it
 * in a new tab leaves the original page stale and flashes about:blank while the
 * authorize URL is fetched — so we let better-auth drive the navigation.
 *
 * Discord is a built-in better-auth social provider, so it links via
 * linkSocial(). Battle.net has no built-in provider and is configured through
 * the generic-OAuth plugin, which exposes its own oauth2.link() — different
 * call, and a different callback path (/api/auth/oauth2/callback/battlenet).
 */
export function LinkProviderButton({
  provider,
  label,
  callbackURL = "/home/",
}: {
  provider: LinkableProvider;
  /** Button text, e.g. "Link Discord" or "Connect". */
  label: string;
  /** Where the provider sends the member back — pass the page the button is on. */
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);

  async function onLink() {
    if (pending) return;
    setPending(true);
    const result =
      provider === "discord"
        ? await authClient.linkSocial({ provider: "discord", callbackURL })
        : await authClient.oauth2.link({ providerId: provider, callbackURL });
    if (result.error) {
      setPending(false);
    }
    // On success the browser navigates away; no state to reset.
  }

  return (
    <button
      className="ff-btn ff-btn--outline"
      type="button"
      onClick={onLink}
      disabled={pending}
    >
      {label}
    </button>
  );
}
