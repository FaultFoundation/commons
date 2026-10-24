import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CodeVerification } from "@/components/dashboard/setup/AcademicVerification";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
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

  // Nothing outstanding sends the member to the checklist, which knows where
  // they belong.
  return (
    <SetupShell step={1}>
      <CodeVerification
        userId={session.user.id}
        nextHref="/overfault/integrations/"
        changeEmailHref="/overfault/academic/"
        elsewhere="/overfault/"
      />
    </SetupShell>
  );
}
