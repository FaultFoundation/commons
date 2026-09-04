import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import {
  mergeChrome,
  type PanelChrome,
} from "@/components/dashboard/bubbles/PanelChrome";
import { ComingSoonIntegration } from "@/components/dashboard/accounts/ComingSoonIntegration";
import { DensityRow } from "@/components/dashboard/accounts/DensityRow";
import { IntegrationCard } from "@/components/dashboard/accounts/IntegrationCard";
import { RecheckConnectionsButton } from "@/components/dashboard/accounts/RecheckConnectionsButton";
import {
  AvatarRow,
  EmailRow,
  NameRow,
  PasswordRow,
  SetPasswordRow,
} from "@/components/dashboard/accounts/ProfileRows";
import { TwoFactorRows } from "@/components/dashboard/accounts/TwoFactorRows";
import type { Density } from "@/lib/density";
import type { ConnectIntegration, DiscordIntegration } from "@/lib/integrations";
import { discordServerNote } from "@/lib/integrations-shared";
import type { RegistrationState } from "@/lib/registration";

/**
 * The Settings tab's bubbles, as pinnable panels — each renders its own
 * `Bubble`, so the Settings page and the Home board mount the SAME component
 * and can't drift apart. Shared components (no directive): they render from a
 * server page and from the client board alike.
 *
 * Each panel takes plain, already-fetched data: the reads stay in the page (or
 * lib/home.ts) so a panel can be dropped anywhere without dragging a D1 query
 * with it. See components/dashboard/bubbles/PanelChrome.tsx for the contract.
 */

const SCHOOL_LOCK_NOTE = "Schools can only be changed by a support member";

export type ProfilePanelData = {
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  registration: RegistrationState | null;
};

export function ProfilePanel({
  data,
  verifyError,
  chrome,
}: {
  data: ProfilePanelData;
  /** Better Auth bounces email-verification failures back with `?error=`; only
      the Settings tab reads that param, so Home simply never passes one. */
  verifyError?: string;
  chrome?: PanelChrome;
}) {
  const reg = data.registration;
  const status = reg?.status ?? null;
  const hasSchool = Boolean(reg?.schoolName);

  return (
    <Bubble title="Profile" {...mergeChrome(chrome, { span: "full" })}>
      {verifyError ? (
        <div className="ff-auth__error" role="alert">
          <p>{verifyError}</p>
        </div>
      ) : null}
      <AvatarRow name={data.name} initialImage={data.image} />
      <NameRow initialName={data.name} />
      <EmailRow initialEmail={data.email} verified={data.emailVerified} />
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
  );
}

export type SecurityPanelData = {
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  hasTotp: boolean;
  email: string;
};

export function SecurityPanel({
  data,
  chrome,
}: {
  data: SecurityPanelData;
  chrome?: PanelChrome;
}) {
  return (
    <Bubble title="Security" {...mergeChrome(chrome)}>
      {data.hasPassword ? <PasswordRow /> : <SetPasswordRow />}
      <TwoFactorRows
        enabled={data.twoFactorEnabled}
        hasTotp={data.hasTotp}
        hasPassword={data.hasPassword}
        email={data.email}
      />
    </Bubble>
  );
}

export function DisplayPanel({
  density,
  chrome,
}: {
  density: Density;
  chrome?: PanelChrome;
}) {
  return (
    <Bubble title="Display" {...mergeChrome(chrome)}>
      <DensityRow initial={density} />
    </Bubble>
  );
}

export type IntegrationsPanelData = {
  discord: DiscordIntegration;
  discordEnabled: boolean;
  battlenetLinked: boolean;
  battlenetHandle: string | null;
  battlenetEnabled: boolean;
  connects: ConnectIntegration[];
};

export function IntegrationsPanel({
  data,
  callbackURL = "/account/",
  chrome,
}: {
  data: IntegrationsPanelData;
  /** Where the OAuth popup returns to — the tab the card was clicked on, so a
      member who links from Home lands back on Home. */
  callbackURL?: string;
  chrome?: PanelChrome;
}) {
  return (
    <Bubble
      title="Integrations"
      {...mergeChrome(chrome, { actions: <RecheckConnectionsButton /> })}
    >
      <div className="ff-integrations">
        <IntegrationCard
          provider="discord"
          label="Discord"
          linked={data.discord.linked}
          handle={data.discord.handle}
          enabled={data.discordEnabled}
          note={discordServerNote(data.discord.inGuild)}
          linkLabel="Link Discord"
          callbackURL={callbackURL}
        />
        <IntegrationCard
          provider="battlenet"
          label="Blizzard"
          linked={data.battlenetLinked}
          handle={data.battlenetHandle}
          enabled={data.battlenetEnabled}
          linkLabel="Link Blizzard"
          callbackURL={callbackURL}
        />
        {data.connects.map((c) => (
          <IntegrationCard
            key={c.id}
            provider={c.id}
            label={c.label}
            linked={c.linked}
            handle={c.handle}
            enabled={c.enabled}
            reachable={c.reachable}
            linkLabel={c.linkLabel}
            callbackURL={callbackURL}
          />
        ))}
        <ComingSoonIntegration
          label="LeagueSpot"
          mark="LS"
          note="No public sign-in to connect yet — we'll add it when LeagueSpot opens one up."
        />
      </div>
    </Bubble>
  );
}
