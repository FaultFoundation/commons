import type { Metadata } from "next";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { TicketDetail } from "@/components/dashboard/admin/tickets/TicketDetail";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Ticket",
  robots: { index: false },
};

export default async function AdminTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return (
    <DashboardShell active="admin" activeChild="tickets" surface="technical">
      <h1 className="screen-reader-text">Admin — Ticket</h1>
      <AdminGate>
        <TicketDetail ticketId={ticketId} />
      </AdminGate>
    </DashboardShell>
  );
}
