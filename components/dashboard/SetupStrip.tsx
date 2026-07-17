import type { ReactNode } from "react";
import { and, eq } from "drizzle-orm";

import { account } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getProfileByUserId } from "@/lib/registration";

/**
 * Slim setup-progress bar the DashboardShell renders above every tab's
 * bubbles. Server component — reads profile + linked accounts per
 * request. Unmounts entirely once all three steps are done.
 */
export async function SetupStrip({ userId }: { userId: string }) {
  const db = getDb();
  const profile = await getProfileByUserId(userId);
  const discordLinked =
    (
      await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
        .limit(1)
    ).length > 0;

  const status = profile?.status ?? null;
  const emailDone = status === "VERIFIED";
  // Battle.net OAuth doesn't exist yet; legacy imports carry a BattleTag.
  const battleNetDone = Boolean(profile?.battleTag);
  const done = Number(emailDone) + Number(battleNetDone) + Number(discordLinked);
  if (done === 3) return null;

  const emailContent: ReactNode = emailDone ? (
    "Email"
  ) : status === "EMAIL_SENT" ? (
    <a href="/dashboard/register/">Enter Code</a>
  ) : status === "MANUAL_REVIEW" ? (
    "Email In Review"
  ) : status === null ? (
    <a href="/dashboard/register/">Verify Email</a>
  ) : (
    "Contact Staff"
  );

  return (
    <section className="ff-strip" aria-label="Account setup">
      <strong className="ff-strip__count">Setup {done}/3</strong>
      <StripItem done={emailDone}>{emailContent}</StripItem>
      <StripItem done={battleNetDone}>
        {battleNetDone ? "Battle.net" : <a href="/dashboard/accounts/">Connect Battle.net</a>}
      </StripItem>
      <StripItem done={discordLinked}>
        {discordLinked ? "Discord" : <a href="/dashboard/accounts/">Connect Discord</a>}
      </StripItem>
    </section>
  );
}

function StripItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <span className={done ? "ff-strip__item ff-strip__item--done" : "ff-strip__item"}>
      <span
        className={done ? "ff-strip__mark ff-strip__mark--done" : "ff-strip__mark"}
        aria-hidden="true"
      >
        {done ? "✓" : ""}
      </span>
      {children}
    </span>
  );
}
