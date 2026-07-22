import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { CopyInviteButton } from "@/components/dashboard/teams/CopyInviteButton";
import { TeamsActions } from "@/components/dashboard/teams/TeamsActions";
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

      {/* Starting, finding and recruiting are actions, not cards — the tab
          itself is the member's teams. */}
      <TeamsActions verified={verified} />

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

        {myTeams.length === 0 ? (
          <Bubble title="No Teams Yet" span="full">
            <p className="ff-auth__hint">
              Start a team above and invite your players with a link — or open
              the invite link a captain sent you and you&rsquo;ll land on their
              roster.
            </p>
          </Bubble>
        ) : null}
      </div>
    </DashboardShell>
  );
}
