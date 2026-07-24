import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { DashboardNav, type NavItem } from "@/components/dashboard/DashboardNav";
import { DensityCookie } from "@/components/dashboard/accounts/DensityCookie";
import { SetupBanner } from "@/components/dashboard/SetupBanner";
import { DENSITY_COOKIE, asDensity, type Density } from "@/lib/density";
import { getProfile } from "@/lib/registration";
import { getSessionCached } from "@/lib/session";
import { isStaff } from "@/lib/staff";

export type DashboardNavKey =
  | "home"
  | "schedule"
  | "tournaments"
  | "teams"
  | "account"
  | "admin";

/** Items without an href have no page yet: rendered dimmed and inert. */
const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/home/" },
  { key: "schedule", label: "Schedule", href: "/schedule/" },
  { key: "tournaments", label: "Tournaments", href: "/tournaments/" },
  { key: "teams", label: "Teams", href: "/teams/" },
  { key: "account", label: "Account", href: "/account/" },
];

/** The Admin group, appended only for staff. Its children are the sub-tabs. */
const ADMIN_ITEM: NavItem = {
  key: "admin",
  label: "Admin",
  children: [
    { key: "tickets", label: "Support", href: "/admin/tickets/" },
    { key: "teams", label: "Teams", href: "/admin/teams/" },
    { key: "tournaments", label: "Tournaments", href: "/admin/tournaments/" },
  ],
};

/**
 * The member's bubble-density preference, cookie first.
 *
 * profiles.density is the source of truth, but reading D1 on every render of
 * every tab to place one attribute isn't worth it — the cookie caches it, and
 * setDensity rewrites both together. Only a cold cookie pays for the query;
 * the session is already resolved by the caller and reused here.
 */
async function resolveDensity(userId: string | null): Promise<Density> {
  const cached = (await cookies()).get(DENSITY_COOKIE)?.value;
  if (cached) return asDensity(cached);
  if (!userId) return asDensity(null);
  return asDensity((await getProfile(userId))?.density);
}

/**
 * Shared shell for the member portal: sidebar rail (nav + sign out)
 * beside the page content, inside the regular site header/footer.
 * Active state comes from a prop — portal pages are server components
 * reached by full-page navigations.
 */
export async function DashboardShell({
  active,
  activeChild,
  setupUserId,
  surface,
  children,
}: {
  /** Omit for portal pages reached from cards rather than the nav. */
  active?: DashboardNavKey;
  /** The sub-tab key within a group (e.g. "tickets" under "admin"). */
  activeChild?: string;
  /** When set, the "action required" banner renders above the tab's
      bubbles. Omit on pages that ARE a setup step. */
  setupUserId?: string;
  /** "technical" tightens radius/shadow/padding for the admin surface. */
  surface?: "technical";
  children: ReactNode;
}) {
  const session = await getSessionCached();
  const userId = session?.user.id ?? null;

  // Lands on .ff-dash, which is where the density tokens are defined.
  const [density, showAdmin] = await Promise.all([
    resolveDensity(userId),
    userId ? isStaff(userId) : Promise.resolve(false),
  ]);

  const items = showAdmin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <DensityCookie value={density} />
      <div
        data-density={density}
        data-surface={surface}
        className="ff-container ff-container--wide ff-section--tight ff-dash">
        <aside className="ff-card ff-dash__nav" aria-label="Dashboard">
          <DashboardNav
            items={items}
            active={active}
            activeChild={activeChild}
          />
          <div className="ff-dash__foot">
            <SignOutButton />
          </div>
        </aside>
        <div className="ff-dash__content">
          {setupUserId ? <SetupBanner userId={setupUserId} /> : null}
          {children}
        </div>
      </div>
    </main>
  );
}
