import { and, eq } from "drizzle-orm";

import { LinkDiscordButton } from "./LinkDiscordButton";
import { account } from "@/db/schema";
import { discordAuthEnabled } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getProfileByUserId } from "@/lib/registration";

/**
 * The dashboard home "Setup" card: live registration checklist.
 * Server component — reads profile + linked accounts per request.
 */
export async function SetupCard({ userId }: { userId: string }) {
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
  const showDiscordButton = !discordLinked && discordAuthEnabled();

  const status = profile?.status ?? null;
  const emailDone = status === "VERIFIED";
  const done = Number(emailDone) + Number(discordLinked);

  const emailState =
    status === "VERIFIED" ? (
      <>Verified</>
    ) : status === "MANUAL_REVIEW" ? (
      <>In review</>
    ) : status === "EMAIL_SENT" ? (
      <a href="/dashboard/register/">Enter code</a>
    ) : status === null ? (
      <a href="/dashboard/register/">Start</a>
    ) : (
      <>Contact staff</>
    );

  return (
    <section className="ff-card ff-dash-card">
      <h2 className="ff-dash-card__title">
        Setup <span className="ff-dash__hint">{done}/3</span>
      </h2>
      <ul className="ff-setup__list">
        <li className="ff-setup__item">
          <span className="ff-setup__label">
            <span
              className={
                emailDone ? "ff-setup__mark ff-setup__mark--done" : "ff-setup__mark"
              }
              aria-hidden="true"
            >
              {emailDone ? "✓" : "1"}
            </span>
            School email
          </span>
          <span className="ff-setup__state">{emailState}</span>
        </li>
        <li className="ff-setup__item">
          <span className="ff-setup__label">
            <span
              className={
                discordLinked
                  ? "ff-setup__mark ff-setup__mark--done"
                  : "ff-setup__mark"
              }
              aria-hidden="true"
            >
              {discordLinked ? "✓" : "2"}
            </span>
            Discord
          </span>
          <span className="ff-setup__state">
            {discordLinked ? "Linked" : showDiscordButton ? <LinkDiscordButton /> : "Coming soon"}
          </span>
        </li>
        <li className="ff-setup__item ff-setup__item--soon">
          <span className="ff-setup__label">
            <span className="ff-setup__mark" aria-hidden="true">
              3
            </span>
            Battle.net
          </span>
          <span className="ff-setup__state">Coming soon</span>
        </li>
      </ul>
      {!emailDone && (status === null || status === "EMAIL_SENT") ? (
        <p className="ff-setup__cta">
          <a className="ff-btn" href="/dashboard/register/">
            {status === null ? "Register now" : "Finish registration"}
          </a>
        </p>
      ) : null}
    </section>
  );
}
