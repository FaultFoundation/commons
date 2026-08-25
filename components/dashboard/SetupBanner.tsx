import { eq, sql } from "drizzle-orm";

import {
  account,
  programMemberships,
  teamMembers,
  tournamentParticipants,
  user,
} from "@/db/schema";
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

  if (!emailVerified || !discordLinked) {
    return (
      <Banner>
        Action Required: Please finish{" "}
        <a href="/account/setup/">Setting Up</a> your account.
      </Banner>
    );
  }

  if (!state?.hasTeam) {
    return (
      <Banner>
        Action Required: <a href="/teams/">Create or join a Team</a> to start
        playing.
      </Banner>
    );
  }

  if (!state?.hasEntry) {
    return (
      <Banner>
        Action Required: <a href="/tournaments/">Join a Tournament</a> to get on
        the schedule.
      </Banner>
    );
  }

  return null;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <section className="ff-banner" role="status">
      {children}
    </section>
  );
}
