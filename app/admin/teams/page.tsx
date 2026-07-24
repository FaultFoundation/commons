import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminGate } from "@/components/dashboard/admin/AdminGate";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getSessionCached } from "@/lib/session";
import { requireStaffCapability } from "@/lib/staff";
import { listAllTeams } from "@/lib/teams";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Teams",
  robots: { index: false },
};

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; disbanded?: string }>;
}) {
  const params = await searchParams;
  return (
    <DashboardShell active="admin" activeChild="teams" surface="technical">
      <h1 className="screen-reader-text">Admin — Teams</h1>
      <AdminGate>
        <TeamsContent
          query={params.q}
          page={params.page}
          disbanded={params.disbanded}
        />
      </AdminGate>
    </DashboardShell>
  );
}

/**
 * Rendered only after AdminGate passes. `viewTeams` (which moderator also holds)
 * gates the read; only the per-team page decides whether the viewer can edit.
 */
async function TeamsContent({
  query,
  page,
  disbanded,
}: {
  query?: string;
  page?: string;
  disbanded?: string;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");
  const gate = await requireStaffCapability(session.user.id, "viewTeams");
  if (!gate.ok) redirect("/home/");

  const includeDisbanded = disbanded === "1";
  const pageNum = Math.max(1, Number(page) || 1);
  const result = await listAllTeams({
    query,
    includeDisbanded,
    page: pageNum,
  });

  const href = (target: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (includeDisbanded) search.set("disbanded", "1");
    if (target > 1) search.set("page", String(target));
    const qs = search.toString();
    return qs ? `/admin/teams/?${qs}` : "/admin/teams/";
  };

  return (
    <div className="ff-bubble-grid">
      <Bubble
        title="All Teams"
        span="full"
        actions={<span className="ff-row__note">{result.total}</span>}
      >
        <form className="ff-team-search" method="get">
          <label className="screen-reader-text" htmlFor="team-search">
            Search teams
          </label>
          <input
            id="team-search"
            className="ff-auth__input"
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder="Search by name or tag…"
          />
          <label className="ff-team-search__check">
            <input
              type="checkbox"
              name="disbanded"
              value="1"
              defaultChecked={includeDisbanded}
            />
            Include disbanded
          </label>
          <button className="ff-btn ff-btn--sm" type="submit">
            Search
          </button>
        </form>

        {result.teams.length === 0 ? (
          <p className="ff-ticket-empty">No teams found.</p>
        ) : (
          <div className="ff-ticket-table-wrap">
            <table className="ff-ticket-table">
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">School</th>
                  <th scope="col">Members</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.teams.map((team) => (
                  <tr key={team.id}>
                    <td>
                      <a
                        className="ff-ticket-subject"
                        href={`/admin/teams/${team.id}/`}
                      >
                        {team.tag ? `${team.name} [${team.tag}]` : team.name}
                      </a>
                    </td>
                    <td>{team.collegeName ?? "—"}</td>
                    <td>{team.memberCount}</td>
                    <td>
                      {team.disbandedAt ? (
                        <span className="ff-badge">Disbanded</span>
                      ) : (
                        <span className="ff-ticket-status ff-ticket-status--open">
                          Live
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result.pageCount > 1 ? (
          <nav className="ff-team-pager" aria-label="Pages">
            {result.page > 1 ? (
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={href(result.page - 1)}>
                Previous
              </a>
            ) : null}
            <span className="ff-ticket-muted">
              Page {result.page} of {result.pageCount}
            </span>
            {result.page < result.pageCount ? (
              <a className="ff-btn ff-btn--outline ff-btn--sm" href={href(result.page + 1)}>
                Next
              </a>
            ) : null}
          </nav>
        ) : null}
      </Bubble>
    </div>
  );
}
