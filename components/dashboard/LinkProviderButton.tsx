"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { LinkableProvider } from "@/lib/integrations-shared";

/**
 * Starts a provider's OAuth link flow **in a new tab**, so the member keeps
 * their place on the account page (and a provider-side error doesn't replace
 * the whole app). `disableRedirect: true` makes better-auth hand back the
 * authorize URL instead of navigating us; we open it ourselves. The blank tab
 * is opened synchronously in the click handler so the popup blocker allows it,
 * then pointed at the URL once it arrives.
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

  // Ask better-auth for the provider's authorize URL WITHOUT letting the client
  // navigate us: both endpoints return `{ url }` in a 200 body. Discord links
  // via /link-social, the generic-OAuth providers via /oauth2/link (which
  // ignores disableRedirect but still hands back the url in the body). Relative
  // paths keep this correct in every environment. Returns null on any failure.
  async function fetchAuthorizeUrl(): Promise<string | null> {
    const endpoint =
      provider === "discord" ? "/api/auth/link-social" : "/api/auth/oauth2/link";
    const body =
      provider === "discord"
        ? { provider: "discord", callbackURL, disableRedirect: true }
        : { providerId: provider, callbackURL };
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { url?: unknown };
      return typeof data.url === "string" ? data.url : null;
    } catch {
      return null;
    }
  }

  async function onLink() {
    if (pending) return;
    setPending(true);

    // Open the tab up front, inside the user gesture, so the popup blocker
    // allows it; we fill in its location once the authorize URL arrives.
    const tab = window.open("about:blank", "_blank");
    const url = await fetchAuthorizeUrl();
    setPending(false);

    if (url) {
      if (tab) tab.location.href = url;
      // Popup blocked — fall back to a full-page redirect so linking still works.
      else window.location.href = url;
      return;
    }

    // Couldn't resolve the URL — close the tab and fall back to better-auth's
    // built-in same-tab redirect so linking still works.
    tab?.close();
    if (provider === "discord") {
      await authClient.linkSocial({ provider: "discord", callbackURL });
    } else {
      await authClient.oauth2.link({ providerId: provider, callbackURL });
    }
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
