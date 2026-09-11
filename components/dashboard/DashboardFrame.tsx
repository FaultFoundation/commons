"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Density } from "@/lib/density";

// Shared server layouts persist during navigation, so route-dependent styling
// follows the URL in this small client wrapper instead of a stale page prop.
export function DashboardFrame({ density, surface, children }: {
  density: Density;
  surface?: "technical";
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div
      data-density={density}
      data-surface={pathname === "/admin" || pathname.startsWith("/admin/") ? "technical" : surface}
      className="ff-container ff-container--wide ff-section--tight ff-dash"
    >
      {children}
    </div>
  );
}
