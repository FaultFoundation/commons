"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Closes the OAuth connect popup, refreshes the tab that opened it, and — when
// the provider sent us back a failure instead — puts that failure in front of
// the member instead of swallowing it.
//
// LinkProviderButton opens the provider flow in a new tab and tacks
// `ff_oauth=1` onto both the callbackURL and the errorCallbackURL. When the
// provider redirects that tab back, this bridge runs.
//
// Two rules here are load-bearing, and both were learned from the FACEIT
// connect being silently broken for weeks:
//
//  1. **Signal first, close second, and never gate the signal on
//     `window.opener`.** A provider that ships
//     `Cross-Origin-Opener-Policy: same-origin` on its login page — FACEIT
//     does, and so does the Cloudflare interstitial in front of it — severs
//     `window.opener` permanently the moment the popup lands there, including
//     after it navigates back to us. The opener is gone but BroadcastChannel
//     still works: it is same-origin, not same-window. Broadcasting
//     unconditionally is what makes the original tab update at all in that
//     case.
//  2. **A failure is not a success.** Better Auth redirects OAuth failures to
//     an `?error=<code>` URL; pointed at Better Auth's own error page that is a
//     bare page inside a popup nobody reads, and the opener learns nothing. We
//     route errors back here instead and render the code, so the next time this
//     breaks there is something to report rather than "it just closes".
const CHANNEL = "ff-oauth-link";
const SIGNAL = "linked";
const ERROR_PREFIX = "error:";

/** Provider-agnostic wording for the failure codes Better Auth actually emits. */
const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch:
    "That took too long, or the sign-in was started in a different browser session. Try connecting again and finish within a few minutes.",
  state_not_found:
    "The connection request expired before it came back. Try connecting again.",
  oauth_code_verification_failed:
    "The provider wouldn't exchange the sign-in code. This is usually temporary — try again, and tell us if it keeps happening.",
  user_info_is_missing:
    "We couldn't read your profile from the provider. Make sure the account is public, then try again.",
  email_is_missing:
    "The provider didn't share an email address, so the account couldn't be linked.",
  id_is_missing: "The provider didn't identify the account it signed in.",
  account_already_linked_to_different_user:
    "That account is already connected to a different Commons member.",
  unable_to_link_account:
    "We couldn't save the connection. Try again, and tell us if it keeps happening.",
  access_denied: "The connection was cancelled on the provider's page.",
};

function describe(code: string): string {
  return (
    ERROR_MESSAGES[code] ??
    `The provider returned an error while connecting (${code}).`
  );
}

export function OAuthPopupBridge() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPopupReturn = params.get("ff_oauth") === "1";
    // Better Auth appends `error` (and sometimes `error_description`) to
    // whichever callback URL it redirects to; see redirectOnError.
    const failure = params.get("error");

    if (isPopupReturn) {
      // Tell whoever is listening on this origin what happened, whether or not
      // this window still has an opener to talk to (see rule 1 above).
      try {
        const bc = new BroadcastChannel(CHANNEL);
        bc.postMessage(failure ? `${ERROR_PREFIX}${failure}` : SIGNAL);
        bc.close();
      } catch {
        /* BroadcastChannel unsupported — postMessage fallback below */
      }
      const opener = window.opener as Window | null;
      if (opener && !opener.closed) {
        try {
          opener.postMessage(
            failure ? `${ERROR_PREFIX}${failure}` : SIGNAL,
            window.location.origin,
          );
        } catch {
          /* opener cross-origin/closed — the broadcast above still stands */
        }
      }

      // Scrub the markers either way, so this tab is a clean page whether it
      // manages to close or not.
      params.delete("ff_oauth");
      params.delete("error");
      params.delete("error_description");
      const qs = params.toString();
      const clean = window.location.pathname + (qs ? `?${qs}` : "");

      if (failure) {
        // Stay open and say what went wrong — the opener may have been severed,
        // in which case this window is the only place the member can see it.
        setError(describe(failure));
        window.history.replaceState(null, "", clean);
        return;
      }

      // Linked. Try to close; a window the browser refuses to close (opened by
      // the provider's own parent-redirect rather than by us) falls back to
      // being a normal, refreshed account page instead of a dead-end URL.
      window.close();
      const settle = window.setTimeout(() => {
        router.replace(clean);
        router.refresh();
      }, 250);
      return () => window.clearTimeout(settle);
    }

    // We're the opener: listen for the popup's signal, then refresh in place.
    const handle = (data: unknown) => {
      if (data === SIGNAL) {
        router.refresh();
        return;
      }
      if (typeof data === "string" && data.startsWith(ERROR_PREFIX)) {
        setError(describe(data.slice(ERROR_PREFIX.length)));
      }
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (event) => handle(event.data);
    } catch {
      /* fall back to postMessage only */
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin) handle(event.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      bc?.close();
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  if (!error) return null;

  return (
    <div className="ff-auth__error" role="alert">
      <p>{error}</p>
      <p>
        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="button"
          onClick={() => setError(null)}
        >
          Dismiss
        </button>
      </p>
    </div>
  );
}
