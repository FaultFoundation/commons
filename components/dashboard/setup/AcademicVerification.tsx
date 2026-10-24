import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import {
  AcademicStep,
  type AcademicInitialState,
} from "@/components/dashboard/setup/AcademicStep";
import { CodeStep } from "@/components/dashboard/setup/CodeStep";
import { schoolEmailVerifications } from "@/db/schema";
import { getDb } from "@/lib/db";
import {
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  getRegistrationStateCached,
  listSchoolCountries,
} from "@/lib/registration";

// ---------------------------------------------------------------------------
// The academic-verification step bodies, shared by Overfault's step pages
// (/overfault/academic/, /overfault/code/) and the generic ones a sign-up form
// sends members to (/verify/academic/, /verify/code/ with ?next=). One
// verification per person: whichever page a member uses, it is the same
// collegiate registration underneath, so every form and Overfault see it.
// Each caller supplies the frame (the Overfault step rail, or none) and where
// the flow goes next.
// ---------------------------------------------------------------------------

/**
 * Step 1's body: the verified card, the on-hold card, or the form. EMAIL_SENT
 * deliberately still renders the form — that is where "Wrong address? Change
 * email" on the code page lands.
 */
export async function AcademicVerification({
  userId,
  nextHref,
  codeHref,
}: {
  userId: string;
  nextHref: string;
  codeHref: string;
}) {
  const reg = await getRegistrationStateCached(userId);
  const status = reg?.status ?? null;

  if (status === "VERIFIED") {
    return (
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
          <a className="ff-btn" href={nextHref}>
            Next
          </a>
        </div>
      </div>
    );
  }

  if (
    status !== null &&
    status !== "MANUAL_REVIEW" &&
    status !== "EMAIL_SENT" &&
    status !== "CONSENT_PENDING"
  ) {
    return (
      <div className="ff-card ff-reg">
        <h2 className="ff-reg__title">Verification On Hold</h2>
        <p>
          Your registration can&rsquo;t be changed from here. Reach out to
          the staff on Discord or email support@fault.foundation.
        </p>
      </div>
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

  return <AcademicStep initial={initial} nextHref={nextHref} codeHref={codeHref} />;
}

/**
 * The code-entry body. With no code outstanding there is nothing to enter, so
 * it sends the member to `elsewhere` — the caller's checklist or form, which
 * knows what they owe instead.
 */
export async function CodeVerification({
  userId,
  nextHref,
  changeEmailHref,
  elsewhere,
}: {
  userId: string;
  nextHref: string;
  changeEmailHref: string;
  elsewhere: string;
}) {
  const reg = await getRegistrationStateCached(userId);
  if (reg?.status !== "EMAIL_SENT") redirect(elsewhere);

  const row = (
    await getDb()
      .select()
      .from(schoolEmailVerifications)
      .where(eq(schoolEmailVerifications.userId, userId))
      .limit(1)
  )[0];

  const sinceLast = row ? Date.now() - row.lastSentAt.getTime() : 0;

  return (
    <CodeStep
      email={reg.schoolEmail ?? ""}
      attemptsRemaining={row ? Math.max(0, MAX_ATTEMPTS - row.attempts) : MAX_ATTEMPTS}
      cooldownSeconds={
        row ? Math.max(0, Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000)) : 0
      }
      nextHref={nextHref}
      changeEmailHref={changeEmailHref}
    />
  );
}
