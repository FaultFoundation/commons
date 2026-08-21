import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { ComingSoonIntegration } from "@/components/dashboard/accounts/ComingSoonIntegration";
import { IntegrationCard } from "@/components/dashboard/accounts/IntegrationCard";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { account } from "@/db/schema";
import { battlenetAuthEnabled, discordAuthEnabled, getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  discordServerNote,
  loadConnectIntegrations,
  loadDiscordIntegration,
} from "@/lib/integrations";
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

  const [discord, battlenetIdentity, battlenetRows, connectIntegrations] =
    await Promise.all([
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
    loadConnectIntegrations(session.user.id),
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

        <Bubble title="Your Optional Integrations" span="full">
          <div className="ff-integrations">
            {connectIntegrations.map((c) => (
              <IntegrationCard
                key={c.id}
                provider={c.id}
                label={c.label}
                linked={c.linked}
                handle={c.handle}
                enabled={c.enabled}
                linkLabel={c.linkLabel}
                callbackURL="/account/setup/integrations/"
              />
            ))}
            <ComingSoonIntegration
              label="LeagueSpot"
              mark="LS"
              note="No public sign-in to connect yet — we'll add it when LeagueSpot opens one up."
            />
          </div>
        </Bubble>
      </div>
    </SetupShell>
  );
}
