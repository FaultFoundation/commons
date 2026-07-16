import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Member Area",
  robots: { index: false },
};

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <main id="wp--skip-link--target" className="ff-main ff-main--fill">
      <div className="ff-container ff-section">
        <div className="ff-auth ff-auth--wide ff-card">
          <h1 className="ff-auth__title">Member area</h1>
          <p className="ff-auth__hint">
            Signed in as <strong>{session.user.name}</strong> ({session.user.email})
          </p>
          <p>
            This area is a work in progress — member features are on the way.
            Check the{" "}
            <a href="/roadmap/">roadmap</a> to see what&rsquo;s planned, or keep
            an eye on the <a href="/news/">news</a> page for announcements.
          </p>
          <div className="ff-auth__row">
            <a className="ff-btn" href="/">
              Back to the site
            </a>
            <SignOutButton />
          </div>
        </div>
      </div>
    </main>
  );
}
