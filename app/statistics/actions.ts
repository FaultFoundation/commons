"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { teamProviderLinks } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getExternalTeamsForUser } from "@/lib/player-data";
import { getSessionCached } from "@/lib/session";
import { getTeamMembership } from "@/lib/teams";
import { can } from "@/lib/teams-shared";

export async function updateStatisticsTeamLink(teamId: string, externalTeamId: string, remove = false) {
  const session = await getSessionCached();
  if (!session) return { error: "Sign in to link teams." };
  const membership = await getTeamMembership(session.user.id, teamId);
  if (!membership || !can(membership.role, "editSettings")) return { error: "Only a manager or captain can link teams." };
  const db = getDb();
  if (remove) {
    await db.delete(teamProviderLinks).where(and(eq(teamProviderLinks.teamId, teamId), eq(teamProviderLinks.externalTeamId, externalTeamId)));
  } else {
    const external = await getExternalTeamsForUser(session.user.id);
    if (!external.some(t => t.id === externalTeamId)) return { error: "Connect an account on that external team first." };
    const inserted = await db.insert(teamProviderLinks).values({teamId, externalTeamId, linkedBy: session.user.id})
      .onConflictDoNothing().returning({id: teamProviderLinks.externalTeamId});
    if (!inserted.length) return { error: "That provider team is already linked. Unlink it from its current team first." };
  }
  revalidatePath("/statistics/");
  return { success: true };
}

export async function reportStatisticsMatchTime(teamId: string, matchKey: string, scheduledAt: number, sourceUrl: string, revision: number) {
  const session = await getSessionCached();
  if (!session) return { error: "Sign in to update a match time." };
  const membership = await getTeamMembership(session.user.id, teamId);
  if (!membership || !can(membership.role, "editSettings")) return { error: "Only a manager or captain can report match times." };
  if (!Number.isFinite(scheduledAt) || !Number.isSafeInteger(revision) || revision < 0 || Math.abs(scheduledAt - Date.now()) > 366 * 24 * 60 * 60 * 1000) return { error: "Choose a valid match date within one year." };
  try { const url = new URL(sourceUrl); if (url.protocol !== "https:" || sourceUrl.length > 2000) throw Error(); }
  catch { return { error: "Add an HTTPS source link for the scheduled time." }; }
  const { teamStatistics } = await import("@/lib/team-statistics");
  const detail = await teamStatistics(session.user.id, teamId);
  const match = detail?.matches.find(m => m.matchKey === matchKey);
  if (!match || match.status !== "scheduled") return { error: "Only an upcoming match for this team can be updated." };
  if ((match.reportedTime?.revision ?? 0) !== revision) return { error: "Someone updated this time. Reload the statistics before editing again." };
  const { matchTimeReports } = await import("@/db/schema");
  const inserted = await getDb().insert(matchTimeReports).values({ id: crypto.randomUUID(), matchKey, revision: revision + 1, scheduledAt: new Date(scheduledAt), sourceUrl, teamId, submittedBy: session.user.id }).onConflictDoNothing().returning({id:matchTimeReports.id});
  if (!inserted.length) return { error: "Someone updated this time. Reload before editing again." };
  revalidatePath("/statistics/");
  return { success: true };
}
