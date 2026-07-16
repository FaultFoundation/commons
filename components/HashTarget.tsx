"use client";

import { useEffect } from "react";

/**
 * Renders nothing. Makes hash navigation work with collapsible
 * sections: on load, on hashchange, and on same-hash anchor clicks it
 * expands the target <details> and scrolls to it (respecting the
 * sticky-header scroll-margin and prefers-reduced-motion).
 */
export function HashTarget() {
  useEffect(() => {
    const openTarget = (smooth: boolean) => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      const details = el.closest("details");
      if (details && !details.open) details.open = true;
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      el.scrollIntoView({ behavior: smooth && !reduced ? "smooth" : "auto" });
    };

    openTarget(false);
    // The Manrope webfont reflows the page after hydration, which can
    // shift the target away from where the initial jump landed —
    // re-anchor once fonts settle, unless the reader already scrolled.
    let userScrolled = false;
    const markScrolled = () => {
      userScrolled = true;
    };
    window.addEventListener("wheel", markScrolled, { passive: true, once: true });
    window.addEventListener("touchstart", markScrolled, { passive: true, once: true });
    document.fonts?.ready.then(() => {
      if (!userScrolled) openTarget(false);
    });

    const onHashChange = () => openTarget(true);
    // Clicking the already-active TOC link doesn't fire hashchange, but
    // should still re-expand a section the reader collapsed.
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.('a[href^="#"]');
      if (anchor) setTimeout(() => openTarget(true), 0);
    };
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
