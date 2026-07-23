"use client";

import { useState } from "react";

// The sidebar rail, extracted from DashboardShell as a client island because it
// now holds interactive state: a tab with sub-tabs (currently only Admin)
// slides the rail across to a second panel with a Back button. DashboardShell
// stays a server component and hands this a fully-resolved, serializable model
// — including whether the Admin group is present at all.

export type NavChild = { key: string; label: string; href: string };
export type NavItem = {
  key: string;
  label: string;
  /** Absent = no page yet (rendered dimmed) unless `children` is set. */
  href?: string;
  children?: NavChild[];
};

function ChevronRight() {
  return (
    <svg
      className="ff-dash__chevron"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeft() {
  return (
    <svg
      className="ff-dash__chevron"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 4L6 8l4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashboardNav({
  items,
  active,
  activeChild,
}: {
  items: NavItem[];
  active?: string;
  activeChild?: string;
}) {
  // Land already inside a group's sub-tabs when the active tab is that group,
  // so navigating between sub-pages never bounces back to the top level.
  const activeGroup = items.find(
    (item) => item.key === active && item.children?.length,
  );
  const [openKey, setOpenKey] = useState<string | null>(
    activeGroup ? activeGroup.key : null,
  );
  const openItem =
    openKey != null ? (items.find((item) => item.key === openKey) ?? null) : null;
  const showingSub = openItem != null;

  return (
    <div className="ff-dash__nav-viewport">
      <div
        className="ff-dash__nav-track"
        data-open={showingSub ? "sub" : "main"}
      >
        {/* Panel 1 — top-level tabs */}
        <nav className="ff-dash__nav-panel" inert={showingSub || undefined}>
          {items.map((item) => {
            if (item.children?.length) {
              return (
                <button
                  key={item.key}
                  type="button"
                  className="ff-dash__link ff-dash__link--group"
                  aria-current={item.key === active ? "page" : undefined}
                  aria-expanded={openKey === item.key}
                  onClick={() => setOpenKey(item.key)}
                >
                  <span>{item.label}</span>
                  <ChevronRight />
                </button>
              );
            }
            return item.href ? (
              <a
                key={item.key}
                className="ff-dash__link"
                href={item.href}
                aria-current={item.key === active ? "page" : undefined}
              >
                {item.label}
              </a>
            ) : (
              <span
                key={item.key}
                className="ff-dash__link ff-dash__link--soon"
                aria-disabled="true"
                title="Coming soon"
              >
                {item.label}
              </span>
            );
          })}
        </nav>

        {/* Panel 2 — sub-tabs of the open group */}
        <nav className="ff-dash__nav-panel" inert={!showingSub || undefined}>
          <button
            type="button"
            className="ff-dash__link ff-dash__back"
            onClick={() => setOpenKey(null)}
          >
            <ChevronLeft />
            <span>{openItem ? openItem.label : "Back"}</span>
          </button>
          {openItem?.children?.map((child) => (
            <a
              key={child.key}
              className="ff-dash__link ff-dash__link--child"
              href={child.href}
              aria-current={
                active === openItem.key && activeChild === child.key
                  ? "page"
                  : undefined
              }
            >
              {child.label}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
