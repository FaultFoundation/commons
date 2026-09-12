import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { SeriesTournamentPanel } from "@/components/dashboard/tournaments/SeriesTournamentPanel";
import { getSeriesProfile, safeDecode } from "@/lib/series-profile";
import { getSessionCached } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tournament",
  robots: { index: false },
};

/**
 * One of a series' tournaments, addressed directly — what the strip links to.
 *
 * This segment is deliberately ONLY the tournament: the hero and the strip live
 * in the layout above, so clicking along the strip replaces just this panel and
 * the header never moves.
 *
 * The tournament must be a MEMBER of the series. Otherwise the strip and the
 * panel would disagree, and the shell would frame a tournament that has nothing
 * to do with the series named above it.
 */
export default async function SeriesTournamentPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const { id: routeId, tid: rawTid } = await params;
  const series = await getSeriesProfile(routeId);
  if (!series) notFound();

  const tid = safeDecode(rawTid);
  const entry = series.tournaments.find((t) => t.id === tid || t.id === rawTid);
  if (!entry) notFound();

  const host = (await headers()).get("host") ?? "commons.fault.foundation";
  return (
    <SeriesTournamentPanel
      entry={entry}
      profileId={series.profile.id}
      userId={session.user.id}
      host={host}
    />
  );
}
