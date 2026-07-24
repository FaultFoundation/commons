import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { AdminUnlock } from "@/components/dashboard/admin/AdminUnlock";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { twoFactor, user } from "@/db/schema";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { getDb } from "@/lib/db";
import { syncStaffRolesFromDiscord } from "@/lib/integrations";
import { getSessionCached } from "@/lib/session";
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
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const userId = session.user.id;

  // Discord-linked role detection is kept OFF the common render path: the live
  // refresh re-runs this every few seconds, and syncing hits the Discord API
  // (token refresh + a fetch) which blows the Worker's CPU budget. Only a
  // not-yet-staff visitor pays for it (once — they're then staff or redirected);
  // for existing staff the sync runs at unlock instead (app/admin/actions.ts).
  let staff = await requireStaffCapability(userId, "viewAdmin");
  if (!staff.ok) {
    await syncStaffRolesFromDiscord(userId, requestHeaders);
    staff = await requireStaffCapability(userId, "viewAdmin");
  }
  if (!staff.ok) redirect("/home/");

  // Common path first, and cheap: a valid unlock cookie needs no DB read, so a
  // page under the live-refresh doesn't pay for the 2FA lookup every few
  // seconds. The 2FA state is only needed to render the prompts below.
  if (await isAdminUnlocked(userId)) {
    return <>{children}</>;
  }

  // Not unlocked — read the 2FA state from D1 (not the session, which can be
  // cookie-cached and stale after enrolling in another tab). One row gives both
  // `enabled` (is a second factor required) and `verified` (is TOTP an option
  // or only email).
  const rows = await getDb()
    .select({ enabled: user.twoFactorEnabled, totpVerified: twoFactor.verified })
    .from(user)
    .leftJoin(twoFactor, eq(twoFactor.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!rows[0]?.enabled) {
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

  const methods = rows[0]?.totpVerified ? ["totp", "otp"] : ["otp"];
  return (
    <div className="ff-bubble-grid">
      <Bubble title="Verify to Continue" span="full">
        <p>
          Confirm it&rsquo;s you before making changes. This keeps admin access
          unlocked for a short while.
        </p>
        <AdminUnlock methods={methods} email={session.user.email} />
      </Bubble>
    </div>
  );
}
