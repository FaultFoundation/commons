import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import {
  RegisterFlow,
  type RegisterInitialState,
} from "@/components/dashboard/RegisterFlow";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { schools, schoolEmailVerifications } from "@/db/schema";
import {
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  getProfileByUserId,
} from "@/lib/registration";
import { eq } from "drizzle-orm";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Register",
  robots: { index: false },
};

export default async function RegisterPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  const db = getDb();
  const profile = await getProfileByUserId(session.user.id);
  const status = profile?.status ?? null;

  // Terminal / staff-owned statuses never render the form.
  if (status === "VERIFIED") {
    return (
      <DashboardShell>
        <div className="ff-card ff-reg">
          <h1 className="ff-reg__title">You&rsquo;re Verified</h1>
          <p>
            <strong>{profile?.schoolName}</strong> — verified
            {profile?.verifiedAt
              ? ` on ${profile.verifiedAt.toLocaleDateString("en-US", { dateStyle: "long" })}`
              : ""}
            . Nothing more to do here.
          </p>
          <div className="ff-reg__nav">
            <span />
            <a className="ff-btn" href="/dashboard/">
              Back to dashboard
            </a>
          </div>
        </div>
      </DashboardShell>
    );
  }
  if (status !== null && status !== "EMAIL_SENT" && status !== "MANUAL_REVIEW") {
    return (
      <DashboardShell>
        <div className="ff-card ff-reg">
          <h1 className="ff-reg__title">Registration On Hold</h1>
          <p>
            Your registration can&rsquo;t be changed from here. Reach out to the
            staff on Discord or email support@fault.foundation.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const countryRows = await db
    .selectDistinct({ country: schools.country })
    .from(schools)
    .orderBy(schools.country);

  let verification: RegisterInitialState["verification"] = null;
  if (status === "EMAIL_SENT") {
    const row = (
      await db
        .select()
        .from(schoolEmailVerifications)
        .where(eq(schoolEmailVerifications.userId, session.user.id))
        .limit(1)
    )[0];
    if (row) {
      const sinceLast = Date.now() - row.lastSentAt.getTime();
      verification = {
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - row.attempts),
        cooldownSeconds: Math.max(
          0,
          Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000),
        ),
      };
    }
  }

  const initial: RegisterInitialState = {
    status,
    userType: profile?.userType ?? null,
    ageRange: profile?.ageRange ?? null,
    country: profile?.country ?? null,
    schoolName: profile?.schoolName ?? null,
    schoolWebsite: profile?.schoolWebsite ?? null,
    schoolEmail: profile?.schoolEmail ?? null,
    graduationDate: profile?.graduationDate ?? null,
    countries: countryRows.map((r) => r.country),
    verification,
  };

  return (
    <DashboardShell>
      <h1 className="screen-reader-text">Member Registration</h1>
      <RegisterFlow initial={initial} />
    </DashboardShell>
  );
}
