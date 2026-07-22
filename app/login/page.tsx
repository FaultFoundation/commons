import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { getAuth, discordAuthEnabled } from "@/lib/auth";
import { sanitizeNextPath, withNext } from "@/lib/next-path";

// Rendered per request: reads the session and the Cloudflare env (Discord
// button availability) — must not be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  /** `?next=` survives the round trip, so an invite link opened while signed
      out still lands where it meant to. */
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const next = sanitizeNextPath((await searchParams).next);
  if (session) {
    redirect(next ?? "/home/");
  }

  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-section">
        <div className="ff-auth ff-card">
          <h1 className="ff-auth__title">Sign in</h1>
          <p className="ff-auth__hint">
            New to The Fault Foundation?{" "}
            <Link href={withNext("/signup/", next)}>Create an account</Link>.
          </p>
          <AuthForm
            mode="login"
            discordEnabled={discordAuthEnabled()}
            next={next ?? undefined}
          />
        </div>
      </div>
    </main>
  );
}
