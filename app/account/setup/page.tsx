import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getRegistrationState } from "@/lib/registration";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

/**
 * Entry point for the setup flow — never renders, just drops the member on
 * whichever step they still owe. Every "finish setting up" link points here
 * so the resume logic lives in exactly one place.
 */
export default async function SetupPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const reg = await getRegistrationState(session.user.id);
  const status = reg?.status ?? null;

  if (status === null) redirect("/account/setup/academic/");
  if (status === "EMAIL_SENT") redirect("/account/setup/code/");
  // MANUAL_REVIEW / INELIGIBLE have nothing to do in step 1 — the academic
  // page renders the appropriate standing message.
  if (status !== "VERIFIED") redirect("/account/setup/academic/");

  const discordRows = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "discord"),
      ),
    )
    .limit(1);

  redirect(
    discordRows.length > 0
      ? "/account/setup/team/"
      : "/account/setup/integrations/",
  );
}
