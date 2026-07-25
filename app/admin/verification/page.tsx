import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { VerificationPanel } from "@/components/dashboard/admin/verification/VerificationPanel";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { listManualReviewMembers } from "@/lib/registration";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Verification",
  robots: { index: false },
};

export default async function AdminVerificationPage() {
  return (
    <DashboardShell active="admin" activeChild="verification" surface="technical">
      <h1 className="screen-reader-text">Admin — Verification</h1>
      <AdminGate>
        <VerificationContent />
      </AdminGate>
    </DashboardShell>
  );
}

async function VerificationContent() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const gate = await requireStaffCapability(session.user.id, "verifyMembers");
  if (!gate.ok) redirect("/admin/tickets/");

  const members = await listManualReviewMembers();

  return (
    <div className="ff-bubble-grid">
      <Bubble
        title="Verification Review"
        span="full"
        actions={<span className="ff-row__note">{members.length}</span>}
      >
        {members.length === 0 ? (
          <p className="ff-row__note">Nothing waiting for review.</p>
        ) : (
          <VerificationPanel members={members} />
        )}
      </Bubble>
    </div>
  );
}
