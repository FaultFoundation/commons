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
// now holds interactive state: a tab with sub-tabs (Admin, Experimental)
// expands IN PLACE into a dropdown beneath its own row, rather than sliding
// the whole rail across to a second panel. Everything stays on screen — the
// sibling tabs never leave, so there is nothing to go "Back" from, and an
// indent (no tray surface, no smaller type) is what says "these belong to the
// tab above".
// DashboardShell stays a server component and hands this a fully-resolved,
// serializable model — including whether the Admin group is present at all.
//
// It also owns the admin two-factor step-up, because both ways of reaching it
// land here: clicking the Admin group (which prompts *before* the sub-tabs are
// revealed, rather than letting someone browse a menu they can't use yet), and
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

/** Points right when collapsed; the CSS rotates it down when expanded. */
function Chevron() {
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

  // Land with the active group already expanded, so navigating between its
  // sub-pages never collapses the menu the member is working inside. Groups
  // open independently of one another — one being open is no reason to shut
  // another, now that expanding costs no one their place in the rail.
  const [openKeys, setOpenKeys] = useState<string[]>(() =>
    items
      .filter((item) => item.key === active && item.children?.length)
      .map((item) => item.key),
  );
  const [unlockOpen, setUnlockOpen] = useState(false);
  // The group to expand once the unlock succeeds, and the admin URL the member
  // was originally after (only set when AdminGate bounced them).
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

  function expandGroup(key: string) {
    setOpenKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
  }

  function handleUnlocked() {
    setUnlockOpen(false);
    // Resume the admin page they asked for. A full navigation rather than a
    // client one: the unlock cookie was just set in a server action, and this
    // guarantees the whole tree is re-rendered with it.
    if (resumeTo.current) {
      window.location.assign(resumeTo.current);
      return;
    }
    // Opened from the rail — drop open the group they clicked and let the
    // server tree re-render with adminLocked now false.
    if (pendingGroup.current) expandGroup(pendingGroup.current);
    pendingGroup.current = null;
    router.refresh();
  }

  function toggleGroup(item: NavItem, isOpen: boolean) {
    if (!isOpen && item.key === "admin" && adminLocked) {
      pendingGroup.current = item.key;
      setUnlockOpen(true);
      return;
    }
    setOpenKeys((keys) =>
      isOpen ? keys.filter((key) => key !== item.key) : [...keys, item.key],
    );
  }

  return (
    <div className="ff-dash__nav-body">
      <nav className="ff-dash__nav-list">
        {items.map((item) => {
          if (item.children?.length) {
            const isOpen = openKeys.includes(item.key);
            const panelId = `ff-dash-subnav-${item.key}`;
            return (
              <div key={item.key} className="ff-dash__group">
                <button
                  type="button"
                  className="ff-dash__link ff-dash__link--group"
                  aria-current={item.key === active ? "page" : undefined}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(item, isOpen)}
                >
                  <span>{item.label}</span>
                  <Chevron />
                </button>
                {/* Collapsed, this is a zero-height clipped row (the height
                    animates through grid-template-rows), so `inert` is what
                    keeps the hidden sub-tabs out of the tab order and the
                    accessibility tree. */}
                <div
                  id={panelId}
                  className="ff-dash__subnav"
                  data-open={isOpen || undefined}
                  inert={!isOpen || undefined}
                >
                  <div className="ff-dash__subnav-inner">
                    <div className="ff-dash__sublist">
                      {item.children.map((child) => (
                        <Link
                          key={child.key}
                          className="ff-dash__link ff-dash__link--child"
                          href={child.href}
                          prefetch={false}
                          aria-current={
                            active === item.key && activeChild === child.key
                              ? "page"
                              : undefined
                          }
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
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
