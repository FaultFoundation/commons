import type { DiscoveryFacts, DiscoverySource } from "@/lib/discovery-shared";

// Competition aliases, not organizer ownership assertions. Keep this registry
// small and sourced; broad platform brands can run several eligibility groups.
export const COLLEGIATE_COMPETITIONS = [
  {
    name: "National Association of Collegiate Esports",
    title: /\bNACE\b|\bNational Association of Collegiate Esports\b/i,
    source: "https://www.nacesports.org/",
  },
  {
    name: "National Esports Collegiate Conference",
    title: /\bNECC\b|\bNational Esports Collegiate Conference\b/i,
    source: "https://necc.gg/",
  },
  {
    name: "Collegiate Rocket League",
    title: /\bCRL\b/i,
    game: /\brocket[\s_-]*league\b/i,
    source: "https://www.rocketleague.com/competitive/rules",
  },
] as const;

function plain(value: string): string {
  return value.normalize("NFKC").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim();
}

export function inferAudience(t: DiscoverySource): {
  audience: DiscoveryFacts["audience"];
  reasons: string[];
} {
  const title = plain(t.name);
  const description = plain((t.description ?? "").slice(0, 20000));
  const text = `${title}. ${description}`;
  const reasons: string[] = [];
  if (t.academicVerificationRequired)
    reasons.push("Commons requires academic verification");

  // Discovery favors recall: provider prose and organizer identity are useful
  // signals even when an event also welcomes the wider community.
  const providerText = plain(`${text} ${t.organizer ?? ""} ${t.organizerUrl ?? ""}`)
    .replace(/[_/.-]+/g, " ");
  if (t.source === "leagueos") {
    const classification = /LeagueOS classification:\s*([a-z-]+)/i.exec(description)?.[1]?.toLowerCase();
    if (classification === "collegiate")
      return { audience: "collegiate", reasons: ["LeagueOS collegiate classification"] };
    if (classification)
      return { audience: "unknown", reasons: [`LeagueOS classification: ${classification}`] };
  }
  if (["startgg", "faceit", "leagueos"].includes(t.source ?? "")) {
    if (/\b(?:colleg(?:e|es|iate)|intercollegiate|universit(?:y|ies)|campus|varsity|students?|academic|NACE|NECC|NSE|NUEL|CSL|ECAC|NJCAAE|NACEsports)\b/i.test(providerText) ||
      COLLEGIATE_COMPETITIONS.some(rule => rule.title.test(providerText) &&
        (!("game" in rule) || rule.game.test(`${t.game ?? ""} ${providerText}`))))
      return { audience: "collegiate", reasons: ["College, student or collegiate competition signal in provider title, description or organizer"] };
  }

  // Incidental sponsor, alumni and recruiting mentions in descriptions cannot
  // establish eligibility. Acronym-only titles are suggestions, never verified.
  for (const rule of COLLEGIATE_COMPETITIONS) {
    if (rule.title.test(title) &&
      (!("game" in rule) || rule.game.test(`${t.game ?? ""} ${title}`)))
      reasons.push(`Competition title matches ${rule.name}`);
  }
  if (/\b(?:collegiate|intercollegiate)\b/i.test(title) ||
    /\b(?:college|university|universities)\s+(?:(?:esports|rocket league|valorant|overwatch)\s+)?(?:league|cup|championship|tournament|series|competition)\b/i.test(title))
    reasons.push("Collegiate competition wording in title");
  if (/\b(?:must be|only|exclusively for|restricted to|limited to)\s+(?:currently\s+)?(?:enrolled\s+)?(?:college|university)\s+(?:students|teams)\b/i.test(text) ||
    /\b(?:college|university)\s+(?:students|teams)\s+only\b/i.test(text) ||
    /\b(?:eligibility|participants|players|teams)\s*:\s*(?:enrolled\s+)?(?:college|university)\s+(?:students|teams)\b/i.test(text))
    reasons.push("Explicit college or university eligibility in source");

  // 'Open qualifier' and 'open division' do not mean open to non-students.
  const unrestricted = /\b(?:open to (?:everyone|anyone|all ages|the public)|no (?:college|university|student) (?:enrollment|enrolment|affiliation|status) required|non[- ]students (?:are )?(?:welcome|eligible|allowed))\b/i.test(text);
  const otherAudience = /\b(?:high[- ]school|middle[- ]school|K[- ]12|non[- ]collegiate)\b/i.test(title) ||
    /\b(?:only|restricted to|limited to)\s+(?:high[- ]school|middle[- ]school)\s+(?:students|teams)\b/i.test(text);
  const negated = /\b(?:not (?:a |an )?collegiate|not (?:a |an )?college|non[- ]collegiate|not (?:restricted|limited) to (?:college|university))\b/i.test(text);
  if (otherAudience || negated || (unrestricted && reasons.length))
    return { audience: "unknown", reasons: [...reasons, "Conflicting or non-collegiate audience wording; needs review"] };
  if (unrestricted)
    return { audience: "open", reasons: ["Explicitly open to the public in source"] };
  return { audience: reasons.length ? "collegiate" : "unknown", reasons };
}

/** Match test labels without hiding legitimate names such as Contest or Latest. */
export function isTestTournamentName(name: string): boolean {
  const normalized = plain(name.replace(/([a-z])([A-Z])/g, "$1 $2")).replace(/[_-]+/g, " ");
  return /\b(?:test(?:ing|er|ers|s)?\d*|dummy|sandbox|placeholder)\b/i.test(normalized);
}
