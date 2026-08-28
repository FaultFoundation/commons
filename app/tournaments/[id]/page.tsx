import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { ShareBar } from "@/components/dashboard/tournaments/ShareBar";
import { TournamentRegister } from "@/components/dashboard/tournaments/TournamentRegister";
import { BracketView } from "@/components/tournaments/BracketView";
import { ExternalTournamentView } from "@/components/dashboard/tournaments/ExternalTournamentView";
import { getExternalTournament } from "@/lib/external-tournaments";
import { getSessionCached } from "@/lib/session";
import {
  entrantLabel,
  getOrRefreshSnapshot,
  getTournament,
  listParticipantsWithTeams,
  listRegisterableTeams,
} from "@/lib/tournaments";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  isPublic,
  isRegistrationOpen,
  isTournamentId,
  tournamentPath,
  tournamentShareText,
  type BracketSnapshot,
} from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournament",
  robots: { index: false },
};

/** Decode a route param, tolerating a malformed sequence rather than throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  // External ids carry a `source:` prefix, so the card links encode them; Next
  // hands the param back still-encoded. Internal 6-digit ids are unaffected.
  const id = safeDecode(rawId);
  const hdrs = await headers();
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  // External (start.gg / FACEIT) tournaments carry a `source:` prefixed id and
  // are served the branded read-only view from the cen-sql projection. Internal
  // Challonge-backed tournaments (6-digit ids) fall through to the flow below.
  if (!isTournamentId(id)) {
    const external = await getExternalTournament(id);
    if (!external) notFound();
    return (
      <DashboardShell active="tournaments" setupUserId={session.user.id}>
        <h1 className="screen-reader-text">{external.name}</h1>
        <ExternalTournamentView tournament={external} />
      </DashboardShell>
    );
  }

  const tournament = await getTournament(id);
  // Drafts are staff-only; members can't see them.
  if (!tournament || !isPublic(tournament.status)) notFound();

  const generated = Boolean(tournament.bracketGeneratedAt);
  const [participants, registerableTeams, snapshot] = await Promise.all([
    listParticipantsWithTeams(id),
    listRegisterableTeams(session.user.id, tournament),
    generated ? getOrRefreshSnapshot(tournament) : Promise.resolve(null),
  ]);

  const registrationOpen = isRegistrationOpen(
    tournament.status,
    tournament.registrationOpensAt?.getTime() ?? null,
    tournament.registrationClosesAt?.getTime() ?? null,
  );
  const live =
    tournament.status === "registration" || tournament.status === "active";

  // The public share link (short, no slug), absolute so share intents work.
  const host = hdrs.get("host") ?? "commons.fault.foundation";
  const shareUrl = `https://${host}${tournamentPath(tournament.id)}`;
  const shareMessage = tournamentShareText(tournament.name);

  const initial: BracketSnapshot | null = snapshot
    ? {
        ...snapshot.payload,
        version: snapshot.version,
        nextPollMs:
          tournament.status === "completed" || tournament.status === "cancelled"
            ? null
            : 60_000,
      }
    : null;

  return (
    <DashboardShell active="tournaments" setupUserId={session.user.id}>
      <h1 className="screen-reader-text">{tournament.name}</h1>
      <div className="ff-bubble-grid">
        {/* Hero: banner (or branded gradient) with the name over it, then a
            description and a tight row of stats — no more full-width label rows. */}
        <section className="ff-thero">
          <div
            className="ff-thero__banner"
            style={
              tournament.bannerUrl
                ? { backgroundImage: `url(${tournament.bannerUrl})` }
                : undefined
            }
          >
            <div className="ff-thero__head">
              <span
                className={`ff-thero__status${live ? " ff-thero__status--live" : ""}`}
              >
                {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
              </span>
              <h2 className="ff-thero__title">{tournament.name}</h2>
            </div>
          </div>
          <div className="ff-thero__body">
            {tournament.description ? (
              <p className="ff-thero__desc">{tournament.description}</p>
            ) : null}
            <div className="ff-thero__stats">
              <div className="ff-stat">
                <span className="ff-stat__label">Format</span>
                <span className="ff-stat__value">
                  {TOURNAMENT_FORMAT_LABELS[tournament.format] ?? tournament.format}
                </span>
              </div>
              <div className="ff-stat">
                <span className="ff-stat__label">Entrants</span>
                <span className="ff-stat__value ff-stat__value--hi">
                  {participants.length}
                  {tournament.maxParticipants
                    ? ` / ${tournament.maxParticipants}`
                    : ""}
                </span>
              </div>
              {tournament.startsAt ? (
                <div className="ff-stat">
                  <span className="ff-stat__label">Starts</span>
                  <span className="ff-stat__value">
                    {tournament.startsAt.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              ) : null}
              <div className="ff-stat">
                <span className="ff-stat__label">Verification</span>
                <span className="ff-stat__value">
                  {tournament.academicVerificationRequired ? "Required" : "Open"}
                </span>
              </div>
              <div className="ff-thero__stats-cta">
                <TournamentRegister
                  tournamentId={tournament.id}
                  registrationOpen={registrationOpen}
                  started={generated}
                  academicVerificationRequired={
                    tournament.academicVerificationRequired
                  }
                  teams={registerableTeams.map((t) => ({
                    id: t.id,
                    name: t.name,
                    tag: t.tag,
                    entered: t.entered,
                    memberCount: t.memberCount,
                    unverifiedCount: t.unverifiedCount,
                  }))}
                />
              </div>
            </div>
            <div className="ff-thero__actions">
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
              <ShareBar
                url={shareUrl}
                title={tournament.name}
                message={shareMessage}
              />
            </div>
          </div>
        </section>

        {/* Bracket — blank until it's published; only then does the results
            table (inside BracketView) appear. */}
        <Bubble
          title="Bracket"
          span="full"
          className="ff-bubble--divided"
          actions={
            initial && tournament.externalUrl ? (
              <a
                className="ff-btn ff-btn--outline ff-btn--sm"
                href={tournament.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                View on Challonge
              </a>
            ) : undefined
          }
        >
          {initial ? (
            <BracketView tournamentId={tournament.id} initial={initial} />
          ) : (
            <p className="ff-ticket-empty">No bracket has been published yet.</p>
          )}
        </Bubble>

        {/* Participants — one card per team, seed as a small number in the
            corner, plus a placeholder for the average SR we're adding soon. */}
        <Bubble
          title="Participants"
          span="full"
          actions={<span className="ff-row__note">{participants.length}</span>}
        >
          {participants.length === 0 ? (
            <p className="ff-auth__hint">No teams entered yet.</p>
          ) : (
            <div className="ff-pcard-grid">
              {participants.map((p) => (
                <div className="ff-pcard" key={p.id}>
                  {p.seed ? (
                    <span className="ff-pcard__seed" title={`Seed ${p.seed}`}>
                      {p.seed}
                    </span>
                  ) : null}
                  <div className="ff-pcard__name">
                    {entrantLabel(p.teamName, p.teamTag)}
                  </div>
                  <div className="ff-pcard__sr">
                    Avg SR <span className="ff-pcard__sr-val">—</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Bubble>
      </div>
    </DashboardShell>
  );
}
