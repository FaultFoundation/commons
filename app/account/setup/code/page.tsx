import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { CodeStep } from "@/components/dashboard/setup/CodeStep";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { schoolEmailVerifications } from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  getRegistrationStateCached,
} from "@/lib/registration";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify Your Email",
  robots: { index: false },
};

export default async function CodeSetupPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const reg = await getRegistrationStateCached(session.user.id);
  // Nothing outstanding — the resolver knows where this member belongs.
  if (reg?.status !== "EMAIL_SENT") {
    redirect("/account/setup/");
  }

  const row = (
    await getDb()
      .select()
      .from(schoolEmailVerifications)
      .where(eq(schoolEmailVerifications.userId, session.user.id))
      .limit(1)
  )[0];

  const sinceLast = row ? Date.now() - row.lastSentAt.getTime() : 0;

  return (
    <SetupShell step={1}>
      <CodeStep
        email={reg.schoolEmail ?? ""}
        attemptsRemaining={row ? Math.max(0, MAX_ATTEMPTS - row.attempts) : MAX_ATTEMPTS}
        cooldownSeconds={
          row ? Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000)) : 0
        }
      />
    </SetupShell>
  );
}
