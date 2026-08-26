import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BannerUploadRow } from "@/components/dashboard/admin/tournaments/BannerUploadRow";
import { BracketControl } from "@/components/dashboard/admin/tournaments/BracketControl";
import { SeedEditor } from "@/components/dashboard/admin/tournaments/SeedEditor";
import { TournamentDanger } from "@/components/dashboard/admin/tournaments/TournamentDanger";
import { TournamentLifecycle } from "@/components/dashboard/admin/tournaments/TournamentLifecycle";
import {
  TournamentBasicInfo,
  TournamentGameInfo,
  TournamentSchedule,
} from "@/components/dashboard/admin/tournaments/TournamentSettings";
import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";
import {
  entrantLabel,
  getOrRefreshSnapshot,
  getTournament,
  listParticipantsWithTeams,
} from "@/lib/tournaments";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  tournamentPath,
} from "@/lib/tournaments-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Tournament",
  robots: { index: false },
};

export default async function AdminTournamentPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  return (
    <DashboardShell active="admin" activeChild="tournaments" surface="technical">
      <h1 className="screen-reader-text">Admin — Tournament</h1>
      <AdminGate>
        <TournamentContent tournamentId={tournamentId} />
      </AdminGate>
    </DashboardShell>
  );
}

async function TournamentContent({ tournamentId }: { tournamentId: string }) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const gate = await requireStaffCapability(session.user.id, "manageTournaments");
  if (!gate.ok) redirect("/home/");

  const tournament = await getTournament(tournamentId);
  if (!tournament) notFound();

  const participants = await listParticipantsWithTeams(tournamentId);
  const generated = Boolean(tournament.bracketGeneratedAt);
  // Only touch Challonge once the bracket exists — a draft/registration
  // tournament has no matches to render and no reason to spend an API call.
  const snapshot = generated ? await getOrRefreshSnapshot(tournament) : null;

  const publicUrl = tournamentPath(tournament.id, tournament.name);

  return (
    <div className="ff-bubble-grid">
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
          <a className="ff-btn ff-btn--outline ff-btn--sm" href="/admin/tournaments/">
            All Tournaments
          </a>
          {tournament.status !== "draft" ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={publicUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Public Bracket
            </a>
          ) : null}
          {tournament.externalUrl ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={tournament.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Challonge
            </a>
          ) : null}
        </div>

        <BubbleRow
          label="Format"
          value={TOURNAMENT_FORMAT_LABELS[tournament.format] ?? tournament.format}
        />
        <BubbleRow
          label="Entrants"
          value={
            tournament.maxParticipants
              ? `${participants.length} of ${tournament.maxParticipants}`
              : String(participants.length)
          }
        />
        <BubbleRow
          label="Tournament ID"
          value={tournament.id}
          locked
          lockTitle="Assigned on creation and permanent"
        />
        <BubbleRow label="Public URL" value={publicUrl} />
        <TournamentBasicInfo
          tournamentId={tournament.id}
          name={tournament.name}
          description={tournament.description}
          rulesUrl={tournament.rulesUrl}
          featured={tournament.featured}
        />
        <BannerUploadRow
          tournamentId={tournament.id}
          currentUrl={tournament.bannerUrl}
        />
      </Bubble>

      {/* Left column: lifecycle + game info. Right column: schedule. */}
      <div className="ff-bubble-columns">
        <div className="ff-bubble-column">
          <Bubble title="Lifecycle">
            <TournamentLifecycle
              tournamentId={tournament.id}
              status={tournament.status}
              entrantCount={participants.length}
            />
          </Bubble>

          <Bubble title="Game Info">
            <TournamentGameInfo
              tournamentId={tournament.id}
              format={tournament.format}
              bestOf={tournament.bestOf}
              maxParticipants={tournament.maxParticipants}
              swissRounds={tournament.swissRounds}
              thirdPlaceMatch={tournament.thirdPlaceMatch}
              academicVerificationRequired={tournament.academicVerificationRequired}
              formatLocked={generated}
            />
          </Bubble>
        </div>

        <div className="ff-bubble-column">
          <Bubble title="Schedule">
            <TournamentSchedule
              tournamentId={tournament.id}
              startsAt={toLocalInput(tournament.startsAt)}
              endsAt={toLocalInput(tournament.endsAt)}
              registrationOpensAt={toLocalInput(tournament.registrationOpensAt)}
              registrationClosesAt={toLocalInput(tournament.registrationClosesAt)}
              rosterLockAt={toLocalInput(tournament.rosterLockAt)}
            />
          </Bubble>
        </div>
      </div>

      <Bubble
        title="Entrants"
        span="full"
        actions={<span className="ff-row__note">{participants.length}</span>}
      >
        {participants.length === 0 ? (
          <p className="ff-auth__hint">No entrants yet.</p>
        ) : (
          participants.map((p) => (
            <BubbleRow
              key={p.id}
              label={entrantLabel(p.teamName, p.teamTag)}
              value={p.seed ? `Seed ${p.seed}` : "Unseeded"}
            />
          ))
        )}
      </Bubble>

      {tournament.status === "registration" || tournament.status === "seeding" ? (
        <Bubble title="Seeding" span="full">
          <SeedEditor
            tournamentId={tournament.id}
            entrants={participants.map((p) => ({
              id: p.id,
              label: entrantLabel(p.teamName, p.teamTag),
            }))}
            editable={tournament.status === "seeding"}
          />
        </Bubble>
      ) : null}

      <Bubble title="Bracket" span="full">
        <BracketControl
          tournamentId={tournament.id}
          status={tournament.status}
          entrantCount={participants.length}
          participants={snapshot?.payload.participants ?? []}
          matches={snapshot?.payload.matches ?? []}
        />
      </Bubble>

      <Bubble title="Danger Zone" variant="danger" span="full">
        <TournamentDanger
          tournamentId={tournament.id}
          name={tournament.name}
          canReset={tournament.status === "active" || tournament.status === "completed"}
        />
      </Bubble>
    </div>
  );
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in *local* time — toISOString
    would silently shift every timestamp by the server's UTC offset. */
function toLocalInput(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
