import { eq } from "drizzle-orm";
import { discordEntities } from "@/db/cen-schema";
import { getCenDb } from "@/lib/cen-db";

type Supplement = {
  name?:string|null; season?:string|null; division?:string|null;
  start?:string|null; end?:string|null; startAt?:number|null; endAt?:number|null;
  registrationClosesAt?:number|null; registrationUrl?:string|null; contactUrl?:string|null;
  streamUrl?:string|null; rulesUrl?:string|null; entryFee?:string|null; prizePool?:string|null;
  organizer?:string|null; format?:string|null; bestOf?:number|null; teamSize?:number|null;
  facts?:{label:string;value:string}[];
  matches?:{round:string|null;team1:string|null;team2:string|null;date:string|null;score1:number|null;score2:number|null}[];
  standings?:{name:string;placement:number|null;state?:string|null}[];
};
export async function discordSupplement(id:string): Promise<{ notes:string; data:Supplement|null }> {
  const db = getCenDb(); if (!db) return {notes:"",data:null};
  try {
    const rows = await db.select({data:discordEntities.dataJson}).from(discordEntities).where(eq(discordEntities.tournamentId,id));
    const patches = rows.map(r => JSON.parse(r.data) as Supplement);
    const notes = patches.map(p => [
      [p.name,p.season,p.division].filter(Boolean).join(" · "),
      ...[["Start",p.start],["End",p.end],["Entry fee",p.entryFee],["Prize pool",p.prizePool],["Format",p.format],["Best of",p.bestOf],["Team size",p.teamSize]].filter(([,v]) => v !== null && v !== undefined).map(([k,v]) => `${k}: ${v}`),
      ...(p.facts ?? []).map(f => `${f.label}: ${f.value}`),
      ...(p.matches ?? []).map(m => [m.round,`${m.team1 ?? "TBD"} vs ${m.team2 ?? "TBD"}`,m.date,m.score1 !== null && m.score2 !== null ? `${m.score1}–${m.score2}` : null].filter(Boolean).join(" · ")),
      ...(p.standings ?? []).map(s => `${s.state === "disqualified" ? "Disqualified" : s.placement ?? "Entrant"}: ${s.name}`),
    ].join("\n\n")).join("\n\n---\n\n");
    // Multiple divisions must not donate an arbitrary division's dates/prize pool
    // to the parent provider tournament. Their distinct notes remain available.
    return {notes,data:patches.length === 1 ? patches[0] : null};
  } catch { return {notes:"",data:null}; }
}
