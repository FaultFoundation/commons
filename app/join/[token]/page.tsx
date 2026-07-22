import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import { withNext } from "@/lib/next-path";
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

/**
 * Signed-out visitors get the plain page shell, not the member portal's —
 * DashboardShell renders the nav and a Sign out button, neither of which
 * means anything to someone who hasn't signed in yet. `ff-dash` still wraps
 * the card so the dashboard type tokens resolve.
 */
function Shell({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  if (signedIn) {
    return (
      <DashboardShell>
        <h1 className="screen-reader-text">Join a Team</h1>
        <div className="ff-bubble-grid ff-bubble-grid--single">{children}</div>
      </DashboardShell>
    );
  }
  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-section">
        <div className="ff-dash ff-join">
          <h1 className="screen-reader-text">Join a Team</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

/** A dead end is never acceptable here — every failure says what to do next. */
function Problem({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  return (
    <Shell signedIn={signedIn}>
      <Bubble title="This Invite Won't Work">
        {children}
        <div className="ff-row__buttons">
          <a className="ff-btn ff-btn--outline" href={signedIn ? "/teams/" : "/"}>
            {signedIn ? "Your Teams" : "Back to The Commons"}
          </a>
        </div>
      </Bubble>
    </Shell>
  );
}

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  const signedIn = Boolean(session);

  const invite = await getInviteByToken(token);
  if (!invite) {
    return (
      <Problem signedIn={signedIn}>
        <p className="ff-auth__hint">
          That link isn&rsquo;t valid. Ask whoever invited you for a fresh one.
        </p>
      </Problem>
    );
  }

  const problem = inviteProblem(invite);
  if (problem) {
    return (
      <Problem signedIn={signedIn}>
        <p className="ff-auth__hint">{INVITE_PROBLEM_MESSAGES[problem]}</p>
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
      region: teams.region,
      collegeName: colleges.name,
    })
    .from(teams)
    .leftJoin(colleges, eq(colleges.id, teams.collegeId))
    .where(and(eq(teams.id, invite.teamId), isNull(teams.disbandedAt)))
    .limit(1);
  const team = teamRows[0];
  if (!team) {
    return (
      <Problem signedIn={signedIn}>
        <p className="ff-auth__hint">That team no longer exists.</p>
      </Problem>
    );
  }

  // Already on it: skip the ceremony.
  if (session) {
    const existing = await getTeamMembership(session.user.id, team.id);
    if (existing) redirect(`/teams/${team.id}/`);
  }

  const role = asTeamRole(invite.role);
  const [verified, conflicts, inviterRows] = await Promise.all([
    session ? isVerifiedMember(session.user.id) : Promise.resolve(false),
    session ? joinConflicts(session.user.id, team.id) : Promise.resolve([]),
    invite.createdByUserId
      ? db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, invite.createdByUserId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  /** The team, as everyone sees it — signed in or not. */
  const details = (
    <>
      <BubbleRow
        label="School"
        value={team.collegeName ?? "Unaffiliated"}
        note={team.description ?? undefined}
      />
      {team.region ? <BubbleRow label="Region" value={team.region} /> : null}
      <BubbleRow
        label="You'd join as"
        value={TEAM_ROLE_LABELS[role]}
        note={TEAM_ROLE_HINTS[role]}
      />
      {inviterRows[0] ? (
        <BubbleRow label="Invited by" value={inviterRows[0].name} />
      ) : null}
    </>
  );

  const title = team.tag ? `${team.name} [${team.tag}]` : team.name;
  const badge = (
    <span className={`ff-badge ff-badge--${role}`}>{TEAM_ROLE_LABELS[role]}</span>
  );

  // --- Signed out: show the team first, sign in second. ------------------
  if (!session) {
    return (
      <Shell signedIn={false}>
        <Bubble title={title} actions={badge}>
          <p className="ff-auth__hint">
            You&rsquo;ve been invited to join this team on The Commons.
          </p>
          {details}
          <div className="ff-row__buttons">
            <a className="ff-btn" href={withNext("/login/", `/join/${token}/`)}>
              Sign in or register to join
            </a>
          </div>
        </Bubble>
      </Shell>
    );
  }

  if (!verified) {
    return (
      <Shell signedIn>
        <Bubble title={title} actions={badge}>
          <p className="ff-auth__hint">
            Teams are for verified members. Verify your academic email and this
            link will work — it stays valid while you do.
          </p>
          {details}
          <div className="ff-row__buttons">
            <a className="ff-btn" href="/account/setup/">
              Finish Setting Up
            </a>
          </div>
        </Bubble>
      </Shell>
    );
  }

  return (
    <Shell signedIn>
      <Bubble title={title} actions={badge}>
        {details}
        {conflicts.length ? (
          <>
            <p className="ff-auth__hint">
              You&rsquo;re already entered in {conflicts[0].tournamentName} with{" "}
              {conflicts[0].teamName}. A player can only enter a tournament with
              one team, so leave that roster first.
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
    </Shell>
  );
}
