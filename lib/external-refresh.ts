import { getCloudflareContext } from "@opennextjs/cloudflare";

// The Commons' side of the on-demand external-tournament refresh. The Commons
// never writes cen-sql itself — it asks the cen-scraper Worker to re-pull one
// tournament (which owns every write), then re-reads the freshened projection.
// Everything here is best-effort: any missing config, timeout, or error
// degrades to { refreshed:false } and the caller just renders the cache.

const REFRESH_TIMEOUT_MS = 4000;

export type RefreshOutcome = { refreshed: boolean; skipped?: string };

export async function requestExternalRefresh(
  id: string,
): Promise<RefreshOutcome> {
  const { env } = getCloudflareContext();
  const base = env.CEN_SCRAPER_URL?.trim();
  const secret = env.CEN_REFRESH_SECRET?.trim();
  // Unconfigured (or not an external id) → no-op, render the cached projection.
  if (!base || !secret || !id.includes(":")) {
    return { refreshed: false, skipped: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/refresh`, {
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
