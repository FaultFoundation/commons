import type { ReactNode } from "react";
import { cookies } from "next/headers";

import { SignOutButton } from "@/components/auth/SignOutButton";
import {
  DashboardNav,
  type NavChild,
  type NavItem,
} from "@/components/dashboard/DashboardNav";
import { DashboardRail } from "@/components/dashboard/DashboardRail";
import { DensityCookie } from "@/components/dashboard/accounts/DensityCookie";
import { SetupBanner } from "@/components/dashboard/SetupBanner";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { DENSITY_COOKIE, asDensity, type Density } from "@/lib/density";
import { getProfileCached } from "@/lib/registration";
import { getSessionCached } from "@/lib/session";
import { getStaffRoles } from "@/lib/staff";
import {
  canAny,
  type StaffCapability,
  type StaffRole,
} from "@/lib/staff-shared";

export type DashboardNavKey =
  | "home"
  | "schedule"
  | "tournaments"
  | "statistics"
  | "teams"
  | "account"
  | "admin";

/** Items without an href have no page yet: rendered dimmed and inert. */
const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", href: "/home/" },
  { key: "schedule", label: "Schedule", href: "/schedule/" },
  { key: "tournaments", label: "Tournaments", href: "/tournaments/" },
  // A group like Admin: slides across to Player / Match sub-tabs. Player Data is
  // live (Overwatch); Match Data is a coming-soon placeholder for now. Per-game
  // stats will grow under here — Overwatch is the only game today.
  {
    key: "statistics",
    label: "Statistics",
    children: [
      { key: "player", label: "Player Data", href: "/statistics/player/" },
      { key: "match", label: "Match Data", href: "/statistics/match/" },
    ],
  },
  { key: "teams", label: "Teams", href: "/teams/" },
  // Route stays /account/ (many callbackURLs and OAuth redirects point at it);
  // only the label reads "Settings".
  { key: "account", label: "Settings", href: "/account/" },
];

/**
 * The Admin group's sub-tabs and the capability each one needs. A staff member
 * only sees the children their roles unlock: a moderator gets Support + Teams
 * (read-only), an owner/admin also gets Staff, a tournament admin only
 * Tournaments. The page-level gate is still the real boundary — this just keeps
 * the rail from offering tabs that would immediately redirect.
 */
const ADMIN_CHILDREN: (NavChild & { capability: StaffCapability })[] = [
  { key: "tickets", label: "Support", href: "/admin/tickets/", capability: "manageTickets" },
  {
    key: "verification",
    label: "Verification",
    href: "/admin/verification/",
    capability: "verifyMembers",
  },
  { key: "teams", label: "Teams", href: "/admin/teams/", capability: "viewTeams" },
  {
    key: "tournaments",
    label: "Tournaments",
    href: "/admin/tournaments/",
    capability: "manageTournaments",
  },
  { key: "staff", label: "Staff", href: "/admin/staff/", capability: "manageStaff" },
];

/** The Admin group for a viewer's roles, or null when they can see nothing. */
function adminItem(roles: StaffRole[]): NavItem | null {
  const children = ADMIN_CHILDREN.filter((child) =>
    canAny(roles, child.capability),
  ).map(({ key, label, href }) => ({ key, label, href }));
  return children.length ? { key: "admin", label: "Admin", children } : null;
}

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
  return asDensity((await getProfileCached(userId))?.density);
}

/**
 * Shared shell for the member portal: sidebar rail (nav + sign out)
 * beside the page content, inside the regular site header/footer.
 * Active state comes from a prop — portal pages are server components
 * replaced through App Router navigation.
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
  const [density, staffRoles] = await Promise.all([
    resolveDensity(userId),
    userId ? getStaffRoles(userId) : Promise.resolve<StaffRole[]>([]),
  ]);

  const admin = adminItem(staffRoles);
  const items = admin ? [...NAV_ITEMS, admin] : NAV_ITEMS;

  // Cookie read, no D1: cheap enough to do on every portal render, which is
  // what lets the rail prompt for two-factor before it expands the Admin
  // group. The dialog fetches the heavier 2FA details only once it opens.
  const adminLocked = admin != null && userId != null
    ? !(await isAdminUnlocked(userId))
    : false;

  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <DensityCookie value={density} />
      <div
        data-density={density}
        data-surface={surface}
        className="ff-container ff-container--wide ff-section--tight ff-dash">
        <DashboardRail>
          <DashboardNav
            items={items}
            active={active}
            activeChild={activeChild}
            adminLocked={adminLocked}
          />
          <div className="ff-dash__foot">
            <SignOutButton />
          </div>
        </DashboardRail>
        <div className="ff-dash__content">
          {setupUserId ? <SetupBanner userId={setupUserId} /> : null}
          {children}
        </div>
      </div>
    </main>
  );
}
