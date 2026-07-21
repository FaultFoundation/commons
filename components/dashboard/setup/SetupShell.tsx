import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/DashboardShell";

const STEPS = ["Academic verification", "Integrations", "Registration"];

/**
 * Chrome for every /account/setup page: the portal shell (Account tab
 * active) plus the numbered step rail. Deliberately does NOT pass
 * setupUserId — these pages *are* the setup, so the "action required"
 * banner would just point at itself.
 *
 * `step` is 1-based. The code-entry page belongs to step 1, so it passes 1.
 */
export function SetupShell({
  step,
  children,
}: {
  step: 1 | 2 | 3;
  children: ReactNode;
}) {
  return (
    <DashboardShell active="account">
      <h1 className="screen-reader-text">Account Setup</h1>
      <ol className="ff-reg__steps" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              i + 1 === step
                ? "ff-reg__step ff-reg__step--current"
                : i + 1 < step
                  ? "ff-reg__step ff-reg__step--done"
                  : "ff-reg__step"
            }
            aria-current={i + 1 === step ? "step" : undefined}
          >
            {label}
          </li>
        ))}
      </ol>
      {children}
    </DashboardShell>
  );
}
