import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getAuth } from "@/lib/auth";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
};

export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login/");
  }

  return (
    <DashboardShell active="home">
      <header className="ff-dash__head">
        <h1 className="ff-dash__title">Welcome back, {session.user.name}</h1>
        <p className="ff-dash__hint">{session.user.email}</p>
      </header>
      <div className="ff-dash__grid">
        <section className="ff-card ff-dash-card ff-dash-card--bracket">
          <h2 className="ff-dash-card__title">My bracket</h2>
          <div className="ff-dash-card__wip">Work in progress</div>
        </section>
        <section className="ff-card ff-dash-card">
          <h2 className="ff-dash-card__title">Setup</h2>
          <div className="ff-dash-card__wip">Work in progress</div>
        </section>
        <section className="ff-card ff-dash-card">
          <h2 className="ff-dash-card__title">Team</h2>
          <div className="ff-dash-card__wip">Work in progress</div>
        </section>
      </div>
    </DashboardShell>
  );
}
