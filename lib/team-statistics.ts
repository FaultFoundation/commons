import { applyMatchTimes } from "@/lib/match-times";
import { pdMatches, pdTeams } from "@/db/ow-schema";
import { getOwDb } from "@/lib/ow-db";
import { can } from "@/lib/teams-shared";
import { and, desc, eq } from "drizzle-orm";
import { teamProviderLinks, tournamentBrackets, tournamentParticipants } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getExternalTeamDetail, getExternalTeamsForUser, toMatchRow } from "@/lib/player-data";
import { getTeamDetail, getTeamMembership, listMyTeams } from "@/lib/teams";
import type { ExternalMatchRow } from "@/lib/player-data-shared";
import type { SnapshotPayload } from "@/lib/tournaments-shared";

export async function statisticsTeams(userId: string) {
  const [internal, external] = await Promise.all([listMyTeams(userId), getExternalTeamsForUser(userId)]);
  return [...internal.map(t => ({ id: t.id, name: t.name, source: "Commons" })),
    ...external.map(t => ({ id: t.id, name: t.name, source: t.provider }))];
}

export async function teamStatistics(userId: string, teamId: string) {
  if (teamId.includes(":")) {
    const detail = await getExternalTeamDetail(userId, teamId);
    if (!detail) return null;
    return { name: detail.team.name, rosterCount: detail.roster.length, avgSr: null,
      matches: await applyMatchTimes(detail.matches), note: "Synced history from linked members. Coverage depends on connected accounts and completed imports." };
  }
  const membership = await getTeamMembership(userId, teamId);
  if (!membership) return null;
  const team = await getTeamDetail(teamId);
  if (!team) return null;
  const rows = await getDb().select({ participant: tournamentParticipants.challongeParticipantId,
    payload: tournamentBrackets.payload }).from(tournamentParticipants)
    .leftJoin(tournamentBrackets, eq(tournamentBrackets.tournamentId, tournamentParticipants.tournamentId))
    .where(eq(tournamentParticipants.teamId, teamId));
  const matches: ExternalMatchRow[] = [];
  let missing = 0;
  for (const row of rows) {
    if (!row.payload || !row.participant) { missing++; continue; }
    let snapshot: SnapshotPayload;
    try { snapshot = JSON.parse(row.payload); } catch { missing++; continue; }
    for (const m of snapshot.matches) {
      if (m.player1Id !== row.participant && m.player2Id !== row.participant) continue;
      const isA = m.player1Id === row.participant;
      const opponent = isA ? m.player2Id : m.player1Id;
      if (!opponent) continue; // A bye is not a played match.
      const score = m.scores?.match(/^(\d+)-(\d+)$/);
      matches.push({ matchKey: `commons:${snapshot.tournament.id}:${m.id}`, id: `commons:${snapshot.tournament.id}:${m.id}`, provider: "challonge", game: team.gameName,
        competitionName: snapshot.tournament.name, roundText: `Round ${m.round}`,
        teamName: team.name, opponentName: snapshot.participants.find(p => p.id === opponent)?.name ?? null,
        scoreFor: score ? Number(score[isA ? 1 : 2]) : null,
        scoreAgainst: score ? Number(score[isA ? 2 : 1]) : null,
        result: m.winnerId ? m.winnerId === row.participant ? "win" : "loss" : null,
        status: m.state === "complete" ? "finished" : "scheduled", startedAt: null,
        url: `/tournaments/${snapshot.tournament.id}/` });
    }
  }
  const links = await getDb().select().from(teamProviderLinks).where(eq(teamProviderLinks.teamId, teamId));
  const ow = getOwDb();
  if (ow) {
    for (const link of links) {
      // Access was established by internal membership and the manager-approved
      // association, so members need not each connect the same provider account.
      const external = (await ow.select().from(pdTeams).where(eq(pdTeams.id, link.externalTeamId)).limit(1))[0];
      if (!external) continue;
      const rows = await ow.select().from(pdMatches).where(and(eq(pdMatches.provider, external.provider), eq(pdMatches.teamExternalId, external.externalTeamId))).orderBy(desc(pdMatches.updatedAt));
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.externalMatchId)) continue;
        seen.add(row.externalMatchId); matches.push(toMatchRow(row));
      }
    }
  }
  matches.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  return { linkedTeams: links.map(l => l.externalTeamId), canLink: can(membership.role, "editSettings"), name: team.name, rosterCount: team.roster.length, avgSr: team.avgSr, matches: await applyMatchTimes(matches),
    note: `Cached Commons and linked provider team history.${missing ? ` ${missing} tournament entries have no cached results yet.` : ""} Match dates are unavailable in these snapshots.` };
}
