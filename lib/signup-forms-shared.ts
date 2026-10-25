// ---------------------------------------------------------------------------
// Sign-up forms — the client-safe half. The registry of requirement buckets and
// question kinds, config normalizers, and the export column builder that the
// CSV, the printable report and the on-page table all share, so the three can
// never disagree about what a response contains. No server-only imports;
// follows the *-shared.ts convention (see CLAUDE.md). The D1 work and the live
// requirement checks are in lib/signup-forms.ts.
// ---------------------------------------------------------------------------

export const FORM_STATUSES = ["draft", "open", "closed"] as const;
export type FormStatus = (typeof FORM_STATUSES)[number];

export function asFormStatus(value: string | null | undefined): FormStatus {
  return FORM_STATUSES.find((s) => s === value) ?? "draft";
}

export const FORM_STATUS_LABELS: Record<FormStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};

/** The public share path. The form id is the whole lookup. */
export function formPath(id: string): string {
  return `/f/${id}/`;
}

// ---------------------------------------------------------------------------
// Limits — enforced on every write, mirrored as maxLength in the editors.
// ---------------------------------------------------------------------------

export const MAX_FORMS_PER_OWNER = 50;
export const MAX_QUESTIONS = 30;
export const MAX_OPTIONS = 25;
export const MAX_DOMAINS = 20;
export const TITLE_MAX = 120;
export const HOST_MAX = 120;
export const DESCRIPTION_MAX = 4000;
export const URL_MAX = 300;
export const LABEL_MAX = 200;
export const HELP_MAX = 500;
export const OPTION_MAX = 100;
export const SHORT_ANSWER_MAX = 300;
export const LONG_ANSWER_MAX = 4000;
/** start.gg's Bulk Add takes at most this many gamertags per paste. */
export const STARTGG_BULK_ADD_BATCH = 50;

// ---------------------------------------------------------------------------
// Where the event runs. We host no brackets for organizers; this only picks
// which platform list the Responses page leads with and which account the
// builder suggests requiring.
// ---------------------------------------------------------------------------

export const EVENT_PLATFORMS = [
  { value: "startgg", label: "start.gg", account: "startgg" },
  { value: "faceit", label: "FACEIT", account: "faceit" },
  { value: "challonge", label: "Challonge", account: "challonge" },
  { value: "leagueos", label: "LeagueOS", account: null },
  { value: "other", label: "Somewhere else", account: null },
] as const;
export type EventPlatform = (typeof EVENT_PLATFORMS)[number]["value"];

export function asEventPlatform(value: string | null | undefined): EventPlatform | null {
  return EVENT_PLATFORMS.find((p) => p.value === value)?.value ?? null;
}

// ---------------------------------------------------------------------------
// Requirement buckets. Each appears at most once per form. `shares` is what the
// member is told the organizer will receive — it must match the evidence the
// server snapshots (lib/signup-forms.ts) and the export columns below.
// ---------------------------------------------------------------------------

export const REQUIREMENT_KINDS = [
  "account_email",
  "academic",
  "discord",
  "discord_server",
  "battlenet",
  "ow_public",
  "ow_rank",
  "faceit",
  "startgg",
  "challonge",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export type RequirementDef = {
  kind: RequirementKind;
  label: string;
  /** Builder fine print: what switching it on asks of members. */
  organizerNote: string;
  /** Member fine print: what the organizer will see. */
  shares: string;
  group: "Identity" | "Discord" | "Overwatch" | "Platforms";
  /** Requirements this one can't be met without; the builder turns them on too. */
  implies?: RequirementKind[];
};

export const REQUIREMENTS: readonly RequirementDef[] = [
  {
    kind: "account_email",
    label: "Verified Account Email",
    organizerNote: "They confirm the email on their account. You get that address to contact them.",
    shares: "Your account email address",
    group: "Identity",
  },
  {
    kind: "academic",
    label: "Academic Verification",
    organizerNote:
      "They verify a school affiliation. Optionally limit it to school email domains you list.",
    shares: "Your school, membership type and school email domain",
    group: "Identity",
  },
  {
    kind: "discord",
    label: "Discord Account",
    organizerNote: "They link a Discord account.",
    shares: "Your Discord username and ID",
    group: "Discord",
  },
  {
    kind: "discord_server",
    label: "Discord Server Member",
    organizerNote:
      "They must be in your Discord server. Paste the server ID; no bot needed.",
    shares: "Whether you're in the server",
    group: "Discord",
    implies: ["discord"],
  },
  {
    kind: "battlenet",
    label: "Blizzard Account",
    organizerNote: "They link Battle.net, which confirms their BattleTag.",
    shares: "Your BattleTag",
    group: "Overwatch",
  },
  {
    kind: "ow_public",
    label: "Public Overwatch Profile",
    organizerNote: "Their Overwatch career profile must be set to public.",
    shares: "That your career profile is public",
    group: "Overwatch",
    implies: ["battlenet"],
  },
  {
    kind: "ow_rank",
    label: "Overwatch Rank",
    organizerNote:
      "Pulls their current competitive rank per role (division and tier; Blizzard publishes no SR number). Needs a public profile.",
    shares: "Your current competitive rank in each role",
    group: "Overwatch",
    implies: ["battlenet", "ow_public"],
  },
  {
    kind: "faceit",
    label: "FACEIT Account",
    organizerNote: "They link FACEIT. Gives you nicknames to invite from your FACEIT tournament.",
    shares: "Your FACEIT nickname and ID",
    group: "Platforms",
  },
  {
    kind: "startgg",
    label: "start.gg Account",
    organizerNote: "They link start.gg. Gives you gamertags to paste into start.gg's Bulk Add.",
    shares: "Your start.gg gamertag and ID",
    group: "Platforms",
  },
  {
    kind: "challonge",
    label: "Challonge Account",
    organizerNote: "They link Challonge. Gives you usernames to add as participants.",
    shares: "Your Challonge username and ID",
    group: "Platforms",
  },
];

export function requirementDef(kind: string): RequirementDef | null {
  return REQUIREMENTS.find((r) => r.kind === kind) ?? null;
}

export function isRequirementKind(kind: string): kind is RequirementKind {
  return (REQUIREMENT_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// Organizer questions.
// ---------------------------------------------------------------------------

export const QUESTION_KINDS = [
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "checkbox",
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** Google Forms' own names, which organizers already know. `checkbox` is ours:
    a single box to tick, for a rules agreement. */
export const QUESTION_LABELS: Record<QuestionKind, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  single_choice: "Multiple choice",
  multi_choice: "Checkboxes",
  checkbox: "Single tick box",
};

export function isQuestionKind(kind: string): kind is QuestionKind {
  return (QUESTION_KINDS as readonly string[]).includes(kind);
}

export function isChoiceKind(kind: string): boolean {
  return kind === "single_choice" || kind === "multi_choice";
}

// ---------------------------------------------------------------------------
// Item configs. Stored as JSON and normalized on every write AND every read, so
// a hand-edited or stale row degrades to an empty config rather than throwing.
// ---------------------------------------------------------------------------

export type AcademicConfig = { domains: string[] };
export type DiscordServerConfig = {
  guildId: string;
  inviteUrl: string | null;
  serverName: string | null;
};
export type ChoiceConfig = { options: string[] };

export type FormItem = {
  id: string;
  kind: string;
  position: number;
  label: string | null;
  help: string | null;
  required: boolean;
  config: Record<string, unknown>;
};

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseItemConfig(raw: string | null | undefined): Record<string, unknown> {
  return parseJsonObject(raw);
}

const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * "@UIC.edu, https://www.uiuc.edu/\n illinois.edu" → ["uic.edu", "uiuc.edu",
 * "illinois.edu"]. Accepts the shapes organizers paste, keeps only real
 * hostnames, dedupes, caps at MAX_DOMAINS. `www.` is dropped because nobody's
 * school email lives at www.
 */
export function normalizeDomains(input: unknown): string[] {
  const parts = Array.isArray(input)
    ? input.map((v) => String(v))
    : String(input ?? "").split(/[\s,;]+/);
  const out: string[] = [];
  for (const part of parts) {
    let d = part.trim().toLowerCase();
    if (!d) continue;
    d = d.replace(/^[a-z]+:\/\//, "").replace(/^@/, "").split(/[/?#]/)[0];
    d = d.replace(/^www\./, "").replace(/\.$/, "");
    if (DOMAIN_RE.test(d) && !out.includes(d)) out.push(d);
    if (out.length >= MAX_DOMAINS) break;
  }
  return out;
}

export function academicConfig(config: Record<string, unknown>): AcademicConfig {
  return { domains: normalizeDomains(config.domains ?? []) };
}

/** True when `email`'s domain is one of `domains` or a subdomain of one. */
export function emailOnDomains(email: string | null, domains: string[]): boolean {
  const at = email?.lastIndexOf("@") ?? -1;
  if (!email || at < 0) return false;
  const host = email.slice(at + 1).toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

const GUILD_ID_RE = /^\d{17,20}$/;
const DISCORD_INVITE_RE =
  /^https:\/\/(?:www\.)?(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]{2,64}\/?$/;

/** Null when the server id is unusable — the requirement can't be checked. */
export function discordServerConfig(
  config: Record<string, unknown>,
): DiscordServerConfig | null {
  const guildId = String(config.guildId ?? "").trim();
  if (!GUILD_ID_RE.test(guildId)) return null;
  const invite = String(config.inviteUrl ?? "").trim();
  const name = String(config.serverName ?? "").trim().slice(0, 100);
  return {
    guildId,
    inviteUrl: DISCORD_INVITE_RE.test(invite) ? invite : null,
    serverName: name || null,
  };
}

export function isDiscordGuildId(value: string): boolean {
  return GUILD_ID_RE.test(value.trim());
}

export function isDiscordInviteUrl(value: string): boolean {
  return DISCORD_INVITE_RE.test(value.trim());
}

export function choiceConfig(config: Record<string, unknown>): ChoiceConfig {
  const raw = Array.isArray(config.options) ? config.options : [];
  const options: string[] = [];
  for (const value of raw) {
    const option = String(value ?? "").trim().slice(0, OPTION_MAX);
    if (option && !options.includes(option)) options.push(option);
    if (options.length >= MAX_OPTIONS) break;
  }
  return { options };
}

/** http(s) only, so a stored link can never become a javascript: href. */
export function normalizeHttpUrl(value: unknown): string | null {
  const raw = String(value ?? "").trim().slice(0, URL_MAX);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What the builder's requirement rows display as configured. */
export function requirementSummary(item: FormItem): string | null {
  if (item.kind === "academic") {
    const { domains } = academicConfig(item.config);
    return domains.length ? `Only ${domains.join(", ")}` : "Any school";
  }
  if (item.kind === "discord_server") {
    const cfg = discordServerConfig(item.config);
    if (!cfg) return "Needs a server ID";
    return cfg.serverName ?? `Server ${cfg.guildId}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Answers.
// ---------------------------------------------------------------------------

export type Answer = string | string[] | boolean | null;

/**
 * Validate one question's raw answer. Returns the normalized answer, or an
 * error message. Runs on the server for every submit; the client only uses it
 * to pre-flight the same rules.
 */
export function normalizeAnswer(
  item: FormItem,
  raw: unknown,
): { ok: true; value: Answer } | { ok: false; error: string } {
  const name = item.label ?? "This question";
  switch (item.kind) {
    case "short_text":
    case "long_text": {
      const max = item.kind === "short_text" ? SHORT_ANSWER_MAX : LONG_ANSWER_MAX;
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) {
        return item.required ? { ok: false, error: `${name} needs an answer.` } : { ok: true, value: null };
      }
      if (text.length > max) {
        return { ok: false, error: `${name} is too long (${max} characters max).` };
      }
      return { ok: true, value: text };
    }
    case "single_choice": {
      const { options } = choiceConfig(item.config);
      const pick = typeof raw === "string" ? raw : "";
      if (!pick) {
        return item.required ? { ok: false, error: `Pick an answer for ${name}.` } : { ok: true, value: null };
      }
      if (!options.includes(pick)) return { ok: false, error: `${name}: that choice isn't offered.` };
      return { ok: true, value: pick };
    }
    case "multi_choice": {
      const { options } = choiceConfig(item.config);
      const picks = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
      const kept = options.filter((o) => picks.includes(o));
      if (picks.length !== kept.length) return { ok: false, error: `${name}: a choice isn't offered.` };
      if (!kept.length && item.required) return { ok: false, error: `Pick at least one for ${name}.` };
      return { ok: true, value: kept.length ? kept : null };
    }
    case "checkbox": {
      const checked = raw === true;
      if (!checked && item.required) return { ok: false, error: `${name} must be checked.` };
      return { ok: true, value: checked };
    }
    default:
      return { ok: false, error: "Unknown question." };
  }
}

// ---------------------------------------------------------------------------
// Evidence — what a requirement shares, snapshotted at submission. These are
// the stored JSON shapes in signup_response_values.value.
// ---------------------------------------------------------------------------

export type HandleEvidence = { handle: string | null; id: string | null };
export type RequirementEvidence = {
  account_email: { email: string };
  academic: { school: string | null; memberType: string | null; emailDomain: string | null };
  discord: HandleEvidence;
  discord_server: { server: string | null; inServer: boolean };
  battlenet: { battletag: string | null };
  ow_public: { public: boolean };
  ow_rank: {
    season: number | null;
    tank: string;
    damage: string;
    support: string;
    open: string;
    capturedAt: number | null;
  };
  faceit: HandleEvidence;
  startgg: HandleEvidence;
  challonge: HandleEvidence;
};

// ---------------------------------------------------------------------------
// Export. One column list, built from the form's items, read by the CSV route,
// the printable report and the Responses table.
// ---------------------------------------------------------------------------

export type StoredValue = { value: unknown; met: boolean | null };

export type ExportResponse = {
  name: string;
  status: string;
  submittedAt: number;
  updatedAt: number;
  values: Record<string, StoredValue>;
};

export type ExportColumn = {
  key: string;
  header: string;
  get: (response: ExportResponse) => string;
};

function field(v: StoredValue | undefined, key: string): string {
  if (!v || !v.value || typeof v.value !== "object") return "";
  const x = (v.value as Record<string, unknown>)[key];
  if (x == null) return "";
  if (typeof x === "boolean") return x ? "Yes" : "No";
  return String(x);
}

function yesNo(v: StoredValue | undefined): string {
  if (!v) return "";
  return v.met ? "Yes" : "No";
}

function formatAnswer(v: StoredValue | undefined): string {
  if (!v || v.value == null) return "";
  if (Array.isArray(v.value)) return v.value.map(String).join("; ");
  if (typeof v.value === "boolean") return v.value ? "Yes" : "No";
  return String(v.value);
}

function formatStamp(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** The handle columns every linked-platform requirement contributes. */
const HANDLE_HEADERS: Partial<Record<RequirementKind, [string, string]>> = {
  discord: ["Discord", "Discord ID"],
  faceit: ["FACEIT", "FACEIT ID"],
  startgg: ["start.gg", "start.gg ID"],
  challonge: ["Challonge", "Challonge ID"],
};

/**
 * Columns, in order: who and when, then each requirement in registry order,
 * then each question in its position order. Requirements only contribute
 * columns when the form has them, so an export carries nothing the form
 * didn't ask for.
 */
export function exportColumns(items: FormItem[]): ExportColumn[] {
  const cols: ExportColumn[] = [
    { key: "name", header: "Name", get: (r) => r.name },
    { key: "submitted", header: "Submitted", get: (r) => formatStamp(r.submittedAt) },
    { key: "updated", header: "Last Updated", get: (r) => formatStamp(r.updatedAt) },
  ];
  const byKind = new Map(items.map((i) => [i.kind, i]));

  for (const def of REQUIREMENTS) {
    const item = byKind.get(def.kind);
    if (!item) continue;
    const v = (r: ExportResponse) => r.values[item.id];
    const handles = HANDLE_HEADERS[def.kind];
    if (handles) {
      cols.push(
        { key: `${item.id}:handle`, header: handles[0], get: (r) => field(v(r), "handle") },
        { key: `${item.id}:id`, header: handles[1], get: (r) => field(v(r), "id") },
      );
      continue;
    }
    switch (def.kind) {
      case "account_email":
        cols.push({ key: item.id, header: "Email", get: (r) => field(v(r), "email") });
        break;
      case "academic":
        cols.push(
          { key: `${item.id}:school`, header: "School", get: (r) => field(v(r), "school") },
          { key: `${item.id}:type`, header: "Member Type", get: (r) => field(v(r), "memberType") },
          { key: `${item.id}:domain`, header: "School Email Domain", get: (r) => field(v(r), "emailDomain") },
        );
        break;
      case "discord_server": {
        const cfg = discordServerConfig(item.config);
        cols.push({
          key: item.id,
          header: `In Server${cfg?.serverName ? `: ${cfg.serverName}` : ""}`,
          get: (r) => yesNo(v(r)),
        });
        break;
      }
      case "battlenet":
        cols.push({ key: item.id, header: "BattleTag", get: (r) => field(v(r), "battletag") });
        break;
      case "ow_public":
        cols.push({ key: item.id, header: "Public OW Profile", get: (r) => yesNo(v(r)) });
        break;
      case "ow_rank":
        cols.push(
          { key: `${item.id}:tank`, header: "Tank Rank", get: (r) => field(v(r), "tank") },
          { key: `${item.id}:damage`, header: "Damage Rank", get: (r) => field(v(r), "damage") },
          { key: `${item.id}:support`, header: "Support Rank", get: (r) => field(v(r), "support") },
          { key: `${item.id}:open`, header: "Open Queue Rank", get: (r) => field(v(r), "open") },
          { key: `${item.id}:season`, header: "Rank Season", get: (r) => field(v(r), "season") },
        );
        break;
    }
  }

  const questions = items
    .filter((i) => isQuestionKind(i.kind))
    .sort((a, b) => a.position - b.position);
  for (const q of questions) {
    cols.push({
      key: q.id,
      header: q.label ?? "Question",
      get: (r) => formatAnswer(r.values[q.id]),
    });
  }
  return cols;
}

/**
 * One CSV cell. Quotes when needed, and defuses spreadsheet formulas: answers
 * are member input and organizers open these in Excel, where a cell starting
 * with = + - @ (or a tab/CR) is executed rather than shown.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(columns: ExportColumn[], rows: ExportResponse[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.get(row))).join(","));
  return lines.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Platform lists — the "importable to any supported site" layer. None of
// start.gg, FACEIT or LeagueOS accepts an organizer's roster over an API (only
// Challonge does, and only into tournaments the caller can write), so the
// portable form of a roster is each platform's own handle, laid out the way
// that platform's admin tools take it. When team entries arrive, the same
// per-provider snapshots feed a team roster export.
// ---------------------------------------------------------------------------

export type PlatformList = {
  kind: RequirementKind;
  label: string;
  /** Where the list goes on the platform. */
  hint: string;
  /** Lines per copy; null = one list. */
  batch: number | null;
  /** The handle a line carries. */
  line: (v: StoredValue | undefined) => string;
};

export const PLATFORM_LISTS: readonly PlatformList[] = [
  {
    kind: "startgg",
    label: "start.gg Gamertags",
    hint: "Paste into your tournament's Attendees › Bulk Add. start.gg takes 50 per paste and only for singles events.",
    batch: STARTGG_BULK_ADD_BATCH,
    line: (v) => field(v, "handle"),
  },
  {
    kind: "faceit",
    label: "FACEIT Nicknames",
    hint: "Invite these from your championship's Admin › Invites. Each player must follow your organizer page or be friends with one of its admins.",
    batch: null,
    line: (v) => field(v, "handle"),
  },
  {
    kind: "challonge",
    label: "Challonge Usernames",
    hint: "Add these as participants by username, so the event lands in each player's Challonge history.",
    batch: null,
    line: (v) => field(v, "handle"),
  },
  {
    kind: "battlenet",
    label: "BattleTags",
    hint: "For lobby invites and roster checks.",
    batch: null,
    line: (v) => field(v, "battletag"),
  },
  {
    kind: "discord",
    label: "Discord Usernames",
    hint: "For adding roles or a private channel in your server.",
    batch: null,
    line: (v) => field(v, "handle"),
  },
];
