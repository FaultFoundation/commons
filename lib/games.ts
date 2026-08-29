import { asc, eq } from "drizzle-orm";

import { games } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { GameOption } from "@/lib/games-shared";

// ---------------------------------------------------------------------------
// Games registry reads. The `games` table is a small seeded registry
// (db/seed/bootstrap.sql) — a game a team can be tagged as competing in. The
// client-safe half (the option type, the banner gradient) is lib/games-shared.ts.
// ---------------------------------------------------------------------------

/** Every game, alphabetically — the team create/settings dropdown options. */
export async function listGames(): Promise<GameOption[]> {
  return getDb()
    .select({ id: games.id, name: games.name, logoUrl: games.logoUrl })
    .from(games)
    .orderBy(asc(games.name));
}

/** Whether a game id exists, so an action can reject a forged one. */
export async function isValidGameId(gameId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: games.id })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  return rows.length > 0;
}
