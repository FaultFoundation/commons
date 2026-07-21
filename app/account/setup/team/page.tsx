import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { Disclosure } from "@/components/dashboard/bubbles/Disclosure";
import { SetupShell } from "@/components/dashboard/setup/SetupShell";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Team",
  robots: { index: false },
};

export default async function TeamSetupPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <SetupShell step={3}>
      <div className="ff-bubble-grid ff-bubble-grid--single">
        <Bubble title="Your Team" span="full">
          <Disclosure
            label="Already Have a Team"
            note="Join a roster your captain already created."
          >
            <div className="ff-bubble__wip">Work in progress</div>
          </Disclosure>
          <Disclosure
            label="Looking for a Team"
            note="Put your name in the free-agent pool."
          >
            <div className="ff-bubble__wip">Work in progress</div>
          </Disclosure>
          <Disclosure
            label="Looking for Players"
            note="Create a team and recruit."
          >
            <div className="ff-bubble__wip">Work in progress</div>
          </Disclosure>
        </Bubble>

        <Bubble title="Your Tournaments" span="full">
          <BubbleRow
            label="Overfault"
            value="Open for registration"
            note="Collegiate Overwatch — our flagship tournament."
            action={
              <a className="ff-btn ff-btn--sm" href="/tournaments/#overfault">
                Join
              </a>
            }
          />
          <div className="ff-reg__nav">
            <a
              className="ff-btn ff-btn--outline"
              href="/account/setup/integrations/"
            >
              Back
            </a>
            <a className="ff-btn" href="/home/">
              Finish
            </a>
          </div>
        </Bubble>
      </div>
    </SetupShell>
  );
}
