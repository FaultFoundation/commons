import { seriesName, type DiscoverySource } from "@/lib/discovery-shared";

// These are game labels, not organizer/competition aliases. Only the current
// row's game is removed so unrelated brands cannot collide across organizers.
const GAME_ALIASES: Record<string, string[]> = {
  "overwatch": ["Overwatch 2", "OW2", "OW"],
  "overwatch 2": ["Overwatch", "Overwatch2", "OW2", "OW"],
  "valorant": ["VAL"],
  "rocket league": ["RL"],
  "league of legends": ["LoL"],
  "marvel rivals": ["MR", "Rivals"],
  "rainbow six siege": ["Rainbow Six", "Rainbow 6 Siege", "R6 Siege", "R6S", "R6"],
  "super smash bros. ultimate": ["Super Smash Bros Ultimate", "Super Smash Bros: Ultimate", "Super Smash Bros", "Super Smash", "Smash Ultimate", "Smash Bros", "SSBU", "Smash"],
  "counter-strike 2": ["Counter Strike 2", "CS2"],
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const year = (s: string) => s.length === 2 ? `20${s}` : s;
const terms: Record<string, string> = {spring:"Spring",summer:"Summer",fall:"Fall",autumn:"Fall",winter:"Winter",sp:"Spring",sm:"Summer"};

/** A title-derived series BELOW a provider parent. Unknown titles return null;
 * source dates never manufacture a season. Retains brands and academic tiers. */
export function competitionSeries(t: DiscoverySource): { key: string; name: string } | null {
  let name = t.name.normalize("NFKC").trim();
  if (t.source === "leagueos") {
    name = name.replace(/^\((SM|S|F|W)(\d{2})(?:-([A-Z]+))?\)/i,
      (_, term: string, y: string, track: string) => `${({SM:"Summer",S:"Spring",F:"Fall",W:"Winter"} as Record<string,string>)[term.toUpperCase()]} ${year(y)}${track ? ` ${track.toUpperCase()}` : ""}`);
  }
  // Academic years stay ranges; abbreviated years become the same identity as
  // their fully spelled counterparts. Normalize before delimiter cleanup.
  name = name.replace(/\b(?:SY)?(20\d{2}|\d{2})\s*[-/]\s*(20\d{2}|\d{2})\b/gi,
    (match, a: string, b: string) => Number(year(b)) === Number(year(a)) + 1 ? `${year(a)}–${year(b)}` : match);
  name = name.replace(/\b(spring|summer|fall|autumn|winter|sp|sm)\s*(20\d{2}|\d{2})(?!\d)/gi,
    (_, term: string, y: string) => `${terms[term.toLowerCase()]} ${year(y)}`);
  name = name.replace(/\b(20\d{2}(?:–20\d{2})?)\s+(spring|summer|fall|autumn|winter)\b/gi,
    (_, y: string, term: string) => `${terms[term.toLowerCase()]} ${y}`);
  const game = t.game?.trim();
  if (game) {
    const aliases = [...new Set([game, ...(GAME_ALIASES[game.toLowerCase()] ?? [])])].sort((a,b) => b.length-a.length);
    if (t.source === "leagueos") {
      name = name.replace(new RegExp(`\\b(?:${aliases.map(escape).join("|")})(?!\\w)\\.?`, "gi"), " ");
    } else {
      // "Smash World Tour" is a brand. Outside the structured LeagueOS titles,
      // remove game labels only when they occupy their own delimited segment.
      const label = new RegExp(`^(?:${aliases.map(escape).join("|")})$`, "i");
      name = name.split(/(\s+[|:–—-]\s+)/).map(part => label.test(part.trim()) ? " " : part).join("");
    }
  }
  name = name.replace(/\s*\(formerly\s+[^)]+\)\s*$/i, "");
  name = seriesName(name);
  if (t.source === "leagueos") {
    name = name.replace(/\(\s*(?:\d{1,2}:\d{2}\s*(?:am|pm)\s*[A-Z]{0,4}|\d+\+\s+ONLY)\s*\)/gi," ");
    // Season components and game roster formats do not create separate series.
    // Keep named cups, invitationals and distinct programs (IHSEN/IMSEN, etc.).
    name = name.replace(/\b(?:division\s+[ivxlcdm\d]+(?:\s*\+\s*[ivxlcdm\d]+)?(?:\s+(?:play-in\s+qualifier\s*\d*|LCQ))?|sign\s*ups?|registration|regular season|reg\. season|nationals|challengers|champions|emergents|legends|navigators|crew battles|crews?|singles|solos)\b/gi," ");
    name = name.replace(/\bqualifier\s*#?\d+\s+and\s+finals?\s*$/i, " ");
    name = name.replace(/\b(?:playoffs?|finals?|qualifier(?:s)?)(?:\s*#?\d+)?\s*$/i, " ");
  }
  // Remove separators left behind by game/stage removal, preserving academic
  // year dashes and punctuation within actual competition names.
  name = name.replace(/\s+/g," ").replace(/(?:\s*[-|:]\s*){2,}/g," · ")
    .replace(/^[\s|:·–—-]+|[\s|:·–—-]+$/g,"").replace(/\s+[|:]\s+/g," · ").trim();
  // Canonical order makes "2024-25 | IHSEN Club" and "IHSEN Club 24-25"
  // one program-season without erasing that program name.
  const temporal = name.match(/\b(?:(?:Spring|Summer|Fall|Winter)\s+)?20\d{2}(?:–20\d{2})?\b/i);
  if (temporal) {
    let rest = name.replace(temporal[0], "").replace(/^[\s|:·–—-]+|[\s|:·–—-]+$/g, "").trim();
    rest = rest.replace(/\s+[|:·]\s+/g, " ");
    if (/^(?:Spring|Summer|Fall|Winter)$/i.test(rest) && temporal[0].toLowerCase().startsWith(rest.toLowerCase())) rest = "";
    name = rest ? `${temporal[0]} · ${rest}` : temporal[0];
  }
  if (!name || /^(?:spring|summer|fall|winter|season|league|tournament|cup|open|preseason|postseason|upcoming|new event|test tournament)$/i.test(name)) return null;
  return {key:name.toLowerCase(), name};
}
