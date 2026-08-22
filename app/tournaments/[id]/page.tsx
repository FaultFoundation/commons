import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { TournamentRegister } from "@/components/dashboard/tournaments/TournamentRegister";
import { BracketView } from "@/components/tournaments/BracketView";
import { getAuth } from "@/lib/auth";
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
  type BracketSnapshot,
} from "@/lib/tournaments-shared";

// Session-gated: always rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tournament",
  robots: { index: false },
};

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/login/");
  if (!isTournamentId(id)) notFound();

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
        {/* Top: condensed info. */}
        <Bubble
          title={tournament.name}
          span="full"
          actions={
            <span className="ff-badge">
              {TOURNAMENT_STATUS_LABELS[tournament.status] ?? tournament.status}
            </span>
          }
        >
          <div className="ff-row__buttons ff-bubble__nav">
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
            <a
              className="ff-btn ff-btn--soft ff-btn--sm"
              href={tournamentPath(tournament.id, tournament.name)}
            >
              Share link
            </a>
          </div>
          <BubbleRow
            label="Format"
            value={
              TOURNAMENT_FORMAT_LABELS[tournament.format] ?? tournament.format
            }
          />
          <BubbleRow
            label="Entrants"
            value={
              tournament.maxParticipants
                ? `${participants.length} of ${tournament.maxParticipants}`
                : String(participants.length)
            }
          />
          {tournament.startsAt ? (
            <BubbleRow
              label="Starts"
              value={tournament.startsAt.toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            />
          ) : null}
          <BubbleRow
            label="Academic verification"
            value={
              tournament.academicVerificationRequired ? "Required" : "Not required"
            }
          />
        </Bubble>

        {/* Bracket. */}
        <Bubble title="Bracket" span="full">
          {initial ? (
            <BracketView tournamentId={tournament.id} initial={initial} />
          ) : (
            <p className="ff-auth__hint">
              The bracket appears here once the tournament starts.
            </p>
          )}
        </Bubble>

        {/* Bottom two columns: registration + participants. */}
        <div className="ff-bubble-columns">
          <div className="ff-bubble-column">
            <Bubble title="Register">
              <TournamentRegister
                tournamentId={tournament.id}
                registrationOpen={registrationOpen}
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
            </Bubble>
          </div>

          <div className="ff-bubble-column">
            <Bubble
              title="Participants"
              actions={<span className="ff-row__note">{participants.length}</span>}
            >
              {participants.length === 0 ? (
                <p className="ff-auth__hint">No teams entered yet.</p>
              ) : (
                participants.map((p) => (
                  <BubbleRow
                    key={p.id}
                    label={entrantLabel(p.teamName, p.teamTag)}
                    value={p.seed ? `Seed ${p.seed}` : undefined}
                  />
                ))
              )}
            </Bubble>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
