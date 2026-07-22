import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { DangerZonePanel } from "@/components/dashboard/teams/DangerZonePanel";
import { InvitePanel } from "@/components/dashboard/teams/InvitePanel";
import { RosterPanel } from "@/components/dashboard/teams/RosterPanel";
import { ScoreReporter } from "@/components/dashboard/teams/ScoreReporter";
import { TeamSettingsRows } from "@/components/dashboard/teams/TeamSettingsRows";
import { TournamentPanel } from "@/components/dashboard/teams/TournamentPanel";
import { getAuth } from "@/lib/auth";
import {
  getTeamDetail,
  getTeamMembership,
  listReportableMatches,
} from "@/lib/teams";
import { TEAM_ROLE_LABELS, can } from "@/lib/teams-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false },
};

/**
 * One team's management page. Every bubble below the header is gated on a
 * capability from lib/teams-shared.ts — a coach sees the roster and the
 * schedule, a captain also sees settings and scores, a manager also sees the
 * danger zone.
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
  const matches = can(role, "reportScores")
    ? await listReportableMatches(teamId)
    : [];
  const managerCount = team.roster.filter((m) => m.role === "manager").length;

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">{team.name}</h1>
      <div className="ff-bubble-grid">
        <Bubble
          title={team.tag ? `${team.name} [${team.tag}]` : team.name}
          span="full"
          actions={
            <span className={`ff-badge ff-badge--${role}`}>
              {TEAM_ROLE_LABELS[role]}
            </span>
          }
        >
          <BubbleRow
            label="School"
            value={team.collegeName ?? "Unaffiliated"}
            note={team.description ?? undefined}
          />
          <BubbleRow
            label="Region"
            value={[team.region, team.timezone].filter(Boolean).join(" · ") || "—"}
          />
          <div className="ff-row__buttons">
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

        {can(role, "manageInvites") ? (
          <Bubble title="Invite Players">
            <InvitePanel
              teamId={team.id}
              linkToken={team.inviteLinkToken}
              invites={team.invites}
              viewerRole={role}
              defaultOpen={invited === "1"}
            />
          </Bubble>
        ) : null}

        <Bubble title="Tournaments">
          <TournamentPanel
            teamId={team.id}
            entries={team.entries}
            openTournaments={team.openTournaments}
            viewerRole={role}
          />
        </Bubble>

        {can(role, "reportScores") ? (
          // Full width: the per-game score grid needs the room.
          <Bubble title="Report a Score" span="full">
            <ScoreReporter teamId={team.id} matches={matches} />
          </Bubble>
        ) : null}

        {can(role, "editSettings") ? (
          <Bubble title="Team Settings" span="full">
            <TeamSettingsRows
              teamId={team.id}
              name={team.name}
              tag={team.tag}
              description={team.description}
              region={team.region}
              timezone={team.timezone}
              discordInviteUrl={team.discordInviteUrl}
            />
          </Bubble>
        ) : null}

        <Bubble title="Danger Zone" variant="danger" span="full">
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
