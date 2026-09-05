import { desc, inArray } from "drizzle-orm";
import { matchTimeReports } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { ExternalMatchRow } from "@/lib/player-data-shared";

export async function applyMatchTimes(matches: ExternalMatchRow[]) {
  const keys = [...new Set(matches.filter(m => m.status === "scheduled" || m.status === "live").map(m => m.matchKey).filter((key): key is string => !!key))];
  const latest = new Map<string, typeof matchTimeReports.$inferSelect>();
  for (let i = 0; i < keys.length; i += 80) {
    const rows = await getDb().select().from(matchTimeReports).where(inArray(matchTimeReports.matchKey, keys.slice(i, i + 80))).orderBy(desc(matchTimeReports.revision));
    for (const row of rows) if (!latest.has(row.matchKey)) latest.set(row.matchKey, row);
  }
  return matches.map(m => {
    if (m.status !== "scheduled" && m.status !== "live") return m;
    const report = m.matchKey ? latest.get(m.matchKey) : null;
    return report ? { ...m, reportedTime: { revision: report.revision, sourceUrl: report.sourceUrl, scheduledAt: report.scheduledAt.getTime(), conflictsWithProvider: m.startedAt != null && m.startedAt !== report.scheduledAt.getTime() } } : m;
  });
}
