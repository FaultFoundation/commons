import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { IntegrationCard } from "@/components/dashboard/accounts/IntegrationCard";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { account } from "@/db/schema";
import { battlenetAuthEnabled, discordAuthEnabled, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { discordServerNote, loadDiscordIntegration } from "@/lib/integrations";
import { getPlatformIdentity } from "@/lib/platform-identities";

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

  const [discord, battlenetIdentity, battlenetRows] = await Promise.all([
    // Also refreshes the stored Discord handle when it has gone stale.
    loadDiscordIntegration(session.user.id, await headers()),
    getPlatformIdentity(session.user.id, "battlenet"),
    getDb()
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, session.user.id),
          eq(account.providerId, "battlenet"),
        ),
      )
      .limit(1),
  ]);

  return (
    <SetupShell step={2}>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        <Bubble title="Your Required Integrations" span="full">
          <div className="ff-integrations">
            <IntegrationCard
              provider="discord"
              label="Discord"
              linked={discord.linked}
              handle={discord.handle}
              enabled={discordAuthEnabled()}
              note={discordServerNote(discord.inGuild)}
              linkLabel="Link Discord"
              callbackURL="/account/setup/integrations/"
            />
            <IntegrationCard
              provider="battlenet"
              label="Blizzard"
              linked={battlenetRows.length > 0}
              handle={battlenetIdentity?.handle ?? null}
              enabled={battlenetAuthEnabled()}
              linkLabel="Link Blizzard"
              callbackURL="/account/setup/integrations/"
            />
          </div>
          <div className="ff-reg__nav">
            <a className="ff-btn ff-btn--outline" href="/account/setup/academic/">
              Back
            </a>
            <a className="ff-btn" href="/account/setup/team/">
              Next
            </a>
          </div>
        </Bubble>

        <Bubble title="Your Optional Integrations" span="full" variant="wip">
          <div className="ff-bubble__wip">Work in progress</div>
        </Bubble>
      </div>
    </SetupShell>
  );
}
