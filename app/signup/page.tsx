import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/AuthForm";
import { getAuth, discordAuthEnabled } from "@/lib/auth";

// Rendered per request: reads the session and the Cloudflare env (Discord
// button availability) — must not be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign Up",
  robots: { index: false },
};

export default async function SignupPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard/");
  }

  return (
    <main id="wp--skip-link--target" className="ff-main">
      <div className="ff-container ff-section">
        <div className="ff-auth ff-card">
          <h1 className="ff-auth__title">Create an account</h1>
          <p className="ff-auth__hint">
            Already a member? <Link href="/login/">Sign in</Link>.
          </p>
          <AuthForm mode="signup" discordEnabled={discordAuthEnabled()} />
        </div>
      </div>
    </main>
  );
}
