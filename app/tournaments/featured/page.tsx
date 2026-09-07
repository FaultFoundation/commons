import Link from "next/link";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TournamentList } from "@/components/dashboard/tournaments/TournamentList";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import { discoveryFollowIds } from "@/lib/discovery";
import { getSessionCached } from "@/lib/session";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Featured Tournaments",
  robots: { index: false },
};
export default async function FeaturedPage() {
  const entries = await loadTournamentEntries();
  const session = await getSessionCached();
  const follows = session ? await discoveryFollowIds(session.user.id) : [];
  const featured = entries.filter(
    (t) =>
      !["completed", "cancelled"].includes(t.status) &&
      (t.discovery?.featured || t.discovery?.audience === "collegiate"),
  );
  return (
    <div className="ff-bubble-grid">
      <h1 className="screen-reader-text">Featured Tournaments</h1>
      <Bubble title="Featured Discovery" span="full">
        <Link href="/tournaments/">← All Tournaments</Link>
        <p>
          Collegiate competitions and staff picks. Suggested labels come from
          source descriptions and can be corrected.
        </p>
        <TournamentList
          tournaments={featured}
          seriesTournaments={entries}
          initialLayout="modern"
          follows={follows}
        />
      </Bubble>
    </div>
  );
}
