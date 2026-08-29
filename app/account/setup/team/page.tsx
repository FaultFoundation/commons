import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { Disclosure } from "@/components/dashboard/bubbles/Disclosure";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { CopyInviteButton } from "@/components/dashboard/teams/CopyInviteButton";
import { CreateTeamForm } from "@/components/dashboard/teams/CreateTeamForm";
import { JoinByLinkForm } from "@/components/dashboard/teams/JoinByLinkForm";
import { listGames } from "@/lib/games";
import { getRegistrationStateCached } from "@/lib/registration";
import { getSessionCached } from "@/lib/session";
import { listMyTeams } from "@/lib/teams";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Team",
  robots: { index: false },
};

export default async function TeamSetupPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const [myTeams, reg, games] = await Promise.all([
    listMyTeams(session.user.id),
    getRegistrationStateCached(session.user.id),
    listGames(),
  ]);
  const status = reg?.status ?? null;
  const verified = status === "VERIFIED";

  return (
    <SetupShell step={3}>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        <Bubble title="Your Team" span="full">
          {myTeams.map((team) => (
            <BubbleRow
              key={team.id}
              label={team.name}
              value={`${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
              note="You're on this team."
              action={
                <div className="ff-row__buttons">
                  {team.inviteToken ? (
                    <CopyInviteButton token={team.inviteToken} small />
                  ) : null}
                  <a
                    className="ff-btn ff-btn--outline ff-btn--sm"
                    href={`/teams/${team.id}/`}
                  >
                    Open
                  </a>
                </div>
              }
            />
          ))}

          {verified ? (
            <>
              <Disclosure
                label="Already Have a Team"
                note="Paste the invite link your captain sent you."
              >
                <JoinByLinkForm />
              </Disclosure>
              <Disclosure
                label="Looking for Players"
                note="Create a team and invite people with a link."
              >
                <CreateTeamForm compact games={games} />
              </Disclosure>
              <Disclosure
                label="Looking for a Team"
                note="Put your name in the free-agent pool."
              >
                {/* The LFG tables ship with this pass; the pool's UI is next. */}
                <div className="ff-bubble__wip">Work in progress</div>
              </Disclosure>
            </>
          ) : status === "MANUAL_REVIEW" ? (
            <BubbleRow
              label="Membership"
              value="Under review"
              note="Your registration needs a manual check. We've opened a ticket in Discord — we'll follow up with you there."
            />
          ) : status === "CONSENT_PENDING" ? (
            <BubbleRow
              label="Membership"
              value="Awaiting consent"
              note="Waiting for your parent or guardian to confirm by email. Teams open up once they do."
              action={
                <a className="ff-btn ff-btn--sm" href="/account/setup/">
                  Resend
                </a>
              }
            />
          ) : (
            <BubbleRow
              label="Membership"
              value="Not verified yet"
              note="Finish step 1 and teams open up."
              action={
                <a className="ff-btn ff-btn--sm" href="/account/setup/">
                  Verify
                </a>
              }
            />
          )}
        </Bubble>

        <Bubble title="Your Tournaments" span="full">
          <BubbleRow
            label="Tournaments"
            value="Browse what's open"
            note="Collegiate Overwatch events run here. Enter an open tournament from your team's page."
            action={
              <a className="ff-btn ff-btn--sm" href="/tournaments/">
                View
              </a>
            }
          />
          <div className="ff-reg__nav">
            <a
              className="ff-btn ff-btn--outline"
              href="/account/setup/integrations/"
            >
              Back
            </a>
            <a className="ff-btn" href="/home/">
              Finish
            </a>
          </div>
        </Bubble>
      </div>
    </SetupShell>
  );
}
