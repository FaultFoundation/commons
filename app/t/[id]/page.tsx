import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { BracketView } from "@/components/tournaments/BracketView";
import { getOrRefreshSnapshot, getTournament } from "@/lib/tournaments";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  isPublic,
  isTournamentId,
  tournamentPath,
  type BracketSnapshot,
} from "@/lib/tournaments-shared";

// Reads the per-request D1 binding.
export const dynamic = "force-dynamic";

const ORIGIN = "https://commons.fault.foundation";

// ---------------------------------------------------------------------------
// The public bracket, at /t/<id>/.
//
// Lives at /t/ rather than /tournaments/[…] because app/robots.ts disallows the
// whole /tournaments/ prefix (the signed-in member tab). The id is the whole
// URL — no cosmetic name slug — so the link is short and never goes stale on a
// rename. Deliberately signed-out-safe: no session read, nothing gated. A draft
// tournament 404s so its existence stays private.
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tournament = isTournamentId(id) ? await getTournament(id) : null;

  if (!tournament || !isPublic(tournament.status)) {
    return { title: "Tournament", robots: { index: false } };
  }

  const format = TOURNAMENT_FORMAT_LABELS[tournament.format] ?? tournament.format;
  const canonical = `${ORIGIN}${tournamentPath(tournament.id)}`;
  const description = `${format} bracket, standings and results for ${tournament.name}.`;

  // The link preview (Open Graph / Twitter card) shows the tournament's banner
  // and name. The banner is an /api/avatars/… path, so make it absolute against
  // the host the crawler fetched (workers.dev today, the live domain later).
  const host = (await headers()).get("host");
  const origin = host ? `https://${host}` : ORIGIN;
  const images = tournament.bannerUrl
    ? [{ url: `${origin}${tournament.bannerUrl}`, alt: tournament.name }]
    : undefined;

  return {
    title: `${tournament.name} · The Commons`,
    description,
    alternates: { canonical },
    openGraph: {
      title: tournament.name,
      description,
      url: canonical,
      type: "website",
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title: tournament.name,
      description,
      images,
    },
  };
}

export default async function PublicBracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isTournamentId(id)) notFound();

  const tournament = await getTournament(id);
  // A draft tournament is staff-only; 404 rather than 403 keeps its existence
  // out of the answer.
  if (!tournament || !isPublic(tournament.status)) notFound();

  const snapshot = await getOrRefreshSnapshot(tournament);
  const initial: BracketSnapshot = {
    ...snapshot.payload,
    version: snapshot.version,
    nextPollMs:
      tournament.status === "completed" || tournament.status === "cancelled"
        ? null
        : 60_000,
  };

  return (
    <main className="ff-bracket-page">
      <header className="ff-bracket-page__head">
        <h1 className="ff-bracket-page__title">{tournament.name}</h1>
        <p className="ff-bracket-page__sub">
          {TOURNAMENT_FORMAT_LABELS[tournament.format] ?? tournament.format}
          {" · "}
          {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
          {tournament.startsAt
            ? ` · ${tournament.startsAt.toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}`
            : ""}
        </p>
        {tournament.rulesUrl ? (
          <a
            className="ff-btn ff-btn--soft ff-btn--sm"
            href={tournament.rulesUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Rules
          </a>
        ) : null}
      </header>

      <BracketView tournamentId={tournament.id} initial={initial} />
    </main>
  );
}
