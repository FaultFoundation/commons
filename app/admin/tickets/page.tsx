import type { Metadata } from "next";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { TicketQueue } from "@/components/dashboard/admin/tickets/TicketQueue";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Support",
  robots: { index: false },
};

export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return (
    <DashboardShell active="admin" activeChild="tickets" surface="technical">
      <h1 className="screen-reader-text">Admin — Support</h1>
      <AdminGate>
        <TicketQueue view={view} />
      </AdminGate>
    </DashboardShell>
  );
}
