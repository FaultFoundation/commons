import type { ReactNode } from "react";
import { cookies, headers } from "next/headers";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { DensityCookie } from "@/components/dashboard/accounts/DensityCookie";
import { SetupBanner } from "@/components/dashboard/SetupBanner";
import { getAuth } from "@/lib/auth";
import { DENSITY_COOKIE, asDensity, type Density } from "@/lib/density";
import { getProfile } from "@/lib/registration";

export type DashboardNavKey =
  | "home"
  | "schedule"
  | "tournaments"
  | "teams"
  | "account";

/** Items without an href have no page yet: rendered dimmed and inert. */
const NAV_ITEMS: { key: DashboardNavKey; label: string; href?: string }[] = [
  { key: "home", label: "Home", href: "/home/" },
  { key: "schedule", label: "Schedule", href: "/schedule/" },
  { key: "tournaments", label: "Tournaments", href: "/tournaments/" },
  { key: "teams", label: "Teams", href: "/teams/" },
  { key: "account", label: "Account", href: "/account/" },
];

/**
 * The member's bubble-density preference, cookie first.
 *
 * profiles.density is the source of truth, but reading D1 on every render of
 * every tab to place one attribute isn't worth it — the cookie caches it, and
 * setDensity rewrites both together. Only a cold cookie pays for the session
 * lookup and the query.
 */
async function resolveDensity(): Promise<Density> {
  const cached = (await cookies()).get(DENSITY_COOKIE)?.value;
  if (cached) return asDensity(cached);

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return asDensity(null);
  return asDensity((await getProfile(session.user.id))?.density);
}

/**
 * Shared shell for the member portal: sidebar rail (nav + sign out)
 * beside the page content, inside the regular site header/footer.
 * Active state comes from a prop — portal pages are server components
 * reached by full-page navigations.
 */
export async function DashboardShell({
  active,
  setupUserId,
  children,
}: {
  /** Omit for portal pages reached from cards rather than the nav. */
  active?: DashboardNavKey;
  /** When set, the "action required" banner renders above the tab's
      bubbles. Omit on pages that ARE a setup step. */
  setupUserId?: string;
  children: ReactNode;
}) {
  // Lands on .ff-dash, which is where the density tokens are defined.
  const density = await resolveDensity();

  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <DensityCookie value={density} />
      <div
        data-density={density}
        className="ff-container ff-container--wide ff-section--tight ff-dash">
        <aside className="ff-card ff-dash__nav" aria-label="Dashboard">
          <nav>
            {NAV_ITEMS.map((item) =>
              item.href ? (
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
              ),
            )}
          </nav>
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
