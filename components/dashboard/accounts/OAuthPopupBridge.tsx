"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Closes the OAuth connect popup and refreshes the tab that opened it.
//
// LinkProviderButton opens the provider flow in a new tab and tacks `ff_oauth=1`
// onto the callbackURL. When the provider redirects that tab back (now linked),
// this bridge runs: the popup tells its opener to refresh (BroadcastChannel,
// with a postMessage fallback) and closes itself; the opener, which mounted the
// same bridge earlier, hears the signal and re-renders with the new link. Same
// origin throughout, so both channels are safe. Rendered on every portal page
// via DashboardShell, so it's present as both the opener and the popup landing.
const CHANNEL = "ff-oauth-link";
const SIGNAL = "linked";

export function OAuthPopupBridge() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPopupReturn = params.get("ff_oauth") === "1";

    if (isPopupReturn) {
      // We're the popup, freshly returned and linked. Signal the opener and go.
      const opener = window.opener as Window | null;
      if (opener && !opener.closed) {
        try {
          const bc = new BroadcastChannel(CHANNEL);
          bc.postMessage(SIGNAL);
          bc.close();
        } catch {
          /* BroadcastChannel unsupported — postMessage fallback below */
        }
        try {
          opener.postMessage(SIGNAL, window.location.origin);
        } catch {
          /* opener cross-origin/closed — nothing more we can do */
        }
        window.close();
        return;
      }
      // No usable opener (blocked, or opened same-tab): just scrub the marker so
      // this tab is a clean, linked account page.
      params.delete("ff_oauth");
      const qs = params.toString();
      router.replace(window.location.pathname + (qs ? `?${qs}` : ""));
      router.refresh();
      return;
    }

    // We're the opener: listen for the popup's signal, then refresh in place.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (event) => {
        if (event.data === SIGNAL) router.refresh();
      };
    } catch {
      /* fall back to postMessage only */
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data === SIGNAL) {
        router.refresh();
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      bc?.close();
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  return null;
}
