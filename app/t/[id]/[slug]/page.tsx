import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BracketView } from "@/components/tournaments/BracketView";
import { getOrRefreshSnapshot, getTournament } from "@/lib/tournaments";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  isPublic,
  isTournamentId,
  slugifyName,
  tournamentPath,
  type BracketSnapshot,
} from "@/lib/tournaments-shared";

// Reads the per-request D1 binding.
export const dynamic = "force-dynamic";

const ORIGIN = "https://commons.fault.foundation";

// ---------------------------------------------------------------------------
// The public bracket, at /t/<id>/<name>/.
//
// Lives at /t/ rather than /tournaments/[…] because app/robots.ts disallows the
// whole /tournaments/ prefix (the signed-in member tab). The id is the only
// thing looked up; the name segment is cosmetic and re-derived on every render,
// so a stale segment (renamed, or mistyped) redirects to the canonical path
// rather than 404ing — no shared link ever dies.
//
// Deliberately signed-out-safe: no session read, nothing gated. A draft
// tournament 404s so its existence stays private.
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tournament = isTournamentId(id) ? await getTournament(id) : null;

  if (!tournament || !isPublic(tournament.status)) {
    return { title: "Tournament", robots: { index: false } };
  }

  const format = TOURNAMENT_FORMAT_LABELS[tournament.format] ?? tournament.format;
  const canonical = `${ORIGIN}${tournamentPath(tournament.id, tournament.name)}`;

  return {
    title: `${tournament.name} · The Commons`,
    description: `${format} bracket, standings and results for ${tournament.name}.`,
    alternates: { canonical },
    openGraph: {
      title: tournament.name,
      description: `${format} bracket and live results.`,
      url: canonical,
      type: "website",
    },
  };
}

export default async function PublicBracketPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  if (!isTournamentId(id)) notFound();

  const tournament = await getTournament(id);
  // A draft tournament is staff-only; 404 rather than 403 keeps its existence
  // out of the answer.
  if (!tournament || !isPublic(tournament.status)) notFound();

  // Canonicalize the cosmetic segment. Done after the visibility check so a
  // redirect can't be used to probe for drafts.
  if (slug !== slugifyName(tournament.name)) {
    redirect(tournamentPath(tournament.id, tournament.name));
  }

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
            className="ff-btn ff-btn--outline ff-btn--sm"
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
