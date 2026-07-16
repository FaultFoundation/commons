// Client-side "probably signed in" hint so the header can paint the right
// control (Sign In pill vs avatar) before the session request round-trips.
// The inline script in app/layout.tsx reads the same key pre-paint; CSS on
// html[data-auth] picks the visible control. Never trusted for anything
// security-relevant — the server session is always the source of truth.

const KEY = "ff-auth";

export function setAuthHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode etc.) — degrade to post-fetch swap.
  }
  document.documentElement.dataset.auth = signedIn ? "in" : "out";
}
