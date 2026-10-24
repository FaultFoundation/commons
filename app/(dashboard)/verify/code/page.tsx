import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CodeVerification } from "@/components/dashboard/setup/AcademicVerification";
import { sanitizeNextPath, withNext } from "@/lib/next-path";
import { getSessionCached } from "@/lib/session";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify Your Email",
  robots: { index: false },
};

/** Code entry for /verify/academic/; returns to `?next=` once verified. */
export default async function VerifyCodePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const next = sanitizeNextPath((await searchParams).next) ?? "/home/";

  return (
    <>
      <h1 className="screen-reader-text">Verify Your Email</h1>
      <CodeVerification
        userId={session.user.id}
        nextHref={next}
        changeEmailHref={withNext("/verify/academic/", next)}
        elsewhere={next}
      />
    </>
  );
}
