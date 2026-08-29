import { eq, sql } from "drizzle-orm";

import {
  account,
  programMemberships,
  teamMembers,
  tournamentParticipants,
  user,
} from "@/db/schema";
import {
  GettingStartedDialog,
  type SetupStep,
} from "@/components/dashboard/GettingStartedDialog";
import { getDb } from "@/lib/db";
import { PROGRAM_COLLEGIATE_ID } from "@/lib/programs";

/**
 * The amber "action required" bar the DashboardShell renders above every
 * tab's bubbles. Exactly one prompt shows at a time, in priority order:
 *
 *   1. setup unfinished (academic email not verified, or Discord unlinked)
 *   2. set up but team-less
 *   3. on a team but not entered in anything
 *
 * Renders nothing once all three hold. Server component — reads per request.
 *
 * It also mounts the Getting Started modal off the *same* read: a large popup
 * (like the 2FA step-up) that auto-opens once a session while any of these steps
 * are outstanding, so a fresh sign-up lands in a guided checklist rather than a
 * bare dashboard. The banner is the persistent nudge after it's dismissed.
 */
export async function SetupBanner({ userId }: { userId: string }) {
  const db = getDb();
  const state = (
    await db
      .select({
        emailVerified: sql<number>`exists(
          select 1 from ${programMemberships}
          where ${programMemberships.userId} = ${userId}
            and ${programMemberships.programId} = ${PROGRAM_COLLEGIATE_ID}
            and ${programMemberships.status} = ${"VERIFIED"}
        )`,
        discordLinked: sql<number>`exists(
          select 1 from ${account}
          where ${account.userId} = ${userId}
            and ${account.providerId} = ${"discord"}
        )`,
        hasTeam: sql<number>`exists(
          select 1 from ${teamMembers}
          where ${teamMembers.userId} = ${userId}
            and ${teamMembers.status} = ${"active"}
        )`,
        hasEntry: sql<number>`exists(
          select 1 from ${tournamentParticipants}
          where ${tournamentParticipants.withdrawnAt} is null
            and ${tournamentParticipants.teamId} in (
              select ${teamMembers.teamId} from ${teamMembers}
              where ${teamMembers.userId} = ${userId}
                and ${teamMembers.status} = ${"active"}
            )
        )`,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
  )[0];

  const emailVerified = Boolean(state?.emailVerified);
  const discordLinked = Boolean(state?.discordLinked);
  const hasTeam = Boolean(state?.hasTeam);
  const hasEntry = Boolean(state?.hasEntry);

  // The Getting Started checklist — same signals as the banner, one step each.
  const steps: SetupStep[] = [
    {
      key: "academic",
      label: "Verify your academic email",
      description: "Confirm your school email to unlock teams and events.",
      done: emailVerified,
      href: "/account/setup/",
      cta: "Verify",
    },
    {
      key: "discord",
      label: "Link Discord",
      description: "Connect your Discord so we can reach you and sync roles.",
      done: discordLinked,
      href: "/account/setup/integrations/",
      cta: "Link",
    },
    {
      key: "team",
      label: "Create or join a team",
      description: "Start a team and invite your players, or join with a link.",
      done: hasTeam,
      href: "/teams/",
      cta: "Go",
    },
    {
      key: "entry",
      label: "Enter a tournament",
      description: "Sign your team up for an open tournament to get scheduled.",
      done: hasEntry,
      href: "/tournaments/",
      cta: "Browse",
    },
  ];

  const banner =
    !emailVerified || !discordLinked ? (
      <Banner>
        Action Required: Please finish{" "}
        <a href="/account/setup/">Setting Up</a> your account.
      </Banner>
    ) : !hasTeam ? (
      <Banner>
        Action Required: <a href="/teams/">Create or join a Team</a> to start
        playing.
      </Banner>
    ) : !hasEntry ? (
      <Banner>
        Action Required: <a href="/tournaments/">Join a Tournament</a> to get on
        the schedule.
      </Banner>
    ) : null;

  return (
    <>
      {banner}
      {/* Mounts only while something is outstanding; auto-opens once a session. */}
      {steps.some((s) => !s.done) ? (
        <GettingStartedDialog steps={steps} />
      ) : null}
    </>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <section className="ff-banner" role="status">
      {children}
    </section>
  );
}
