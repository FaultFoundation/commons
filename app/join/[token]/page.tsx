import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { JoinTeamButton } from "@/components/dashboard/teams/JoinTeamButton";
import { colleges, teams, user } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  INVITE_PROBLEM_MESSAGES,
  getInviteByToken,
  getTeamMembership,
  inviteProblem,
  isVerifiedMember,
  joinConflicts,
} from "@/lib/teams";
import { TEAM_ROLE_HINTS, TEAM_ROLE_LABELS, asTeamRole } from "@/lib/teams-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Join a Team",
  robots: { index: false },
};

/** A dead end is never acceptable here — every failure says what to do next. */
function Problem({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      <h1 className="screen-reader-text">Join a Team</h1>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        <Bubble title="This Invite Won't Work" span="full">
          {children}
        </Bubble>
      </div>
    </DashboardShell>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });

  // Signed out: sign in first, then come straight back to this invite.
  if (!session) {
    redirect(`/login/?next=${encodeURIComponent(`/join/${token}/`)}`);
  }

  const invite = await getInviteByToken(token);
  if (!invite) {
    return (
      <Problem>
        <p className="ff-auth__hint">
          That link isn&rsquo;t valid. Ask whoever invited you for a fresh one.
        </p>
        <div className="ff-row__buttons">
          <a className="ff-btn ff-btn--outline" href="/teams/">
            Your Teams
          </a>
        </div>
      </Problem>
    );
  }

  const problem = inviteProblem(invite);
  if (problem) {
    return (
      <Problem>
        <p className="ff-auth__hint">{INVITE_PROBLEM_MESSAGES[problem]}</p>
        <div className="ff-row__buttons">
          <a className="ff-btn ff-btn--outline" href="/teams/">
            Your Teams
          </a>
        </div>
      </Problem>
    );
  }

  const db = getDb();
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      tag: teams.tag,
      description: teams.description,
      collegeName: colleges.name,
    })
    .from(teams)
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .where(and(eq(teams.id, invite.teamId), isNull(teams.disbandedAt)))
    .limit(1);
  const team = teamRows[0];
  if (!team) {
    return (
      <Problem>
        <p className="ff-auth__hint">That team no longer exists.</p>
        <div className="ff-row__buttons">
          <a className="ff-btn ff-btn--outline" href="/teams/">
            Your Teams
          </a>
        </div>
      </Problem>
    );
  }

  // Already on it: skip the ceremony.
  const existing = await getTeamMembership(session.user.id, team.id);
  if (existing) {
    redirect(`/teams/${team.id}/`);
  }

  const [verified, conflicts, inviterRows] = await Promise.all([
    isVerifiedMember(session.user.id),
    joinConflicts(session.user.id, team.id),
    invite.createdByUserId
      ? db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, invite.createdByUserId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (!verified) {
    return (
      <DashboardShell>
        <h1 className="screen-reader-text">Join a Team</h1>
        <div className="ff-bubble-grid ff-bubble-grid--single">
          <Bubble title={`${team.name} Invited You`} span="full">
            <p className="ff-auth__hint">
              Teams are for verified members. Verify your academic email and
              this link will work — it stays valid while you do.
            </p>
            <div className="ff-row__buttons">
              <a className="ff-btn" href="/account/setup/">
                Finish Setting Up
              </a>
            </div>
          </Bubble>
        </div>
      </DashboardShell>
    );
  }

  const role = asTeamRole(invite.role);

  return (
    <DashboardShell>
      <h1 className="screen-reader-text">Join a Team</h1>
      <div className="ff-bubble-grid ff-bubble-grid--single">
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
            label="You'd join as"
            value={TEAM_ROLE_LABELS[role]}
            note={TEAM_ROLE_HINTS[role]}
          />
          {inviterRows[0] ? (
            <BubbleRow label="Invited by" value={inviterRows[0].name} />
          ) : null}

          {conflicts.length ? (
            <>
              <p className="ff-auth__hint">
                You&rsquo;re already entered in {conflicts[0].tournamentName}{" "}
                with {conflicts[0].teamName}. A player can only enter a
                tournament with one team, so leave that roster first.
              </p>
              <div className="ff-row__buttons">
                <a className="ff-btn ff-btn--outline" href="/teams/">
                  Your Teams
                </a>
              </div>
            </>
          ) : (
            <JoinTeamButton token={token} teamName={team.name} />
          )}
        </Bubble>
      </div>
    </DashboardShell>
  );
}
