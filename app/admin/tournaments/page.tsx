import { DashboardDataRefresh } from "@/components/dashboard/DashboardDataRefresh";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { CreateTournamentForm } from "@/components/dashboard/admin/tournaments/CreateTournamentForm";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { challongeConfigured } from "@/lib/challonge";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";
import { listTournaments } from "@/lib/tournaments";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  type TournamentFormat,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Tournaments",
  robots: { index: false },
};

export default function AdminTournamentsPage() {
  return (
    <DashboardShell active="admin" activeChild="tournaments" surface="technical">
      <h1 className="screen-reader-text">Admin — Tournaments</h1>
      <AdminGate>
        <TournamentsContent />
      </AdminGate>
    </DashboardShell>
  );
}

async function TournamentsContent() {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const gate = await requireStaffCapability(session.user.id, "manageTournaments");
  if (!gate.ok) redirect("/home/");

  const [tournaments, configured] = await Promise.all([
    listTournaments(),
    Promise.resolve(challongeConfigured()),
  ]);

  return (
    <div className="ff-bubble-grid">
      <DashboardDataRefresh tournaments />
      {!configured ? (
        <Bubble title="Challonge not configured" variant="danger" span="full">
          <p className="ff-row__note">
            Set the <code>CHALLONGE_API_V1_KEY</code> secret before creating
            tournaments — the backend runs on Challonge&apos;s API.
          </p>
        </Bubble>
      ) : null}

      <Bubble title="New Tournament">
        <CreateTournamentForm />
      </Bubble>

      <Bubble
        title="Tournaments"
        span="full"
        actions={<span className="ff-row__note">{tournaments.length}</span>}
      >
        {tournaments.length === 0 ? (
          <p className="ff-ticket-empty">No tournaments yet.</p>
        ) : (
          <div className="ff-ticket-table-wrap">
            <table className="ff-ticket-table">
              <thead>
                <tr>
                  <th scope="col">Tournament</th>
                  <th scope="col">Format</th>
                  <th scope="col">Entrants</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <a
                        className="ff-ticket-subject"
                        href={`/admin/tournaments/${t.id}/`}
                      >
                        {t.name}
                      </a>
                    </td>
                    <td>
                      {TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat] ??
                        t.format}
                    </td>
                    <td>
                      {t.entrantCount}
                      {t.maxParticipants ? ` / ${t.maxParticipants}` : ""}
                    </td>
                    <td>
                      <span className="ff-badge">
                        {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus] ??
                          t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bubble>
    </div>
  );
}
