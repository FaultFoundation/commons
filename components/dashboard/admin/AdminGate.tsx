import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AdminUnlock } from "@/components/dashboard/admin/AdminUnlock";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { twoFactor, user } from "@/db/schema";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { syncStaffRolesFromDiscord } from "@/lib/integrations";
import { requireStaffCapability } from "@/lib/staff";

/**
 * The server-side gate every admin page wraps its content in. Enforcement is
 * here, not in the sidebar: a client that forges the Admin tab still lands on
 * this component, which redirects non-staff away before any admin content is
 * ever sent. Three layers, in order:
 *   1. authenticated                    -> else /login/
 *   2. holds a staff role (re-read D1)  -> else /home/
 *   3. re-verified with 2FA recently    -> else the unlock form, not children
 *
 * Discord-linked roles are reconciled on entry, so gaining the role in Discord
 * is enough to gain access here — no separate manual step.
 */
export async function AdminGate({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login/");
  const userId = session.user.id;

  await syncStaffRolesFromDiscord(userId, requestHeaders);

  const staff = await requireStaffCapability(userId, "viewAdmin");
  if (!staff.ok) redirect("/home/");

  // Read the 2FA state from D1, not the session: the session can be served from
  // Better Auth's cookie cache, so enrolling in another tab would otherwise
  // leave this gate thinking 2FA is still off. One row gives both flags —
  // `enabled` (is a second factor required) and `verified` (was an authenticator
  // ever proven, i.e. is TOTP an option or only email).
  const rows = await getDb()
    .select({ enabled: user.twoFactorEnabled, totpVerified: twoFactor.verified })
    .from(user)
    .leftJoin(twoFactor, eq(twoFactor.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  const twoFactorEnabled = rows[0]?.enabled ?? false;
  const hasTotp = Boolean(rows[0]?.totpVerified);

  if (!twoFactorEnabled) {
    return (
      <div className="ff-bubble-grid">
        <Bubble title="Two-Factor Required" span="full">
          <p>
            Admin actions require two-factor authentication. Turn it on in your
            account, then come back here.
          </p>
          <p>
            <a className="ff-btn" href="/account/">
              Go to Account
            </a>
          </p>
        </Bubble>
      </div>
    );
  }

  if (!(await isAdminUnlocked(userId))) {
    const methods = hasTotp ? ["totp", "otp"] : ["otp"];
    return (
      <div className="ff-bubble-grid">
        <Bubble title="Verify to Continue" span="full">
          <p>
            Confirm it&rsquo;s you before making changes. This keeps admin
            access unlocked for a short while.
          </p>
          <AdminUnlock methods={methods} email={session.user.email} />
        </Bubble>
      </div>
    );
  }

  return <>{children}</>;
}
