import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ComingSoonIntegration } from "@/components/dashboard/accounts/ComingSoonIntegration";
import { IntegrationCard } from "@/components/dashboard/accounts/IntegrationCard";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { getAccountLinksCached } from "@/lib/account-links";
import { battlenetAuthEnabled, discordAuthEnabled } from "@/lib/auth";
import {
  loadConnectIntegrations,
  loadDiscordIntegration,
} from "@/lib/integrations";
import { discordServerNote } from "@/lib/integrations-shared";
import { getPlatformIdentityCached } from "@/lib/platform-identities";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations",
  robots: { index: false },
};

export default async function IntegrationsSetupPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const [discord, battlenetIdentity, accountLinks, connectIntegrations] =
    await Promise.all([
    // Also refreshes the stored Discord handle when it has gone stale.
    loadDiscordIntegration(session.user.id, await headers()),
    getPlatformIdentityCached(session.user.id, "battlenet"),
    getAccountLinksCached(session.user.id),
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
              linked={accountLinks.some(
                (row) => row.providerId === "battlenet",
              )}
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
                reachable={c.reachable}
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
