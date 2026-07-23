import type { Metadata } from "next";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Tournaments",
  robots: { index: false },
};

export default function AdminTournamentsPage() {
  return (
    <DashboardShell active="admin" activeChild="tournaments" surface="technical">
      <h1 className="screen-reader-text">Admin — Tournaments</h1>
      <AdminGate>
        <div className="ff-bubble-grid">
          <Bubble title="Tournaments" variant="wip" span="full">
            <div className="ff-bubble__wip">
              Bracket generation, seeding, and staging land here.
            </div>
          </Bubble>
        </div>
      </AdminGate>
    </DashboardShell>
  );
}
