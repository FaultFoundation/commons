"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { LinkableProvider } from "@/lib/integrations-shared";

/**
 * Starts a provider's OAuth link flow **in a new tab**, so the member keeps
 * their place on the account page. Both link endpoints return `{ url }` in a 200
 * body (Discord via /link-social, the generic-OAuth providers via /oauth2/link),
 * so we ask for the authorize URL without letting the client navigate us, then
 * open it. The tab is opened synchronously in the click (so the popup blocker
 * allows it) and shown a "Connecting…" placeholder rather than about:blank while
 * the URL is fetched, so a dropped connection never strands the member on a
 * blank page. Falls back to a same-tab redirect if the popup is blocked.
 *
 * Discord is a built-in better-auth social provider (linkSocial / /link-social);
 * the rest are generic-OAuth (/oauth2/link, callback /api/auth/oauth2/callback/…).
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

  // Ask better-auth for the provider's authorize URL without navigating us.
  // Relative path keeps it correct in every environment; null on any failure.
  async function fetchAuthorizeUrl(): Promise<string | null> {
    const endpoint =
      provider === "discord" ? "/api/auth/link-social" : "/api/auth/oauth2/link";
    // Mark the return URL so OAuthPopupBridge on the landing page knows this tab
    // is the connect popup — it then closes itself and refreshes the opener.
    const marked =
      callbackURL + (callbackURL.includes("?") ? "&" : "?") + "ff_oauth=1";
    const body =
      provider === "discord"
        ? { provider: "discord", callbackURL: marked, disableRedirect: true }
        : { providerId: provider, callbackURL: marked };
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

    // Open the tab inside the click so the popup blocker allows it, and paint a
    // loading message so it isn't a blank page while we fetch the URL.
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.write(
        `<!doctype html><title>Connecting…</title><body style="font:16px system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#003167;color:#dfe9f4">Connecting to ${label.replace(/[<>]/g, "")}…</body>`,
      );
    }

    const url = await fetchAuthorizeUrl();
    setPending(false);

    if (url) {
      if (tab) tab.location.href = url;
      else window.location.href = url; // popup blocked — full-page redirect
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
