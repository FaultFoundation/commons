import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { DeleteAccount } from "@/components/dashboard/accounts/DeleteAccount";
import { IntegrationCard } from "@/components/dashboard/accounts/IntegrationCard";
import {
  EmailRow,
  NameRow,
  PasswordRow,
} from "@/components/dashboard/accounts/ProfileRows";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { account } from "@/db/schema";
import { battlenetAuthEnabled, discordAuthEnabled, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { discordServerNote, loadDiscordIntegration } from "@/lib/integrations";
import { getPlatformIdentity } from "@/lib/platform-identities";
import { getRegistrationState } from "@/lib/registration";

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
  const [reg, discord, battlenetIdentity, accountRows] = await Promise.all([
    getRegistrationState(session.user.id),
    // Also refreshes the stored Discord handle when it has gone stale.
    loadDiscordIntegration(session.user.id, await headers()),
    getPlatformIdentity(session.user.id, "battlenet"),
    db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, session.user.id)),
  ]);
  const hasPassword = accountRows.some((r) => r.providerId === "credential");
  const battlenetLinked = accountRows.some((r) => r.providerId === "battlenet");

  const status = reg?.status ?? null;
  const hasSchool = Boolean(reg?.schoolName);

  return (
    <DashboardShell active="account" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Account</h1>
      <div className="ff-bubble-grid">
        <Bubble title="Profile" span="full">
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
