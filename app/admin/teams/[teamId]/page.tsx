import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Avatar } from "@/components/dashboard/Avatar";
import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { AdminRosterPanel } from "@/components/dashboard/admin/teams/AdminRosterPanel";
import { AdminTeamDanger } from "@/components/dashboard/admin/teams/AdminTeamDanger";
import { AdminTeamSettings } from "@/components/dashboard/admin/teams/AdminTeamSettings";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";
import { canAny } from "@/lib/staff-shared";
import { getTeamDetail } from "@/lib/teams";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Team",
  robots: { index: false },
};

export default async function AdminTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  return (
    <DashboardShell active="admin" activeChild="teams" surface="technical">
      <h1 className="screen-reader-text">Admin — Team</h1>
      <AdminGate>
        <TeamContent teamId={teamId} />
      </AdminGate>
    </DashboardShell>
  );
}

/**
 * Rendered only after AdminGate passes. `viewTeams` gates the read (moderator
 * holds it, read-only); `manageTeams` gates every edit control below.
 * `includeDisbanded` so staff can open and restore a disbanded team.
 */
async function TeamContent({ teamId }: { teamId: string }) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const gate = await requireStaffCapability(session.user.id, "viewTeams");
  if (!gate.ok) redirect("/home/");

  const team = await getTeamDetail(teamId, { includeDisbanded: true });
  if (!team) notFound();

  const canEdit = canAny(gate.roles, "manageTeams");

  return (
    <div className="ff-bubble-grid ff-bubble-grid--single">
      <Bubble
        title={team.tag ? `${team.name} [${team.tag}]` : team.name}
        media={
          <Avatar src={team.logoUrl} name={team.name} shape="team" size="md" />
        }
        actions={
          team.disbandedAt ? (
            <span className="ff-badge">Disbanded</span>
          ) : undefined
        }
      >
        <div className="ff-row__buttons ff-bubble__nav">
          <a className="ff-btn ff-btn--outline ff-btn--sm" href="/admin/teams/">
            All Teams
          </a>
          {team.discordInviteUrl ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={team.discordInviteUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Team Discord
            </a>
          ) : null}
        </div>
        <AdminTeamSettings
          teamId={team.id}
          name={team.name}
          tag={team.tag}
          description={team.description}
          collegeName={team.collegeName}
          region={team.region}
          timezone={team.timezone}
          discordInviteUrl={team.discordInviteUrl}
          logoUrl={team.logoUrl}
          editable={canEdit}
        />
      </Bubble>

      <Bubble
        title="Roster"
        actions={<span className="ff-row__note">{team.roster.length}</span>}
      >
        {team.roster.length === 0 ? (
          <p className="ff-row__note">No active members.</p>
        ) : (
          <AdminRosterPanel
            teamId={team.id}
            roster={team.roster}
            editable={canEdit}
          />
        )}
      </Bubble>

      {team.entries.length ? (
        <Bubble title="Tournaments">
          {team.entries.map((entry) => (
            <BubbleRow
              key={entry.participantId}
              label={entry.tournamentName}
              value={entry.status}
            />
          ))}
        </Bubble>
      ) : null}

      {canEdit ? (
        <Bubble title="Danger Zone" variant="danger">
          <AdminTeamDanger
            teamId={team.id}
            teamName={team.name}
            disbanded={team.disbandedAt !== null}
          />
        </Bubble>
      ) : null}
    </div>
  );
}
