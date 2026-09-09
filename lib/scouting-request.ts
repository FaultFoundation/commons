import type { ScoutResponse } from "@/lib/faceit-scouting-shared";

/** Keep authentication failures distinct from provider/network failures. */
export async function scoutRequest(path: string, init?: RequestInit): Promise<ScoutResponse | null> {
  try {
    const res = await fetch(path, { ...init, cache: "no-store" });
    if (res.status === 401) return { status: "unauthorized", player: null, data: null };
    return res.ok ? await res.json() as ScoutResponse : null;
  } catch {
    return null;
  }
}

/** Complete all chunks; only repeated failures/stalled progress interrupt a scan.
 * Successful chunks never consume a match-count or request-count allowance. */
export async function finishDeepScout(
  initial: ScoutResponse,
  advance: () => Promise<ScoutResponse | null>,
  onProgress: (response: ScoutResponse) => void,
  alive: () => boolean,
  pause = () => new Promise<void>(resolve => setTimeout(resolve, 2500)),
): Promise<ScoutResponse | null> {
  let current = initial;
  let failures = 0;
  let stalled = 0;
  while (current.status !== "ready" && alive()) {
    const next = await advance();
    if (!alive()) return null;
    if (next && ["unauthorized", "not_found", "not_configured"].includes(next.status)) return next;
    if (!next || next.status === "error" || !next.player) {
      if (++failures >= 5) return { ...current, status: "error" };
      await pause();
      continue;
    }
    failures = 0;
    const progressed = next.progress?.total !== current.progress?.total ||
      next.progress?.detailed !== current.progress?.detailed ||
      next.player.listDone !== current.player?.listDone;
    stalled = progressed ? 0 : stalled + 1;
    current = next;
    onProgress(current);
    if (current.status !== "ready" && stalled >= 5) return { ...current, status: "error" };
    if (!progressed && current.status !== "ready") await pause();
  }
  return alive() ? current : null;
}
