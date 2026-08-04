import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isAdminUnlocked } from "@/lib/admin-unlock";
import { syncStaffRolesFromDiscord } from "@/lib/integrations";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";
import { PATHNAME_HEADER } from "@/middleware";

/**
 * The server-side gate every admin page wraps its content in. Enforcement is
 * here, not in the sidebar: a client that forges the Admin tab still lands on
 * this component, which redirects before any admin content is ever sent.
 * Three layers, in order:
 *   1. authenticated                    -> else /login/
 *   2. holds a staff role (re-read D1)  -> else /home/
 *   3. re-verified with 2FA recently    -> else /home/ with the unlock dialog
 *
 * Every failure is a **redirect**, never a page rendered in place. Someone who
 * types an admin URL without a current unlock shouldn't be parked on a dead-end
 * screen inside a section they can't use — they land back on Home and the
 * two-factor prompt opens there as a dialog (DashboardNav reads `?unlock=1`).
 * `next` carries the URL they wanted so a successful unlock resumes it; it is
 * re-sanitized on the way out by DashboardNav.
 *
 * Non-staff and locked staff are told apart deliberately: a member with no
 * staff role gets a plain bounce to Home with no prompt, because offering to
 * verify would confirm there is an admin area to unlock.
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

  // A valid unlock cookie needs no DB read, so a page under the live-refresh
  // doesn't pay for a 2FA lookup every few seconds. The dialog fetches the 2FA
  // details itself, and only once someone actually opens it — including the
  // "you haven't enrolled yet" case, which used to be a second branch here.
  if (await isAdminUnlocked(userId)) {
    return <>{children}</>;
  }

  const wanted = requestHeaders.get(PATHNAME_HEADER);
  redirect(
    wanted
      ? `/home/?unlock=1&next=${encodeURIComponent(wanted)}`
      : "/home/?unlock=1",
  );
}
