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
import { getProfileByUserId } from "@/lib/registration";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accounts",
  robots: { index: false },
};

export default async function AccountsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const db = getDb();
  const profile = await getProfileByUserId(session.user.id);
  const accountRows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, session.user.id));
  const hasPassword = accountRows.some((r) => r.providerId === "credential");
  const discordLinked = accountRows.some((r) => r.providerId === "discord");

  const status = profile?.status ?? null;
  const hasSchool = Boolean(profile?.schoolName);

  return (
    <DashboardShell active="accounts" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Accounts</h1>
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
              <BubbleRow label="School" value={profile?.schoolName} locked />
              <BubbleRow
                label="School Email"
                value={profile?.schoolEmail ?? undefined}
                locked
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
              value="Not registered"
              note="Verify your school to become a member."
              action={
                <a className="ff-btn ff-btn--sm" href="/dashboard/register/">
                  Register
                </a>
              }
            />
          )}
        </Bubble>

        <Bubble title="Integrations">
          <BubbleRow
            label="Battle.net"
            value="Not connected"
            note="Coming Soon"
            action={
              <button className="ff-btn ff-btn--sm" type="button" disabled>
                Connect
              </button>
            }
          />
          <DiscordRow
            linked={discordLinked}
            username={profile?.discordUsername ?? null}
            discordEnabled={discordAuthEnabled()}
          />
        </Bubble>

        <Bubble title="Player Stats (WIP)" variant="wip">
          <div className="ff-bubble__wip">
            Record · Maps Played · Heroes — Coming Soon
          </div>
        </Bubble>

        <Bubble title="Discord (WIP)" variant="wip">
          <div className="ff-bubble__wip">
            Roles · Server Activity — shows once your Discord is connected
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
