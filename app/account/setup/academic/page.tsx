import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AcademicStep,
  type AcademicInitialState,
} from "@/components/dashboard/setup/AcademicStep";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import {
  getRegistrationStateCached,
  listSchoolCountries,
} from "@/lib/registration";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Academic Verification",
  robots: { index: false },
};

export default async function AcademicSetupPage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }

  const reg = await getRegistrationStateCached(session.user.id);
  const status = reg?.status ?? null;

  // EMAIL_SENT deliberately still renders the form: this is where "Wrong
  // address? Change email" on the code page lands. /account/setup/ is the
  // route that sends an outstanding code to the code page.
  if (status === "VERIFIED") {
    return (
      <SetupShell step={1}>
        <div className="ff-card ff-reg">
          <h2 className="ff-reg__title">You&rsquo;re Verified</h2>
          <p>
            <strong>{reg?.schoolName}</strong> — verified
            {reg?.verifiedAt
              ? ` on ${reg.verifiedAt.toLocaleDateString("en-US", { dateStyle: "long" })}`
              : ""}
            . Schools can only be changed by a support member.
          </p>
          <div className="ff-reg__nav">
            <span />
            <a className="ff-btn" href="/account/setup/integrations/">
              Next
            </a>
          </div>
        </div>
      </SetupShell>
    );
  }

  if (
    status !== null &&
    status !== "MANUAL_REVIEW" &&
    status !== "EMAIL_SENT" &&
    status !== "CONSENT_PENDING"
  ) {
    return (
      <SetupShell step={1}>
        <div className="ff-card ff-reg">
          <h2 className="ff-reg__title">Verification On Hold</h2>
          <p>
            Your registration can&rsquo;t be changed from here. Reach out to
            the staff on Discord or email support@fault.foundation.
          </p>
        </div>
      </SetupShell>
    );
  }

  const countries = await listSchoolCountries();

  const initial: AcademicInitialState = {
    status,
    userType: reg?.userType ?? null,
    ageRange: reg?.ageRange ?? null,
    country: reg?.country ?? null,
    schoolName: reg?.schoolName ?? null,
    schoolWebsite: reg?.schoolWebsite ?? null,
    schoolEmail: reg?.schoolEmail ?? null,
    graduationDate: reg?.graduationDate ?? null,
    countries,
  };

  return (
    <SetupShell step={1}>
      <AcademicStep initial={initial} />
    </SetupShell>
  );
}
