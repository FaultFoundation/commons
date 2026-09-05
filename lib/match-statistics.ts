import type { ExternalMatchRow } from "@/lib/player-data-shared";

/** Only finished, attributed results contribute to the record. */
export function summarizeMatches(matches: ExternalMatchRow[]) {
  const finished = matches.filter(m => m.status === "finished");
  const wins = finished.filter(m => m.result === "win").length;
  const losses = finished.filter(m => m.result === "loss").length;
  const draws = finished.filter(m => m.result === "draw").length;
  const decided = wins + losses + draws;
  return { wins, losses, draws, decided, unknown: finished.length - decided,
    winRate: decided ? Math.round(100 * wins / decided) : null };
}
