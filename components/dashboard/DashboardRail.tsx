"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Client wrapper around the portal's nav rail that adds the small-screen
 * behaviour DashboardShell (a server component) can't own on its own:
 *
 * - ≥1024px  the rail is the vertical sidebar (default).
 * - 600–1023 it collapses to a pill bar above the content (CSS handles this;
 *            the pills now wrap so every tab is visible).
 * - <600px   a hamburger reveals the rail as a left slide-out drawer.
 *
 * The hamburger and scrim are display:none until the mobile breakpoint, so on
 * larger screens only the <aside> is a grid item and the two-column layout is
 * untouched. A pathname change closes the drawer after client navigation;
 * Escape and a scrim tap close it otherwise.
 */
export function DashboardRail({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="ff-dash__hamburger"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 6h18M3 12h18M3 18h18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span>Menu</span>
      </button>

      {open ? (
        <div
          className="ff-dash__scrim"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className="ff-card ff-dash__nav"
        aria-label="Dashboard"
        data-open={open || undefined}
      >
        <button
          type="button"
          className="ff-dash__drawer-close"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        {children}
      </aside>
    </>
  );
}
