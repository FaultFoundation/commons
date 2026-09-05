import { DashboardDataRefresh } from "@/components/dashboard/DashboardDataRefresh";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { HomeBoard } from "@/components/dashboard/home/HomeBoard";
import { DENSITY_COOKIE } from "@/lib/density";
import { loadHomeData } from "@/lib/home";
import { asHomeLayout } from "@/lib/home-shared";
import { getProfileCached } from "@/lib/registration";
import { getSessionCached } from "@/lib/session";
import { TOURNAMENT_LAYOUT_COOKIE } from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false },
};

export default async function HomePage() {
  const session = await getSessionCached();
  if (!session) {
    redirect("/login/");
  }
  const userId = session.user.id;
  const [hdrs, cookieStore, profile] = await Promise.all([
    headers(),
    cookies(),
    getProfileCached(userId),
  ]);

  const layout = asHomeLayout(profile?.homeLayout ?? null);

  // Only the sources the ENABLED widgets declare are read — see lib/home.ts for
  // why the board stopped fetching every tab's data up front.
  const data = await loadHomeData({
    userId,
    layout,
    requestHeaders: hdrs,
    densityCookie: cookieStore.get(DENSITY_COOKIE)?.value,
    tournamentLayoutCookie: cookieStore.get(TOURNAMENT_LAYOUT_COOKIE)?.value,
    sessionUser: {
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
      emailVerified: session.user.emailVerified,
    },
  });

  return (
    <DashboardShell active="home" setupUserId={userId}>
      <h1 className="screen-reader-text">Home</h1>
      <DashboardDataRefresh schedule={Boolean(data.schedule)} tournaments={Boolean(data.tournaments)} />
      <HomeBoard initialLayout={layout} data={data} />
    </DashboardShell>
  );
}
