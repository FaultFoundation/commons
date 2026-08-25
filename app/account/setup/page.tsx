import { redirect } from "next/navigation";

import {
  getRegistrationStateCached,
  getSetupProgressCached,
} from "@/lib/registration";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

/**
 * Entry point for the setup flow — never renders, just drops the member on
 * whichever step they still owe. Every "finish setting up" link points here
 * so the resume logic lives in exactly one place.
 */
export default async function SetupPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const reg = await getRegistrationStateCached(session.user.id);
  const status = reg?.status ?? null;

  if (status === null) redirect("/account/setup/academic/");
  if (status === "EMAIL_SENT") redirect("/account/setup/code/");
  // MANUAL_REVIEW / INELIGIBLE have nothing to do in step 1 — the academic
  // page renders the appropriate standing message.
  if (status !== "VERIFIED") redirect("/account/setup/academic/");

  // Same helper the step rail reads, so "finished" means one thing site-wide.
  const progress = await getSetupProgressCached(session.user.id);

  redirect(
    progress.integrations
      ? "/account/setup/team/"
      : "/account/setup/integrations/",
  );
}
