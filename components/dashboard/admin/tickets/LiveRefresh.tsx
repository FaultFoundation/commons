"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a ticket view live by re-fetching the server tree on an interval —
 * new mirrored messages and queue changes appear without a manual refresh.
 * Pauses while the tab is hidden so a backgrounded tab isn't polling D1.
 */
export function LiveRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
