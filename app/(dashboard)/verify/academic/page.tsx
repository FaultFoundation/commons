import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AcademicVerification } from "@/components/dashboard/setup/AcademicVerification";
import { sanitizeNextPath, withNext } from "@/lib/next-path";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Academic Verification",
  robots: { index: false },
};

/**
 * Academic verification outside Overfault: where a sign-up form's academic
 * requirement sends a member, and where they return to (`?next=`, same-origin
 * only) once verified. Same body and same per-person record as
 * /overfault/academic/, without the league's step rail.
 */
export default async function VerifyAcademicPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const next = sanitizeNextPath((await searchParams).next) ?? "/home/";

  return (
    <>
      <h1 className="screen-reader-text">Academic Verification</h1>
      <p className="ff-auth__meta">
        <a className="ff-reg__alt ff-reg__alt--inline" href={next}>
          Back
        </a>
      </p>
      <AcademicVerification
        userId={session.user.id}
        nextHref={next}
        codeHref={withNext("/verify/code/", next)}
      />
    </>
  );
}
