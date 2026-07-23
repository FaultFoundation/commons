import type { Metadata } from "next";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Teams",
  robots: { index: false },
};

export default function AdminTeamsPage() {
  return (
    <DashboardShell active="admin" activeChild="teams" surface="technical">
      <h1 className="screen-reader-text">Admin — Teams</h1>
      <AdminGate>
        <div className="ff-bubble-grid">
          <Bubble title="Teams" variant="wip" span="full">
            <div className="ff-bubble__wip">
              Staff-level team viewing and editing lands here.
            </div>
          </Bubble>
        </div>
      </AdminGate>
    </DashboardShell>
  );
}
