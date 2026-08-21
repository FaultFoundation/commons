import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Avatar } from "@/components/dashboard/Avatar";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { DangerZonePanel } from "@/components/dashboard/teams/DangerZonePanel";
import { InvitePanel } from "@/components/dashboard/teams/InvitePanel";
import { RosterPanel } from "@/components/dashboard/teams/RosterPanel";
import { TeamSettingsRows } from "@/components/dashboard/teams/TeamSettingsRows";
import { TournamentPanel } from "@/components/dashboard/teams/TournamentPanel";
import { getAuth } from "@/lib/auth";
import { listSchoolCountries } from "@/lib/registration";
import { getTeamDetail, getTeamMembership } from "@/lib/teams";
import { TEAM_ROLE_LABELS, can } from "@/lib/teams-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false },
};

/**
 * One team, as a single column in priority order: who's on it, how to invite
 * more, then reporting a result. The header carries the team's identity and
 * settings; every control below the surface is gated on a capability from
 * lib/teams-shared.ts, so a coach sees the roster and schedule, a captain also
 * sees settings and scores, a manager also sees the danger zone.
 */
export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ invited?: string }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const { teamId } = await params;
  const { invited } = await searchParams;

  // Membership is the whole authorization story for this page: a team you're
  // not on is indistinguishable from one that doesn't exist.
  const membership = await getTeamMembership(session.user.id, teamId);
  if (!membership) notFound();

  const team = await getTeamDetail(teamId);
  if (!team) notFound();

  const role = membership.role;
  const editsSettings = can(role, "editSettings");
  // Only the region picker needs the school directory — don't pay for it
  // otherwise. Scores are entered staff-side now (Challonge), so there's no
  // per-team reporting fetch here anymore.
  const countries = editsSettings ? await listSchoolCountries() : [];
  const managerCount = team.roster.filter((m) => m.role === "manager").length;

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">{team.name}</h1>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        <Bubble
          title={team.tag ? `${team.name} [${team.tag}]` : team.name}
          /* Everyone sees the logo; only members who may edit settings also
             get the upload row below. */
          media={
            <Avatar src={team.logoUrl} name={team.name} shape="team" size="md" />
          }
          actions={
            <span className={`ff-badge ff-badge--${role}`}>
              {TEAM_ROLE_LABELS[role]}
            </span>
          }
        >
          {/* Navigation first: trailing it after the settings list buries it
              under the invite block. */}
          <div className="ff-row__buttons ff-bubble__nav">
            <a className="ff-btn ff-btn--outline ff-btn--sm" href="/teams/">
              All Teams
            </a>
            {team.discordInviteUrl ? (
              <a
                className="ff-btn ff-btn--sm"
                href={team.discordInviteUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Team Discord
              </a>
            ) : null}
          </div>
          <TeamSettingsRows
            teamId={team.id}
            name={team.name}
            tag={team.tag}
            description={team.description}
            collegeName={team.collegeName}
            region={team.region}
            timezone={team.timezone}
            discordInviteUrl={team.discordInviteUrl}
            logoUrl={team.logoUrl}
            countries={countries}
            editable={editsSettings}
          />
          {can(role, "manageInvites") ? (
            <InvitePanel
              teamId={team.id}
              linkToken={team.inviteLinkToken}
              invites={team.invites}
              viewerRole={role}
              defaultOpen={invited === "1"}
            />
          ) : null}
        </Bubble>

        <Bubble
          title="Roster"
          actions={<span className="ff-row__note">{team.roster.length}</span>}
        >
          <RosterPanel
            teamId={team.id}
            roster={team.roster}
            viewerRole={role}
            viewerUserId={session.user.id}
          />
        </Bubble>

        <Bubble title="Tournaments">
          <TournamentPanel
            teamId={team.id}
            entries={team.entries}
            openTournaments={team.openTournaments}
            viewerRole={role}
          />
        </Bubble>

        <Bubble title="Danger Zone" variant="danger">
          <DangerZonePanel
            teamId={team.id}
            teamName={team.name}
            viewerRole={role}
            viewerUserId={session.user.id}
            managerCount={managerCount}
            deleteRequest={team.deleteRequest}
          />
        </Bubble>
      </div>
    </DashboardShell>
  );
}
