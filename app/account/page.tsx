import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DeleteAccount } from "@/components/dashboard/accounts/DeleteAccount";
import { DensityRow } from "@/components/dashboard/accounts/DensityRow";
import { IntegrationCard } from "@/components/dashboard/accounts/IntegrationCard";
import {
  AvatarRow,
  EmailRow,
  NameRow,
  PasswordRow,
  SetPasswordRow,
} from "@/components/dashboard/accounts/ProfileRows";
import { TwoFactorRows } from "@/components/dashboard/accounts/TwoFactorRows";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import { account, twoFactor, user } from "@/db/schema";
import { battlenetAuthEnabled, discordAuthEnabled, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DENSITY_COOKIE, asDensity } from "@/lib/density";
import { discordServerNote, loadDiscordIntegration } from "@/lib/integrations";
import { getPlatformIdentity } from "@/lib/platform-identities";
import { getProfile, getRegistrationState } from "@/lib/registration";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false },
};

const SCHOOL_LOCK_NOTE = "Schools can only be changed by a support member";

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
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  // Same cookie-first read as the shell — only the control needs the exact
  // stored value, and it has to agree with the attribute already on .ff-dash.
  const densityCookie = (await cookies()).get(DENSITY_COOKIE)?.value;

  const db = getDb();
  const [reg, discord, battlenetIdentity, accountRows, twoFactorRows, profile, params] =
    await Promise.all([
      getRegistrationState(session.user.id),
      // Also refreshes the stored Discord handle when it has gone stale.
      loadDiscordIntegration(session.user.id, await headers()),
      getPlatformIdentity(session.user.id, "battlenet"),
      db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, session.user.id)),
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
      densityCookie ? null : getProfile(session.user.id),
      searchParams,
    ]);
  const hasPassword = accountRows.some((r) => r.providerId === "credential");
  const battlenetLinked = accountRows.some((r) => r.providerId === "battlenet");
  const twoFactorEnabled = twoFactorRows[0]?.enabled ?? false;
  const hasTotp = Boolean(twoFactorRows[0]?.totpVerified);
  const density = asDensity(densityCookie ?? profile?.density);

  const status = reg?.status ?? null;
  const hasSchool = Boolean(reg?.schoolName);
  const verifyError = params.error ? VERIFY_ERRORS[params.error] : undefined;

  return (
    <DashboardShell active="account" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Account</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Profile" span="full">
          {verifyError ? (
            <div className="ff-auth__error" role="alert">
              <p>{verifyError}</p>
            </div>
          ) : null}
          <AvatarRow
            name={session.user.name}
            initialImage={session.user.image ?? null}
          />
          <NameRow initialName={session.user.name} />
          <EmailRow
            initialEmail={session.user.email}
            verified={session.user.emailVerified}
          />
          {status === "VERIFIED" && hasSchool ? (
            <>
              {/* No `note` on either: the reason lives on the lock glyph's
                  hover, so the two rows don't each spend a line repeating it. */}
              <FieldRow
                label="School"
                value={reg?.schoolName ?? ""}
                locked
                lockTitle={SCHOOL_LOCK_NOTE}
              />
              <FieldRow
                label="School email"
                value={reg?.schoolEmail ?? ""}
                inputType="email"
                locked
                status="verified"
                statusLabel="Verified"
                lockTitle={SCHOOL_LOCK_NOTE}
              />
            </>
          ) : status === "VERIFIED" ? (
            // Verified with no school on file — a guest.
            <BubbleRow
              label="Membership"
              value="Guest"
              note="You're in with community access."
            />
          ) : status === "CONSENT_PENDING" ? (
            <BubbleRow
              label="Membership"
              value="Awaiting consent"
              note="Waiting for your parent or guardian to confirm by email."
              action={
                <a className="ff-btn ff-btn--sm" href="/account/setup/">
                  Resend
                </a>
              }
            />
          ) : status === "MANUAL_REVIEW" ? (
            <BubbleRow
              label="School"
              value="In Review"
              note="Your registration needs a manual check — we've opened a ticket in Discord and will follow up there."
            />
          ) : (
            <BubbleRow
              label="School"
              value="Not verified"
              note="Verify your academic email to become a member."
              action={
                <a className="ff-btn ff-btn--sm" href="/account/setup/">
                  Verify
                </a>
              }
            />
          )}
        </Bubble>

        <Bubble title="Security">
          {hasPassword ? <PasswordRow /> : <SetPasswordRow />}
          <TwoFactorRows
            enabled={twoFactorEnabled}
            hasTotp={hasTotp}
            hasPassword={hasPassword}
            email={session.user.email}
          />
        </Bubble>

        <Bubble title="Display">
          <DensityRow initial={density} />
        </Bubble>

        <Bubble title="Integrations">
          <div className="ff-integrations">
            <IntegrationCard
              provider="discord"
              label="Discord"
              linked={discord.linked}
              handle={discord.handle}
              enabled={discordAuthEnabled()}
              note={discordServerNote(discord.inGuild)}
              linkLabel="Link Discord"
              callbackURL="/account/"
            />
            <IntegrationCard
              provider="battlenet"
              label="Blizzard"
              linked={battlenetLinked}
              handle={battlenetIdentity?.handle ?? null}
              enabled={battlenetAuthEnabled()}
              linkLabel="Link Blizzard"
              callbackURL="/account/"
            />
          </div>
        </Bubble>

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
