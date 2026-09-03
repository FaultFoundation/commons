import { getCloudflareContext } from "@opennextjs/cloudflare";

// The Commons' side of the on-demand external-tournament refresh. The Commons
// never writes cen-sql itself — it asks the cen-scraper Worker to re-pull one
// tournament (which owns every write), then re-reads the freshened projection.
// Everything here is best-effort: any missing config, timeout, or error
// degrades to { refreshed:false } and the caller just renders the cache.

// A big tournament's deep re-pull (many set pages + the widget fetch) runs ~8s+
// at the scraper's rate limit, so a short timeout aborted before it finished and
// the freshly-opened page never re-rendered with the update. The scraper now
// completes the write via waitUntil regardless, but wait long enough here that
// the first open usually SEES the result and re-renders (a reload always shows it
// either way). Still bounded — the page is already painted; this is a background
// top-up behind an "Updating…" indicator, never a blocking load.
const REFRESH_TIMEOUT_MS = 12000;

export type RefreshOutcome = { refreshed: boolean; skipped?: string };

export async function requestExternalRefresh(
  id: string,
): Promise<RefreshOutcome> {
  const { env } = getCloudflareContext();
  const rawBase = env.CEN_SCRAPER_URL?.trim();
  const secret = env.CEN_REFRESH_SECRET?.trim();
  // Unconfigured (or not an external id) → no-op, render the cached projection.
  if (!rawBase || !secret || !id.includes(":")) {
    return { refreshed: false, skipped: "not_configured" };
  }

  // Tolerate a scheme-less value (e.g. "data.fault.foundation"): without this,
  // fetch() throws "Invalid URL", which the catch below swallowed as a silent
  // {refreshed:false} — so a bare-hostname CEN_SCRAPER_URL made every on-demand
  // refresh a no-op and left active brackets perpetually stale.
  const base = (
    /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`
  ).replace(/\/$/, "");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
      signal: controller.signal,
    });
    if (!res.ok) return { refreshed: false, skipped: `status_${res.status}` };
    const data = (await res.json().catch(() => ({}))) as {
      refreshed?: boolean;
    };
    return { refreshed: Boolean(data.refreshed) };
  } catch {
    return { refreshed: false, skipped: "error" };
  } finally {
    clearTimeout(timer);
  }
}
