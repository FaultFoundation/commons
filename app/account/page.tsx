import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  DisplayPanel,
  IntegrationsPanel,
  ProfilePanel,
  SecurityPanel,
} from "@/components/dashboard/accounts/AccountPanels";
import { DeleteAccount } from "@/components/dashboard/accounts/DeleteAccount";
import { OAuthPopupBridge } from "@/components/dashboard/accounts/OAuthPopupBridge";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { twoFactor, user } from "@/db/schema";
import { getAccountLinksCached } from "@/lib/account-links";
import { battlenetAuthEnabled, discordAuthEnabled } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getSessionCached } from "@/lib/session";
import { DENSITY_COOKIE, asDensity } from "@/lib/density";
import {
  loadConnectIntegrations,
  loadDiscordIntegration,
} from "@/lib/integrations";
import { getPlatformIdentityCached } from "@/lib/platform-identities";
import {
  getProfileCached,
  getRegistrationStateCached,
} from "@/lib/registration";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false },
};

/** Better Auth redirects here with `?error=` when a verification link fails,
    rather than rendering an error of its own (see the callbackURL passed to
    changeEmail / sendVerificationEmail). */
const VERIFY_ERRORS: Record<string, string> = {
  TOKEN_EXPIRED: "That confirmation link has expired. Send yourself a new one.",
  INVALID_TOKEN: "That confirmation link isn't valid. Send yourself a new one.",
  INVALID_USER: "That confirmation link was for a different account.",
  USER_NOT_FOUND: "That confirmation link was for an account that no longer exists.",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  // Same cookie-first read as the shell — only the control needs the exact
  // stored value, and it has to agree with the attribute already on .ff-dash.
  const densityCookie = (await cookies()).get(DENSITY_COOKIE)?.value;

  const db = getDb();
  const [
    reg,
    discord,
    battlenetIdentity,
    connectIntegrations,
    accountLinks,
    twoFactorRows,
    profile,
    params,
  ] = await Promise.all([
      getRegistrationStateCached(session.user.id),
      // Also refreshes the stored Discord handle when it has gone stale.
      loadDiscordIntegration(session.user.id, await headers()),
      getPlatformIdentityCached(session.user.id, "battlenet"),
      loadConnectIntegrations(session.user.id),
      getAccountLinksCached(session.user.id),
      // Read from D1 rather than the session: `user.two_factor_enabled` is
      // what the sign-in challenge actually consults, and the session here can
      // be served from Better Auth's cookie cache — enrolling in another tab
      // would leave this bubble claiming 2FA is still off.
      //
      // Left join because the two flags mean different things. `enabled` is
      // whether a second factor is required at all; `verified` is whether an
      // authenticator app was ever proven, and enrolling by email leaves a row
      // behind with it still false.
      db
        .select({
          enabled: user.twoFactorEnabled,
          totpVerified: twoFactor.verified,
        })
        .from(user)
        .leftJoin(twoFactor, eq(twoFactor.userId, user.id))
        .where(eq(user.id, session.user.id))
        .limit(1),
      densityCookie ? null : getProfileCached(session.user.id),
      searchParams,
    ]);
  const hasPassword = accountLinks.some((r) => r.providerId === "credential");
  const battlenetLinked = accountLinks.some((r) => r.providerId === "battlenet");
  const twoFactorEnabled = twoFactorRows[0]?.enabled ?? false;
  const hasTotp = Boolean(twoFactorRows[0]?.totpVerified);
  const density = asDensity(densityCookie ?? profile?.density);

  const verifyError = params.error ? VERIFY_ERRORS[params.error] : undefined;

  return (
    <DashboardShell active="account" setupUserId={session.user.id}>
      <OAuthPopupBridge />
      <h1 className="screen-reader-text">Settings</h1>
      <div className="ff-bubble-grid">
        {/* Each bubble is a pinnable panel that renders its own Bubble, so the
            Home board can mount the identical component — see
            components/dashboard/bubbles/PanelChrome.tsx. */}
        <ProfilePanel
          data={{
            name: session.user.name,
            email: session.user.email,
            image: session.user.image ?? null,
            emailVerified: session.user.emailVerified,
            registration: reg,
          }}
          verifyError={verifyError}
        />

        <SecurityPanel
          data={{
            hasPassword,
            twoFactorEnabled,
            hasTotp,
            email: session.user.email,
          }}
        />

        <DisplayPanel density={density} />

        <IntegrationsPanel
          data={{
            discord,
            discordEnabled: discordAuthEnabled(),
            battlenetLinked,
            battlenetHandle: battlenetIdentity?.handle ?? null,
            battlenetEnabled: battlenetAuthEnabled(),
            connects: connectIntegrations,
          }}
        />

        <Bubble title="Danger Zone" variant="danger" span="full">
          <BubbleRow
            label="Account"
            value="Delete your account and personal data"
            note="Signs you out everywhere. School verification can't be transferred."
            action={<DeleteAccount hasPassword={hasPassword} />}
          />
        </Bubble>
      </div>
    </DashboardShell>
  );
}
