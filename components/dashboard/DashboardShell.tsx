import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { SetupBanner } from "@/components/dashboard/SetupBanner";

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
 * Shared shell for the member portal: sidebar rail (nav + sign out)
 * beside the page content, inside the regular site header/footer.
 * Active state comes from a prop — portal pages are server components
 * reached by full-page navigations.
 */
export function DashboardShell({
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
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-container--wide ff-section--tight ff-dash">
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
