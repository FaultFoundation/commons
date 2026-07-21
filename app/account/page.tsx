import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DeleteAccount } from "@/components/dashboard/accounts/DeleteAccount";
import { DiscordRow } from "@/components/dashboard/accounts/DiscordRow";
import {
  EmailRow,
  NameRow,
  PasswordRow,
} from "@/components/dashboard/accounts/ProfileRows";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { account } from "@/db/schema";
import { discordAuthEnabled, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPlatformIdentity, getRegistrationState } from "@/lib/registration";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false },
};

const SCHOOL_LOCK_NOTE = "Schools can only be changed by a support member";

export default async function AccountPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const db = getDb();
  const [reg, discordIdentity, accountRows] = await Promise.all([
    getRegistrationState(session.user.id),
    getPlatformIdentity(session.user.id, "discord"),
    db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, session.user.id)),
  ]);
  const hasPassword = accountRows.some((r) => r.providerId === "credential");
  const discordLinked = accountRows.some((r) => r.providerId === "discord");

  const status = reg?.status ?? null;
  const hasSchool = Boolean(reg?.schoolName);

  return (
    <DashboardShell active="account" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Account</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Profile">
          <NameRow initialName={session.user.name} />
          <EmailRow initialEmail={session.user.email} />
          {hasPassword ? (
            <PasswordRow />
          ) : (
            <BubbleRow
              label="Password"
              value="Not set"
              note="You signed in with Discord — no password on this account."
            />
          )}
          {hasSchool ? (
            <>
              <BubbleRow
                label="School"
                value={reg?.schoolName}
                locked
                note={SCHOOL_LOCK_NOTE}
                lockTitle={SCHOOL_LOCK_NOTE}
              />
              <BubbleRow
                label="Academic Email"
                value={reg?.schoolEmail ?? undefined}
                locked
                note={SCHOOL_LOCK_NOTE}
                lockTitle={SCHOOL_LOCK_NOTE}
              />
            </>
          ) : status === "MANUAL_REVIEW" ? (
            <BubbleRow
              label="School"
              value="In Review"
              note="Staff are reviewing your registration."
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

        {/* Reserved slot — keeps the grid balanced until whatever goes
            here (player stats, Discord roles) is designed. */}
        <Bubble title="Coming Soon" variant="wip">
          <div className="ff-bubble__wip" />
        </Bubble>

        <Bubble title="Integrations">
          <DiscordRow
            linked={discordLinked}
            username={discordIdentity?.handle ?? null}
            discordEnabled={discordAuthEnabled()}
            callbackURL="/account/"
          />
          <BubbleRow
            label="Blizzard"
            value="Not connected"
            note="Coming Soon"
            action={
              <button className="ff-btn ff-btn--sm" type="button" disabled>
                Connect
              </button>
            }
          />
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
