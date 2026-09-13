import "server-only";
import { sql } from "drizzle-orm";
import { getOwDb } from "@/lib/ow-db";
import type { ScoutSuggestion, ScoutTarget } from "@/lib/faceit-scouting-shared";

/** Public FACEIT identities already in our cache. Never calls FACEIT search. */
export async function getScoutSuggestions(raw: string, target: ScoutTarget): Promise<ScoutSuggestion[]> {
  const query = raw.trim().toLowerCase();
  if (!query || query.length > 256) return [];
  const db = getOwDb();
  if (!db) throw new Error("Scouting directory unavailable");
  const source = target === "team" ? sql`
    select team_id as id, name, nickname as tag, avatar_url as avatarUrl, 0 as priority
      from faceit_scout_teams
    union all
    select external_team_id as id, name, '' as tag, logo_url as avatarUrl, 1 as priority
      from pd_teams where provider='faceit' and lower(game) in ('ow2','overwatch 2','overwatch')
  ` : sql`
    select player_id as id, nickname as name, '' as tag, avatar_url as avatarUrl, 0 as priority
      from faceit_players where game='ow2'
    union all
    select m.player_external_id as id, m.handle as name, '' as tag, m.avatar_url as avatarUrl, 1 as priority
      from pd_team_members m join pd_teams t on m.team_id=t.id
      where t.provider='faceit' and lower(t.game) in ('ow2','overwatch 2','overwatch')
        and m.player_external_id is not null and m.handle is not null
  `;
  // Match literal substrings (%, _ and punctuation are not SQL wildcards).
  // The same deterministic ordering drives both the menu and plain-name submits.
  const rows = await db.all<{ id: string; name: string; tag: string; avatarUrl: string | null }>(sql`
    with source as (${source}), candidates as (
      select *, lower(name) as normalizedName,
        lower(name || '(' || tag || ')') as combinedName,
        first_value(avatarUrl) over (partition by id order by case when avatarUrl is not null and avatarUrl<>'' then 0 else 1 end, priority, name) as fallbackAvatar,
        row_number() over (partition by id order by priority, name, coalesce(avatarUrl,'')) as duplicate
      from source
    )
    select id, name, tag, coalesce(nullif(avatarUrl,''), fallbackAvatar) as avatarUrl from candidates
    where duplicate=1 and (instr(normalizedName, ${query})>0 or instr(lower(tag), ${query})>0
      or instr(combinedName, replace(${query}, ' (', '('))>0 or instr(lower(id), ${query})>0)
    order by case when normalizedName=${query} or lower(tag)=${query} or combinedName=replace(${query}, ' (', '(') then 0
      when instr(normalizedName, ${query})=1 then 1 else 2 end,
      normalizedName, lower(tag), id
    limit 10
  `);
  return rows.map(row => ({ id: row.id, name: row.tag && row.tag !== row.name ? `${row.name} (${row.tag})` : row.name,
    avatarUrl: row.avatarUrl, target }));
}
