import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getSessionCached } from "@/lib/session";

export const dynamic = "force-dynamic";

// Shared across member tabs: only the content below this layout is replaced
// by loading.tsx. Individual pages retain their authorization checks.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (!(await getSessionCached())) redirect("/login/");
  return <DashboardShell>{children}</DashboardShell>;
}
