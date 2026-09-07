"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Remembered view state — which tab, view, filter set or page a member last had
 * open, restored when they come back to the surface.
 *
 * **Why `localStorage` and not a cookie.** Everything persisted through here is
 * applied entirely in the browser: the list filters run as a `.filter()` over
 * data the server already sent, and a tab switch only decides which already-
 * rendered node is mounted. A cookie would ride along on *every* request to the
 * Worker — assets, the bracket poll route, Better Auth — forever, and the
 * per-tournament keys below are unbounded, so it would be a permanent
 * request-size tax on state the server never reads. The one preference the
 * server genuinely renders from, the tournament card/table layout, stays a
 * cookie (`TOURNAMENT_LAYOUT_COOKIE`) precisely because it has to be known
 * before first paint.
 *
 * **The cost of that choice is one frame.** The first client render has to
 * match the server's HTML, so a stored value is applied in an effect right
 * after hydration. Always pass the same `fallback` the server rendered with, and
 * never persist anything a page's *content* depends on — only which slice of it
 * is shown.
 *
 * Storage can throw outright (Safari private mode, a browser set to block site
 * data), so every access is wrapped and simply degrades to "no memory".
 */

const PREFIX = "ff-view:";

/** Per-tournament keys accumulate as a member browses; keep the newest and drop
    the rest, so a long-lived profile can't grow this without bound. */
const MAX_KEYS = 60;

type Entry = { v: unknown; t: number };

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The raw stored value, or undefined when there's nothing usable. Callers pass
    it through their own reviver — a stored shape can be stale or hand-edited and
    is never trusted as-is. */
export function readViewState(key: string): unknown {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(PREFIX + key);
    if (raw == null) return undefined;
    const parsed = JSON.parse(raw) as Entry;
    return parsed && typeof parsed === "object" ? parsed.v : undefined;
  } catch {
    return undefined;
  }
}

export function writeViewState(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    const full = PREFIX + key;
    // Only a NEW key can push us over the cap, and pruning walks the whole of
    // localStorage — so check before writing rather than on every keystroke.
    const isNew = store.getItem(full) == null;
    store.setItem(full, JSON.stringify({ v: value, t: Date.now() } satisfies Entry));
    if (isNew) prune(store);
  } catch {
    // Quota or a blocked store — the preference just doesn't survive the visit.
  }
}

function prune(store: Storage): void {
  const entries: { key: string; t: number }[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    let t = 0;
    try {
      t = (JSON.parse(store.getItem(key) ?? "{}") as Entry).t ?? 0;
    } catch {
      // Unparseable: treat as oldest so it's the first thing evicted.
    }
    entries.push({ key, t });
  }
  if (entries.length <= MAX_KEYS) return;
  entries
    .sort((a, b) => a.t - b.t)
    .slice(0, entries.length - MAX_KEYS)
    .forEach((e) => store.removeItem(e.key));
}

/**
 * Drop every remembered view — called on sign-out and account deletion. These
 * are only display preferences, but a shared browser shouldn't hand the next
 * person the last one's search box and filters.
 */
export function clearViewState(): void {
  const store = storage();
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => store.removeItem(key));
  } catch {
    // Blocked store — nothing was remembered in the first place.
  }
}

/**
 * `useState` that remembers itself across visits.
 *
 * `revive` turns whatever was stored into a value this surface can actually use
 * — returning `undefined` for anything stale, malformed, or no longer offered
 * (a bracket tab a rebuilt tournament no longer has), which keeps the fallback.
 * It is read through a ref, so an inline closure over current props is fine.
 *
 * A `null` key disables persistence entirely (a surface with nothing stable to
 * key on), leaving a plain `useState`. A non-null key is expected to be stable
 * for the life of the component: restoring happens once, and only a deliberate
 * `set` writes.
 *
 * The third element says whether the restore has happened yet. Gate anything
 * EXPENSIVE that the restored value decides — a fetch, a poll — on it, so the
 * fallback's first frame doesn't kick off work for a panel the member isn't
 * about to see. It's false on the server and on the first client render, so it
 * can't cause a hydration mismatch.
 */
export function usePersistentState<T>(
  key: string | null,
  fallback: T,
  revive: (stored: unknown) => T | undefined,
): [T, (next: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [restored, setRestored] = useState(false);
  const reviveRef = useRef(revive);
  reviveRef.current = revive;

  // Restore AFTER hydration, never during the first render: that render has to
  // reproduce the server's HTML exactly, and the server can't see localStorage.
  useEffect(() => {
    const stored = key ? reviveRef.current(readViewState(key)) : undefined;
    if (stored !== undefined) setValue(stored);
    setRestored(true);
  }, [key]);

  // Only a deliberate change is written — restoring never writes back, so there
  // is no effect that could race the restore and persist the fallback over it.
  const set = useCallback(
    (next: T) => {
      setValue(next);
      if (key) writeViewState(key, next);
    },
    [key],
  );

  return [value, set, restored];
}
