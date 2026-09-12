import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { SeriesTournamentPanel } from "@/components/dashboard/tournaments/SeriesTournamentPanel";
import { getSeriesProfile, preferredTournament } from "@/lib/series-profile";
import { getSessionCached } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Series",
  robots: { index: false },
};

/**
 * The series profile's landing panel.
 *
 * Opening a series lands on a TOURNAMENT — whatever is live, else taking
 * registrations, else next up, else the most recent (`preferredTournament`) —
 * because that is what a member following a season came for. The series' own
 * facts, description and grouped catalog are one click away at the `series`
 * sibling segment, which the strip's first card and the hero eyebrow link to.
 *
 * It RENDERS that tournament rather than redirecting to its `[tid]` URL: the
 * dashboard's loading boundary flushes the shell before this resolves, so a
 * `redirect()` here degrades into a client-side hop — a blank shell, then a
 * second navigation. The layout tells the shell which tournament the index
 * shows (`defaultSelectedId`), so the hero and strip agree with this panel.
 */
export default async function SeriesProfileIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const { id: routeId } = await params;
  const series = await getSeriesProfile(routeId);
  if (!series) notFound();

  const preferred = preferredTournament(series.tournaments);
  if (!preferred) {
    return (
      <p className="ff-ticket-empty">
        No tournaments have been recorded for this {series.kindLabel.toLowerCase()}{" "}
        yet.
      </p>
    );
  }

  const host = (await headers()).get("host") ?? "commons.fault.foundation";
  return (
    <SeriesTournamentPanel
      entry={preferred}
      profileId={series.profile.id}
      userId={session.user.id}
      host={host}
    />
  );
}
