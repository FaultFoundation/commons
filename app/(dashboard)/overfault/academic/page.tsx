import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AcademicVerification } from "@/components/dashboard/setup/AcademicVerification";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Academic Verification",
  robots: { index: false },
};

// The body is shared with /verify/academic/ (sign-up forms); /overfault/ is
// the route that sends an outstanding code to the code page.
export default async function AcademicSetupPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  return (
    <SetupShell step={1}>
      <AcademicVerification
        userId={session.user.id}
        nextHref="/overfault/integrations/"
        codeHref="/overfault/code/"
      />
    </SetupShell>
  );
}
