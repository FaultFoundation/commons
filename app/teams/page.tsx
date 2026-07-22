import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { CopyInviteButton } from "@/components/dashboard/teams/CopyInviteButton";
import { CreateTeamForm } from "@/components/dashboard/teams/CreateTeamForm";
import { getAuth } from "@/lib/auth";
import { isVerifiedMember, listMyTeams } from "@/lib/teams";
import { TEAM_ROLE_LABELS } from "@/lib/teams-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams",
  robots: { index: false },
};

export default async function TeamsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const [myTeams, verified] = await Promise.all([
    listMyTeams(session.user.id),
    isVerifiedMember(session.user.id),
  ]);

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">Teams</h1>
      <div className="ff-bubble-grid">
        {myTeams.map((team) => (
          <Bubble
            key={team.id}
            title={team.tag ? `${team.name} [${team.tag}]` : team.name}
            actions={
              <span className={`ff-badge ff-badge--${team.role}`}>
                {TEAM_ROLE_LABELS[team.role]}
              </span>
            }
          >
            <BubbleRow
              label="Roster"
              value={`${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
              note={team.collegeName ?? undefined}
            />
            <BubbleRow
              label="Tournaments"
              value={team.tournaments.length ? team.tournaments.join(", ") : "Not entered"}
            />
            <div className="ff-row__buttons">
              {team.inviteToken ? (
                <CopyInviteButton token={team.inviteToken} small />
              ) : null}
              <a
                className="ff-btn ff-btn--outline ff-btn--sm"
                href={`/teams/${team.id}/`}
              >
                {team.inviteToken ? "Manage" : "Open"}
              </a>
            </div>
          </Bubble>
        ))}

        <Bubble title={myTeams.length ? "Start Another Team" : "Create a Team"}>
          {verified ? (
            <CreateTeamForm />
          ) : (
            <BubbleRow
              label="Membership"
              value="Not verified yet"
              note="Teams are for verified members — it only takes a minute."
              action={
                <a className="ff-btn ff-btn--sm" href="/account/setup/">
                  Verify
                </a>
              }
            />
          )}
        </Bubble>

        {/* LFG/LFM: the database (lfg_profiles, team_listings,
            lfg_connections) ships with this pass; these two surfaces are the
            next one. */}
        <Bubble title="Find a Team" variant="wip">
          <div className="ff-bubble__wip">
            Set your rank and availability to get matched with teams recruiting
            — coming soon.
          </div>
        </Bubble>
        <Bubble title="Looking for Players" variant="wip">
          <div className="ff-bubble__wip">
            Post the roles and skill range your team needs — coming soon.
          </div>
        </Bubble>
      </div>
    </DashboardShell>
  );
}
