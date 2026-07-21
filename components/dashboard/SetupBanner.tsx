import { and, eq, inArray } from "drizzle-orm";

import { account, teamMembers, tournamentParticipants } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getRegistrationState } from "@/lib/registration";

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
  const [reg, discordRows, teamRows] = await Promise.all([
    getRegistrationState(userId),
    db
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
      .limit(1),
    db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.userId, userId), eq(teamMembers.status, "active")),
      ),
  ]);

  const emailVerified = reg?.status === "VERIFIED";
  const discordLinked = discordRows.length > 0;

  if (!emailVerified || !discordLinked) {
    return (
      <Banner>
        Action Required: Please finish{" "}
        <a href="/account/setup/">Setting Up</a> your account.
      </Banner>
    );
  }

  if (teamRows.length === 0) {
    return (
      <Banner>
        Action Required: <a href="/teams/">Create or join a Team</a> to start
        playing.
      </Banner>
    );
  }

  // Solo entries and team entries both count as "in something".
  const entries = await db
    .select({ id: tournamentParticipants.id })
    .from(tournamentParticipants)
    .where(
      inArray(
        tournamentParticipants.teamId,
        teamRows.map((r) => r.teamId),
      ),
    )
    .limit(1);

  if (entries.length === 0) {
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
