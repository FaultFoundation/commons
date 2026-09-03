import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { DangerZonePanel } from "@/components/dashboard/teams/DangerZonePanel";
import { ExternalTeamView } from "@/components/dashboard/teams/ExternalTeamView";
import { InvitePanel } from "@/components/dashboard/teams/InvitePanel";
import { RosterPanel } from "@/components/dashboard/teams/RosterPanel";
import { TeamHero } from "@/components/dashboard/teams/TeamHero";
import { TeamSettingsRows } from "@/components/dashboard/teams/TeamSettingsRows";
import { TournamentPanel } from "@/components/dashboard/teams/TournamentPanel";
import { listGames } from "@/lib/games";
import { getExternalTeamDetail } from "@/lib/player-data";
import { getSessionCached } from "@/lib/session";
import { listSchoolCountries } from "@/lib/registration";
import { getTeamDetail, getTeamMembership } from "@/lib/teams";
import { can } from "@/lib/teams-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false },
};

/** Decode a route param, tolerating a malformed sequence rather than throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * One team, as a single column in priority order: who's on it, how to invite
 * more, then reporting a result. The header carries the team's identity and
 * settings; every control below the surface is gated on a capability from
 * lib/teams-shared.ts, so a coach sees the roster and schedule, a captain also
 * sees settings and scores, a manager also sees the danger zone.
 *
 * External teams (synced from FACEIT / start.gg) share this route: their ids
 * carry a `provider:` prefix (percent-encoded by the card link, like the
 * tournaments tab), and branch to the read-only ExternalTeamView. Authorization
 * mirrors the internal rule — only a member linked to that external team can
 * open it, and anything else is a 404.
 */
export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ invited?: string }>;
}) {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const { teamId: rawTeamId } = await params;
  const { invited } = await searchParams;
  const teamId = safeDecode(rawTeamId);

  // External team ids carry a `provider:` prefix; internal ids never do.
  if (teamId.includes(":")) {
    const detail = await getExternalTeamDetail(session.user.id, teamId);
    if (!detail) notFound();
    return (
      <DashboardShell active="teams" setupUserId={session.user.id}>
        <h1 className="screen-reader-text">{detail.team.name}</h1>
        <ExternalTeamView detail={detail} />
      </DashboardShell>
    );
  }

  // Membership is the whole authorization story for this page: a team you're
  // not on is indistinguishable from one that doesn't exist.
  const membership = await getTeamMembership(session.user.id, teamId);
  if (!membership) notFound();

  const team = await getTeamDetail(teamId);
  if (!team) notFound();

  const role = membership.role;
  const editsSettings = can(role, "editSettings");
  // Only editors need the school directory (region picker) and the game list —
  // don't pay for either otherwise. Scores are entered staff-side now
  // (Challonge), so there's no per-team reporting fetch here anymore.
  const [countries, games] = editsSettings
    ? await Promise.all([listSchoolCountries(), listGames()])
    : [[], []];
  const managerCount = team.roster.filter((m) => m.role === "manager").length;

  return (
    <DashboardShell active="teams" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">{team.name}</h1>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        {/* Identity + stats + quick links, with the game's colour and mark —
            the "boring, spread-apart" header replaced by a hero. */}
        <TeamHero
          name={team.name}
          tag={team.tag}
          role={role}
          logoUrl={team.logoUrl}
          color={team.color}
          gameName={team.gameName}
          gameLogoUrl={team.gameLogoUrl}
          collegeName={team.collegeName}
          memberCount={team.roster.length}
          avgSr={team.avgSr}
          tournamentCount={team.entries.length}
          discordInviteUrl={team.discordInviteUrl}
        />

        <Bubble title="Team Settings">
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
            color={team.color}
            gameId={team.gameId}
            gameName={team.gameName}
            games={games}
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
          {team.schools.length ? (
            <BubbleRow
              label={team.schools.length === 1 ? "School" : "Schools"}
              value={team.schools.join(", ")}
              note="Across every registered player on the roster."
            />
          ) : null}
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
