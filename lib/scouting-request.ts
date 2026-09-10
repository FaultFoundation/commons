import type { ScoutResponse } from "@/lib/faceit-scouting-shared";

/** Keep authentication failures distinct from provider/network failures. */
export async function scoutRequest(path: string, init?: RequestInit): Promise<ScoutResponse | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init?.signal?.aborted) abort();
  init?.signal?.addEventListener("abort", abort, { once: true });
  // Allow the server's 30-second chunk deadline plus response/read overhead.
  const timer = setTimeout(abort, 45_000);
  try {
    const res = await fetch(path, { ...init, cache: "no-store", signal: controller.signal });
    if (res.status === 401) return { status: "unauthorized", player: null, data: null };
    return res.ok ? await res.json() as ScoutResponse : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", abort);
  }
}

/** Keep one deep search alive through transient failures and unchanged counts.
 * Counts can stay flat while individual parts of a match are being collected.
 * Only a definitive result or cancellation ends the scan; retries back off. */
export async function finishDeepScout(
  initial: ScoutResponse,
  advance: () => Promise<ScoutResponse | null>,
  onProgress: (response: ScoutResponse) => void,
  alive: () => boolean,
  pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
): Promise<ScoutResponse | null> {
  let current = initial;
  let retries = 0;
  while (current.status !== "ready" && alive()) {
    // The initial lookup uses this same loop, before a player id is available.
    const next = await advance().catch(() => null);
    if (!alive()) return null;
    if (next && ["unauthorized", "not_found", "not_configured"].includes(next.status)) return next;
    if (!next || next.status === "error" || !next.player) {
      await pause(Math.min(30_000, 2500 * 2 ** Math.min(retries++, 4)));
      continue;
    }
    const progressed = next.progress?.total !== current.progress?.total ||
      next.progress?.detailed !== current.progress?.detailed ||
      next.player.listDone !== current.player?.listDone;
    if (progressed) retries = 0;
    current = next;
    onProgress(current);
    if (!progressed && current.status !== "ready") {
      await pause(Math.min(30_000, 2500 * 2 ** Math.min(retries++, 4)));
    }
  }
  return alive() ? current : null;
}
