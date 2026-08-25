"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { sanitizeNextPath } from "@/lib/next-path";

const AdminUnlockDialog = dynamic(
  () =>
    import("@/components/dashboard/admin/AdminUnlockDialog").then(
      (module) => module.AdminUnlockDialog,
    ),
  { ssr: false },
);

// The sidebar rail, extracted from DashboardShell as a client island because it
// now holds interactive state: a tab with sub-tabs (currently only Admin)
// slides the rail across to a second panel with a Back button. DashboardShell
// stays a server component and hands this a fully-resolved, serializable model
// — including whether the Admin group is present at all.
//
// It also owns the admin two-factor step-up, because both ways of reaching it
// land here: clicking the Admin group (which prompts *before* sliding the rail
// across, rather than letting someone browse a menu they can't use yet), and
// arriving at /home/?unlock=1&next=… after AdminGate bounced a direct hit on an
// admin URL. `adminLocked` is UX only — the real boundary is AdminGate and the
// requireAdminUnlock check inside every privileged server action.

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
  adminLocked,
}: {
  items: NavItem[];
  active?: string;
  activeChild?: string;
  /** Staff, but without a current two-factor unlock: prompt before expanding. */
  adminLocked?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Land already inside a group's sub-tabs when the active tab is that group,
  // so navigating between sub-pages never bounces back to the top level.
  const activeGroup = items.find(
    (item) => item.key === active && item.children?.length,
  );
  const [openKey, setOpenKey] = useState<string | null>(
    activeGroup ? activeGroup.key : null,
  );
  const [unlockOpen, setUnlockOpen] = useState(false);
  // The group to slide across to once the unlock succeeds, and the admin URL
  // the member was originally after (only set when AdminGate bounced them).
  const pendingGroup = useRef<string | null>(null);
  const resumeTo = useRef<string | null>(null);

  // AdminGate redirects a locked staff member to /home/?unlock=1&next=<url>.
  // Capture both, open the dialog, then scrub the query: a bookmarked or
  // shared URL shouldn't reopen this, and `next` has no business lingering in
  // the address bar. Sanitized with the same helper the login redirect uses,
  // so a crafted link can't bounce anyone off-site after unlocking.
  const handledDeepLink = useRef(false);
  useEffect(() => {
    if (handledDeepLink.current) return;
    if (searchParams.get("unlock") !== "1") return;
    handledDeepLink.current = true;

    resumeTo.current = sanitizeNextPath(searchParams.get("next"));
    pendingGroup.current = "admin";
    setUnlockOpen(true);

    const rest = new URLSearchParams(searchParams);
    rest.delete("unlock");
    rest.delete("next");
    const query = rest.toString();
    router.replace(window.location.pathname + (query ? `?${query}` : ""), {
      scroll: false,
    });
  }, [searchParams, router]);

  function handleUnlocked() {
    setUnlockOpen(false);
    // Resume the admin page they asked for. A full navigation rather than a
    // client one: the unlock cookie was just set in a server action, and this
    // guarantees the whole tree is re-rendered with it.
    if (resumeTo.current) {
      window.location.assign(resumeTo.current);
      return;
    }
    // Opened from the rail — slide across to the group they clicked and let
    // the server tree re-render with adminLocked now false.
    if (pendingGroup.current) setOpenKey(pendingGroup.current);
    pendingGroup.current = null;
    router.refresh();
  }

  function openGroup(item: NavItem) {
    if (item.key === "admin" && adminLocked) {
      pendingGroup.current = item.key;
      setUnlockOpen(true);
      return;
    }
    setOpenKey(item.key);
  }

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
                  onClick={() => openGroup(item)}
                >
                  <span>{item.label}</span>
                  <ChevronRight />
                </button>
              );
            }
            return item.href ? (
              <Link
                key={item.key}
                className="ff-dash__link"
                href={item.href}
                prefetch={false}
                aria-current={item.key === active ? "page" : undefined}
              >
                {item.label}
              </Link>
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
            <Link
              key={child.key}
              className="ff-dash__link ff-dash__link--child"
              href={child.href}
              prefetch={false}
              aria-current={
                active === openItem.key && activeChild === child.key
                  ? "page"
                  : undefined
              }
            >
              {child.label}
            </Link>
          ))}
        </nav>
      </div>

      {unlockOpen ? (
        <AdminUnlockDialog
          open
          onClose={() => {
            setUnlockOpen(false);
            pendingGroup.current = null;
            resumeTo.current = null;
          }}
          onUnlocked={handleUnlocked}
        />
      ) : null}
    </div>
  );
}
