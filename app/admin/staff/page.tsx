import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { StaffPanel } from "@/components/dashboard/admin/staff/StaffPanel";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getSessionCached } from "@/lib/session";
import { listAllStaffWithRoles, requireStaffCapability } from "@/lib/staff";
import { STAFF_ROLES, assignableStaffRoles } from "@/lib/staff-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Staff",
  robots: { index: false },
};

export default async function AdminStaffPage() {
  return (
    <DashboardShell active="admin" activeChild="staff" surface="technical">
      <h1 className="screen-reader-text">Admin — Staff</h1>
      <AdminGate>
        <StaffContent />
      </AdminGate>
    </DashboardShell>
  );
}

/**
 * Rendered only after AdminGate passes (staff + 2FA-unlocked). Adds the finer
 * `manageStaff` gate that AdminGate's broad `viewAdmin` doesn't cover, so a
 * moderator who reaches this URL is bounced back to the support queue.
 */
async function StaffContent() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const gate = await requireStaffCapability(session.user.id, "manageStaff");
  if (!gate.ok) redirect("/admin/tickets/");

  const members = await listAllStaffWithRoles();
  const assignableSet = new Set(gate.roles.flatMap(assignableStaffRoles));
  const assignableRoles = STAFF_ROLES.filter((role) => assignableSet.has(role));

  return (
    <div className="ff-bubble-grid">
      <StaffPanel
        members={members}
        assignableRoles={assignableRoles}
        viewerUserId={session.user.id}
      />
    </div>
  );
}
