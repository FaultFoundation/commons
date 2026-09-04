import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { ShareBar } from "@/components/dashboard/tournaments/ShareBar";
import { TournamentRegister } from "@/components/dashboard/tournaments/TournamentRegister";
import { BracketView } from "@/components/tournaments/BracketView";
import { ExternalTournamentView } from "@/components/dashboard/tournaments/ExternalTournamentView";
import {
  TournamentChrome,
  type TournamentTab,
} from "@/components/dashboard/tournaments/TournamentChrome";
import { TopFinishers } from "@/components/dashboard/tournaments/TopFinishers";
import { RecentResults } from "@/components/dashboard/tournaments/RecentResults";
import type {
  FinisherEntry,
  ResultRow,
} from "@/components/dashboard/tournaments/tournament-view-shared";
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
  type SnapshotMatch,
  type SnapshotParticipant,
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

/** Sum a Challonge scores_csv ("3-1,2-3,3-0") into set wins per side, as display
    strings ("2", "1"); "–" when a side has no games recorded. */
function setWins(scores: string | null): [string, string] {
  if (!scores) return ["–", "–"];
  let a = 0;
  let b = 0;
  let any = false;
  for (const set of scores.split(",")) {
    const [x, y] = set.split("-").map((n) => Number(n.trim()));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      any = true;
      if (x > y) a += 1;
      else if (y > x) b += 1;
    }
  }
  return any ? [String(a), String(b)] : ["–", "–"];
}

/** Podium (finalRank 1–3) with team logos, for the Overview top-finishers row. */
function buildFinishers(participants: SnapshotParticipant[]): FinisherEntry[] {
  return participants
    .filter((p) => p.finalRank != null && p.finalRank >= 1 && p.finalRank <= 3)
    .map((p) => ({
      place: p.finalRank as number,
      name: p.name,
      logoUrl: p.logoUrl,
    }));
}

/** A readable round label for the Recent Results sidebar — the winners final and
    semifinal get named, everything else is numbered by its (signed) round. */
function roundLabel(match: SnapshotMatch, maxWinnersRound: number): string {
  if (match.side === "L") return `Losers Round ${Math.abs(match.round)}`;
  if (match.round === maxWinnersRound) return "Grand Final";
  if (match.round === maxWinnersRound - 1 && maxWinnersRound > 1) {
    return "Semifinal";
  }
  return `Round ${match.round}`;
}

/** Decided matches, latest play-order first (finals first), for the sidebar. */
function buildRecentResults(snapshot: BracketSnapshot | null): ResultRow[] {
  if (!snapshot) return [];
  const byId = new Map<string, SnapshotParticipant>();
  for (const p of snapshot.participants) byId.set(p.id, p);
  const maxWinnersRound = snapshot.matches.reduce(
    (max, m) => (m.side !== "L" && m.round > max ? m.round : max),
    0,
  );
  return snapshot.matches
    .filter((m) => m.state === "complete" && m.winnerId)
    .sort(
      (a, b) =>
        (b.order ?? 0) - (a.order ?? 0) ||
        Math.abs(b.round) - Math.abs(a.round),
    )
    .slice(0, 50)
    .map((m) => {
      const p1 = m.player1Id ? byId.get(m.player1Id) : undefined;
      const p2 = m.player2Id ? byId.get(m.player2Id) : undefined;
      const [sa, sb] = setWins(m.scores);
      return {
        id: m.id,
        round: roundLabel(m, maxWinnersRound),
        dateLabel: null, // Challonge snapshot carries no per-match time.
        a: {
          name: p1?.name ?? "TBD",
          logoUrl: p1?.logoUrl ?? null,
          score: sa,
          winner: m.winnerId === m.player1Id,
        },
        b: {
          name: p2?.name ?? "TBD",
          logoUrl: p2?.logoUrl ?? null,
          score: sb,
          winner: m.winnerId === m.player2Id,
        },
        url: null,
      };
    });
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
    const extHost = hdrs.get("host") ?? "commons.fault.foundation";
    const extShareUrl = `https://${extHost}/tournaments/${encodeURIComponent(id)}/`;
    return (
      <>
        <h1 className="screen-reader-text">{external.name}</h1>
        <ExternalTournamentView
          tournament={external}
          shareUrl={extShareUrl}
          shareMessage={tournamentShareText(external.name)}
        />
      </>
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

  const finishers = buildFinishers(initial?.participants ?? []);
  const recentResults = buildRecentResults(initial);

  const startDate = tournament.startsAt
    ? tournament.startsAt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const header = (
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
        <div className="ff-thero__meta">
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
            {startDate ? (
              <div className="ff-stat">
                <span className="ff-stat__label">Starts</span>
                <span className="ff-stat__value">{startDate}</span>
              </div>
            ) : null}
            <div className="ff-stat">
              <span className="ff-stat__label">Verification</span>
              <span className="ff-stat__value">
                {tournament.academicVerificationRequired ? "Required" : "Open"}
              </span>
            </div>
          </div>
        </div>
        <div className="ff-thero__actions">
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
          <ShareBar url={shareUrl} title={tournament.name} message={shareMessage} />
        </div>
      </div>
    </section>
  );

  const overview = (
    <div className="ff-tpanel">
      <TopFinishers finishers={finishers} />
      {tournament.description ? (
        <Bubble title="About" span="full">
          <p className="ff-ext-about">{tournament.description}</p>
        </Bubble>
      ) : null}
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
                <div className="ff-pcard__ident">
                  {p.teamLogoUrl ? (
                    <img
                      className="ff-pcard__logo"
                      src={p.teamLogoUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                  <div className="ff-pcard__name">
                    {entrantLabel(p.teamName, p.teamTag)}
                  </div>
                </div>
                <div className="ff-pcard__sr">
                  Avg SR <span className="ff-pcard__sr-val">{p.avgSr ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Bubble>
    </div>
  );

  const bracket = (
    <div
      className={`ff-tbracket${recentResults.length ? "" : " ff-tbracket--solo"}`}
    >
      {recentResults.length ? <RecentResults results={recentResults} /> : null}
      <Bubble
        title="Bracket"
        className="ff-bubble--divided ff-tbracket__main"
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
          <BracketView
            tournamentId={tournament.id}
            initial={initial}
            showStandings={false}
          />
        ) : (
          <p className="ff-ticket-empty">No bracket has been published yet.</p>
        )}
      </Bubble>
    </div>
  );

  const standings = (
    <Bubble title="Standings" span="full">
      {initial ? (
        <BracketView
          tournamentId={tournament.id}
          initial={initial}
          showBracket={false}
          standingsHeading={null}
        />
      ) : (
        <p className="ff-auth__hint">No standings yet.</p>
      )}
    </Bubble>
  );

  const rules = (
    <Bubble title="Rules" span="full">
      {tournament.rulesUrl ? (
        <p className="ff-ext-about">
          <a href={tournament.rulesUrl} target="_blank" rel="noreferrer noopener">
            View the full ruleset ↗
          </a>
        </p>
      ) : (
        <p className="ff-auth__hint">No rules have been posted.</p>
      )}
    </Bubble>
  );

  const tabs: TournamentTab[] = [
    { id: "overview", label: "Overview", node: overview },
    { id: "bracket", label: "Bracket", node: bracket },
    { id: "standings", label: "Standings", node: standings },
    { id: "rules", label: "Rules", node: rules },
  ];

  return (
    <>
      <h1 className="screen-reader-text">{tournament.name}</h1>
      <div className="ff-tview">
        <TournamentChrome header={header} tabs={tabs} />
      </div>
    </>
  );
}
