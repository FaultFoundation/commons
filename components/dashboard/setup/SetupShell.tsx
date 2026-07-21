import type { ReactNode } from "react";
import { headers } from "next/headers";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getAuth } from "@/lib/auth";
import { getSetupProgress, type SetupProgress } from "@/lib/registration";

const STEPS = [
  {
    key: "academic",
    label: "Academic verification",
    href: "/account/setup/academic/",
  },
  {
    key: "integrations",
    label: "Integrations",
    href: "/account/setup/integrations/",
  },
  { key: "team", label: "Registration", href: "/account/setup/team/" },
] as const satisfies readonly {
  key: keyof SetupProgress;
  label: string;
  href: string;
}[];

/**
 * Chrome for every /account/setup page: the portal shell (Account tab
 * active) plus the numbered step rail. Deliberately does NOT pass
 * setupUserId — these pages *are* the setup, so the "action required"
 * banner would just point at itself.
 *
 * Steps are links, so the rail navigates as well as reports and members
 * aren't confined to Back/Next. A step shows a ✓ only when its requirements
 * are genuinely met (getSetupProgress) — never merely because it sits behind
 * the current one, which used to tick step 1 for people who hadn't verified.
 *
 * `step` is 1-based. The code-entry page belongs to step 1, so it passes 1.
 */
export async function SetupShell({
  step,
  children,
}: {
  step: 1 | 2 | 3;
  children: ReactNode;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const progress = session ? await getSetupProgress(session.user.id) : null;

  return (
    <DashboardShell active="account">
      <h1 className="screen-reader-text">Account Setup</h1>
      <ol className="ff-reg__steps" aria-label="Setup progress">
        {STEPS.map((entry, i) => {
          const isCurrent = i + 1 === step;
          const isDone = progress?.[entry.key] ?? false;
          const classes = ["ff-reg__step"];
          if (isCurrent) classes.push("ff-reg__step--current");
          if (isDone) classes.push("ff-reg__step--done");

          return (
            <li key={entry.key}>
              <a
                className={classes.join(" ")}
                href={entry.href}
                aria-current={isCurrent ? "step" : undefined}
              >
                {entry.label}
                {/* The ✓ is decorative (CSS ::before) — name the state. */}
                {isDone ? (
                  <span className="screen-reader-text"> (completed)</span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ol>
      {children}
    </DashboardShell>
  );
}
