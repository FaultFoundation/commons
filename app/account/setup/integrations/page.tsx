import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { DiscordRow } from "@/components/dashboard/accounts/DiscordRow";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { account } from "@/db/schema";
import { discordAuthEnabled, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getPlatformIdentity } from "@/lib/registration";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations",
  robots: { index: false },
};

export default async function IntegrationsSetupPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const [discordIdentity, discordRows] = await Promise.all([
    getPlatformIdentity(session.user.id, "discord"),
    getDb()
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "discord"),
        ),
      )
      .limit(1),
  ]);

  return (
    <SetupShell step={2}>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        <Bubble title="Your Integrations (Required)" span="full">
          <DiscordRow
            linked={discordRows.length > 0}
            username={discordIdentity?.handle ?? null}
            discordEnabled={discordAuthEnabled()}
            callbackURL="/account/setup/integrations/"
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
          <div className="ff-reg__nav">
            <a className="ff-btn ff-btn--outline" href="/account/setup/academic/">
              Back
            </a>
            <a className="ff-btn" href="/account/setup/team/">
              Next
            </a>
          </div>
        </Bubble>

        <Bubble title="Your Integrations (Optional)" span="full" variant="wip">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
      </div>
    </SetupShell>
  );
}
