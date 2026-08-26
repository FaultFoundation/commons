// One-time migration of the Discord bot's normalized Google Sheets data into
// local D1. The input is a sanitized JSON export: verification codes, attempts,
// kick/ban timestamps, notes, Config, and raw form archives must not be present.
//
// Dry-run (default):
//   node scripts/migrate-legacy-bot-data.mjs --input /tmp/legacy-bot-data.json
// Apply to local D1 (there is deliberately no remote mode):
//   node scripts/migrate-legacy-bot-data.mjs --input /tmp/legacy-bot-data.json --apply
// Emit reviewed SQL under ignored temp/ for a human-run remote upload:
//   node scripts/migrate-legacy-bot-data.mjs --input /tmp/legacy-bot-data.json --output-sql temp/legacy-bot-data.sql

// Re-running is safe: source keys produce deterministic ids and inserts never
// overwrite rows. Ownership guards abort before inserts if an imported email,
// Discord account, platform identity, college, membership, or ticket is already
// attached to a different id.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROGRAM_ID = "collegiate-overwatch";
const GUARD_TABLE = "ff_legacy_bot_import_guard_20260826";
const FREE_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "ymail.com",
]);

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

export function stableId(kind, key) {
  const digest = createHash("sha256")
    .update(`fault-legacy-bot:${kind}:${key}`)
    .digest("hex")
    .slice(0, 32);
  return `legacy-${kind}-${digest}`;
}

export function isValidEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(value));
}

export function normalizeDiscordId(value) {
  const raw = text(value);
  const mention = /^<@!?(\d{15,22})>$/.exec(raw);
  if (mention) return { sourceKey: raw, accountId: mention[1] };
  return {
    sourceKey: raw,
    accountId: /^\d{15,22}$/.test(raw) ? raw : null,
  };
}

export function parseLegacyDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeGraduationDate(value) {
  const raw = text(value);
  if (!raw) return null;
  const yearMonth = /^(\d{4})-(\d{2})/.exec(raw);
  if (yearMonth) return `${yearMonth[1]}-${yearMonth[2]}`;
  const parsed = parseLegacyDate(raw);
  if (parsed == null) return raw;
  const date = new Date(parsed);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function hostnameOf(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function emailDomain(value) {
  if (!isValidEmail(value)) return null;
  return lower(value).split("@").pop() ?? null;
}

function bool(value) {
  return value === true || /^(1|true|yes)$/i.test(text(value));
}

function sourceTime(...values) {
  for (const value of values) {
    const parsed = parseLegacyDate(value);
    if (parsed != null) return parsed;
  }
  return 0;
}

function latestFormsByDiscordId(forms) {
  const result = new Map();
  for (const form of forms) {
    const discordId = text(form.discordId);
    if (!discordId) continue;
    const previous = result.get(discordId);
    if (
      !previous ||
      sourceTime(form.timestamp) >= sourceTime(previous.timestamp)
    ) {
      result.set(discordId, form);
    }
  }
  return result;
}

function buildSchoolIndexes(schools) {
  const byName = new Map();
  const byDomain = new Map();
  for (const school of schools) {
    const name = lower(school.name);
    const domain = hostnameOf(school.website);
    if (name && !byName.has(name)) byName.set(name, school);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, school);
  }
  return { byName, byDomain };
}

function resolveCollege(registration, schoolIndexes) {
  const enteredName = text(registration.schoolName);
  if (!enteredName) return null;

  const enteredWebsite = text(registration.schoolWebsite);
  const websiteDomain = hostnameOf(enteredWebsite);
  const schoolEmailDomain = emailDomain(registration.schoolEmail);
  const matched =
    schoolIndexes.byName.get(lower(enteredName)) ??
    (websiteDomain ? schoolIndexes.byDomain.get(websiteDomain) : null) ??
    null;
  const matchedDomain = hostnameOf(matched?.website);
  const primaryDomain =
    matchedDomain ??
    websiteDomain ??
    (schoolEmailDomain && !FREE_EMAIL_DOMAINS.has(schoolEmailDomain)
      ? schoolEmailDomain
      : null);
  const website = text(matched?.website) || enteredWebsite || null;
  const domains = primaryDomain ? [primaryDomain] : [];

  return {
    id: stableId("college", primaryDomain ?? lower(enteredName)),
    name: text(matched?.name) || enteredName,
    country: text(matched?.country) || null,
    alpha_two_code: null,
    state_province: null,
    primary_domain: primaryDomain,
    domains: domains.length ? JSON.stringify(domains) : null,
    web_pages: website ? JSON.stringify([website]) : null,
  };
}

function domainsMatch(email, college) {
  const domain = emailDomain(email);
  if (!domain || !college?.domains) return null;
  const candidates = JSON.parse(college.domains);
  return candidates.some(
    (candidate) => domain === candidate || domain.endsWith(`.${candidate}`),
  );
}

function hasApplicationData(registration) {
  return [
    registration.userType,
    registration.graduationDate,
    registration.schoolName,
    registration.schoolWebsite,
    registration.schoolEmail,
  ].some((value) => text(value));
}

function parseTicketNumber(value) {
  const match = /(\d+)\s*$/.exec(text(value));
  if (!match) return null;
  const number = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function ticketCloseReason(closedBy) {
  return /auto[- ]?closed|inactivity/i.test(text(closedBy))
    ? "inactivity"
    : "discord";
}

function assertUnique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = row[key];
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildMigrationPlan(source, schools = []) {
  if (source?.version !== 1) {
    throw new Error("legacy export version must be 1");
  }
  if (!Array.isArray(source.users) || !Array.isArray(source.tickets)) {
    throw new Error("legacy export must contain users and tickets arrays");
  }

  const forms = Array.isArray(source.forms) ? source.forms : [];
  const formsByDiscordId = latestFormsByDiscordId(forms);
  const schoolIndexes = buildSchoolIndexes(schools);
  const fallbackTime = sourceTime(source.exportedAt);
  const warnings = [];
  const usersBySourceDiscordId = new Map();
  const collegeMap = new Map();
  const plan = {
    warnings,
    users: [],
    accounts: [],
    profiles: [],
    identities: [],
    colleges: [],
    memberships: [],
    registrations: [],
    tickets: [],
    messages: [],
  };

  for (const [index, legacyUser] of source.users.entries()) {
    const sourceDiscord = normalizeDiscordId(legacyUser.discordId);
    const canonicalDiscord = normalizeDiscordId(legacyUser.canonicalDiscordId);
    if (legacyUser.canonicalDiscordId && !canonicalDiscord.accountId) {
      throw new Error(`user row ${index + 1} has an invalid canonical Discord id`);
    }
    if (
      sourceDiscord.accountId &&
      canonicalDiscord.accountId &&
      sourceDiscord.accountId !== canonicalDiscord.accountId
    ) {
      throw new Error(`user row ${index + 1} overrides an already valid Discord id`);
    }
    const normalizedDiscord = {
      sourceKey: sourceDiscord.sourceKey,
      accountId: canonicalDiscord.accountId ?? sourceDiscord.accountId,
    };
    if (!normalizedDiscord.sourceKey) {
      throw new Error(`user row ${index + 1} has no Discord id`);
    }
    if (usersBySourceDiscordId.has(normalizedDiscord.sourceKey)) {
      throw new Error(`duplicate legacy Discord id at user row ${index + 1}`);
    }

    const form = formsByDiscordId.get(normalizedDiscord.sourceKey) ?? {};
    const userId = stableId("user", normalizedDiscord.sourceKey);
    const createdAt = sourceTime(
      form.timestamp,
      legacyUser.lastUpdated,
      source.exportedAt,
    );
    const status = text(legacyUser.status).toUpperCase();
    const rawEmail = lower(legacyUser.schoolEmail);
    const formEmail = lower(form.schoolEmail);
    const realEmail = isValidEmail(rawEmail)
      ? rawEmail
      : isValidEmail(formEmail)
        ? formEmail
        : null;
    const placeholderKey =
      normalizedDiscord.accountId ??
      stableId("email", normalizedDiscord.sourceKey).slice(-24);
    const email = realEmail ?? `${placeholderKey}@discord.invalid`;
    const username =
      text(legacyUser.username) ||
      text(form.discordUsername) ||
      `Discord member ${normalizedDiscord.sourceKey.slice(-4)}`;

    plan.users.push({
      id: userId,
      name: username,
      email,
      email_verified: status === "VERIFIED" && Boolean(realEmail),
      image: null,
      two_factor_enabled: false,
      created_at: createdAt || fallbackTime,
      updated_at: createdAt || fallbackTime,
    });
    usersBySourceDiscordId.set(normalizedDiscord.sourceKey, userId);

    if (normalizedDiscord.accountId) {
      plan.accounts.push({
        id: stableId("account-discord", normalizedDiscord.accountId),
        account_id: normalizedDiscord.accountId,
        provider_id: "discord",
        user_id: userId,
        access_token: null,
        refresh_token: null,
        id_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        scope: null,
        password: null,
        created_at: createdAt || fallbackTime,
        updated_at: createdAt || fallbackTime,
      });
      plan.identities.push({
        id: stableId("identity-discord", normalizedDiscord.accountId),
        user_id: userId,
        provider: "discord",
        external_id: normalizedDiscord.accountId,
        handle: username,
        metadata: null,
        verified: true,
        connected_at: createdAt || fallbackTime,
        refreshed_at: null,
        created_at: createdAt || fallbackTime,
        updated_at: createdAt || fallbackTime,
      });
    } else {
      warnings.push(`user row ${index + 1} has a non-claimable Discord id`);
    }

    const battleTag = text(legacyUser.battleTag) || text(form.battleTag);
    if (battleTag) {
      plan.identities.push({
        id: stableId("identity-battlenet", normalizedDiscord.sourceKey),
        user_id: userId,
        provider: "battlenet",
        external_id: null,
        handle: battleTag,
        metadata: null,
        verified: false,
        connected_at: null,
        refreshed_at: null,
        created_at: createdAt || fallbackTime,
        updated_at: createdAt || fallbackTime,
      });
    }

    const steamFriendCode =
      text(legacyUser.steamFriendCode) || text(form.steamFriendCode);
    if (steamFriendCode) {
      plan.identities.push({
        id: stableId("identity-steam", normalizedDiscord.sourceKey),
        user_id: userId,
        provider: "steam",
        external_id: null,
        handle: steamFriendCode,
        metadata: null,
        verified: false,
        connected_at: null,
        refreshed_at: null,
        created_at: createdAt || fallbackTime,
        updated_at: createdAt || fallbackTime,
      });
    }

    const ageRange = text(form.ageRange) || null;
    const dmPreference = text(legacyUser.dmPreference) || null;
    if (ageRange || dmPreference) {
      plan.profiles.push({
        id: stableId("profile", normalizedDiscord.sourceKey),
        user_id: userId,
        country: null,
        age_range: ageRange,
        dm_preference: dmPreference,
        density: "cozy",
        created_at: createdAt || fallbackTime,
        updated_at: createdAt || fallbackTime,
      });
    }

    const registration = {
      userType: text(legacyUser.userType) || text(form.userType) || null,
      graduationDate:
        normalizeGraduationDate(legacyUser.graduationDate) ??
        normalizeGraduationDate(form.graduationDate),
      schoolName: text(legacyUser.schoolName) || text(form.schoolName) || null,
      schoolWebsite:
        text(legacyUser.schoolWebsite) || text(form.schoolWebsite) || null,
      schoolEmail: realEmail,
      referrer: text(form.referrer) || null,
      circumstances: text(form.circumstances) || null,
    };
    if (!hasApplicationData(registration)) continue;

    const membershipId = stableId("membership", normalizedDiscord.sourceKey);
    const membershipStatus = status === "VERIFIED" ? "VERIFIED" : "MANUAL_REVIEW";
    const verifiedAt =
      membershipStatus === "VERIFIED"
        ? sourceTime(legacyUser.verifiedAt, legacyUser.lastUpdated, form.timestamp) || null
        : null;
    const college = resolveCollege(registration, schoolIndexes);
    if (college) collegeMap.set(college.id, college);

    plan.memberships.push({
      id: membershipId,
      user_id: userId,
      program_id: PROGRAM_ID,
      status: membershipStatus,
      joined_at: createdAt || fallbackTime,
      verified_at: verifiedAt,
      created_at: createdAt || fallbackTime,
      updated_at: createdAt || fallbackTime,
    });
    plan.registrations.push({
      id: stableId("registration", normalizedDiscord.sourceKey),
      membership_id: membershipId,
      college_id: college?.id ?? null,
      user_type: registration.userType,
      school_email: registration.schoolEmail,
      graduation_date: registration.graduationDate,
      domain_matched: domainsMatch(registration.schoolEmail, college),
      referrer: registration.referrer,
      circumstances: registration.circumstances,
      created_at: createdAt || fallbackTime,
      updated_at: createdAt || fallbackTime,
    });
  }

  plan.colleges = [...collegeMap.values()].map((college) => ({
    ...college,
    created_at: fallbackTime,
  }));

  for (const [index, legacyTicket] of source.tickets.entries()) {
    const sourceTicketId = text(legacyTicket.ticketId);
    const ticketNumber = parseTicketNumber(sourceTicketId);
    if (!sourceTicketId || ticketNumber == null) {
      throw new Error(`ticket row ${index + 1} has no usable ticket number`);
    }
    const ticketId = stableId("ticket", sourceTicketId);
    const discordUserId = text(legacyTicket.discordUserId) || null;
    const createdAt = sourceTime(legacyTicket.createdAt, source.exportedAt);
    const lastActivityAt = sourceTime(
      legacyTicket.lastActivity,
      legacyTicket.closedAt,
      legacyTicket.createdAt,
      source.exportedAt,
    );
    const closed = /^closed$/i.test(text(legacyTicket.status));
    const closedAt = closed
      ? sourceTime(legacyTicket.closedAt, legacyTicket.lastActivity) || null
      : null;
    const closedBy = text(legacyTicket.closedBy);

    plan.tickets.push({
      id: ticketId,
      ticket_number: ticketNumber,
      user_id: discordUserId
        ? (usersBySourceDiscordId.get(discordUserId) ?? null)
        : null,
      discord_user_id: discordUserId,
      discord_username: text(legacyTicket.username) || null,
      discord_channel_id: text(legacyTicket.channelId) || null,
      discord_channel_name: text(legacyTicket.channelName) || null,
      category: text(legacyTicket.inquiryType) || null,
      subject: null,
      status: closed ? "closed" : "open",
      priority: null,
      assigned_to_user_id: null,
      close_reason: closed ? ticketCloseReason(closedBy) : null,
      closed_by_user_id: null,
      warning_sent: bool(legacyTicket.warningSent),
      last_activity_at: lastActivityAt,
      closed_at: closedAt,
      created_at: createdAt,
      updated_at: lastActivityAt,
    });

    const description = text(legacyTicket.description);
    if (description) {
      const isSystem = discordUserId?.toUpperCase() === "SYSTEM";
      plan.messages.push({
        id: stableId("ticket-opening", sourceTicketId),
        ticket_id: ticketId,
        author_type: isSystem ? "system" : "user",
        author_user_id: discordUserId
          ? (usersBySourceDiscordId.get(discordUserId) ?? null)
          : null,
        author_discord_id: isSystem ? null : discordUserId,
        author_name:
          text(legacyTicket.username) || (isSystem ? "System" : "Unknown"),
        content: description,
        attachments: null,
        source: "discord",
        discord_message_id: null,
        created_at: createdAt,
      });
    }
    if (closed && closedBy) {
      plan.messages.push({
        id: stableId("ticket-close", sourceTicketId),
        ticket_id: ticketId,
        author_type: "system",
        author_user_id: null,
        author_discord_id: null,
        author_name: "Legacy migration",
        content: `Closed by ${closedBy}`,
        attachments: null,
        source: "discord",
        discord_message_id: null,
        created_at: closedAt ?? lastActivityAt,
      });
    }
  }

  assertUnique(plan.users, "id", "user id");
  assertUnique(plan.users, "email", "user email");
  assertUnique(plan.accounts, "account_id", "Discord account id");
  assertUnique(plan.memberships, "user_id", "collegiate membership user");
  assertUnique(plan.tickets, "ticket_number", "ticket number");
  assertUnique(plan.tickets, "discord_channel_id", "ticket channel");

  return plan;
}

const sqlValue = (value) => {
  if (value == null) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("cannot render non-finite SQL number");
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

function valuesCte(rows, columns) {
  return rows
    .map((row) => `(${columns.map((column) => sqlValue(row[column])).join(", ")})`)
    .join(",\n    ");
}

function ownershipGuard(table, rows, columns, join, conflict) {
  if (rows.length === 0) return "";
  return `WITH expected(${columns.join(", ")}) AS (\n  VALUES\n    ${valuesCte(rows, columns)}\n)\nINSERT INTO ${GUARD_TABLE}(ok)\nSELECT 0 FROM expected e JOIN ${table} t ON ${join}\nWHERE ${conflict}\nLIMIT 1;`;
}

function insertRows(table, rows) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  return rows
    .map(
      (row) =>
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns
          .map((column) => sqlValue(row[column]))
          .join(", ")}) ON CONFLICT(id) DO NOTHING;`,
    )
    .join("\n");
}

export function renderMigrationSql(plan) {
  const guards = [
    ownershipGuard(
      '"user"',
      plan.users,
      ["id", "email"],
      "t.id = e.id OR t.email = e.email",
      "t.id IS NOT e.id OR t.email IS NOT e.email",
    ),
    ownershipGuard(
      "account",
      plan.accounts,
      ["id", "user_id", "provider_id", "account_id"],
      "t.id = e.id OR (t.provider_id = e.provider_id AND t.account_id = e.account_id)",
      "t.id IS NOT e.id OR t.user_id IS NOT e.user_id OR t.provider_id IS NOT e.provider_id OR t.account_id IS NOT e.account_id",
    ),
    ownershipGuard(
      "profiles",
      plan.profiles,
      ["id", "user_id"],
      "t.id = e.id OR t.user_id = e.user_id",
      "t.id IS NOT e.id OR t.user_id IS NOT e.user_id",
    ),
    ownershipGuard(
      "platform_identities",
      plan.identities,
      ["id", "user_id", "provider", "external_id"],
      "t.id = e.id OR (t.user_id = e.user_id AND t.provider = e.provider) OR (e.external_id IS NOT NULL AND t.provider = e.provider AND t.external_id = e.external_id)",
      "t.id IS NOT e.id OR t.user_id IS NOT e.user_id OR t.provider IS NOT e.provider OR t.external_id IS NOT e.external_id",
    ),
    ownershipGuard(
      "colleges",
      plan.colleges,
      ["id", "primary_domain"],
      "t.id = e.id OR (e.primary_domain IS NOT NULL AND t.primary_domain = e.primary_domain)",
      "t.id IS NOT e.id OR t.primary_domain IS NOT e.primary_domain",
    ),
    ownershipGuard(
      "program_memberships",
      plan.memberships,
      ["id", "user_id", "program_id"],
      "t.id = e.id OR (t.user_id = e.user_id AND t.program_id = e.program_id)",
      "t.id IS NOT e.id OR t.user_id IS NOT e.user_id OR t.program_id IS NOT e.program_id",
    ),
    ownershipGuard(
      "collegiate_registrations",
      plan.registrations,
      ["id", "membership_id"],
      "t.id = e.id OR t.membership_id = e.membership_id",
      "t.id IS NOT e.id OR t.membership_id IS NOT e.membership_id",
    ),
    ownershipGuard(
      "support_tickets",
      plan.tickets,
      ["id", "ticket_number", "discord_channel_id"],
      "t.id = e.id OR t.ticket_number = e.ticket_number OR (e.discord_channel_id IS NOT NULL AND t.discord_channel_id = e.discord_channel_id)",
      "t.id IS NOT e.id OR t.ticket_number IS NOT e.ticket_number OR t.discord_channel_id IS NOT e.discord_channel_id",
    ),
  ].filter(Boolean);

  return [
    "-- Generated by scripts/migrate-legacy-bot-data.mjs. Local D1 only.",
    "PRAGMA foreign_keys = ON;",
    `DROP TABLE IF EXISTS ${GUARD_TABLE};`,
    `CREATE TABLE ${GUARD_TABLE}(ok INTEGER CHECK (ok = 1));`,
    `INSERT INTO ${GUARD_TABLE}(ok) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM programs WHERE id = 'collegiate-overwatch');`,
    ...guards,
    insertRows('"user"', plan.users),
    insertRows("account", plan.accounts),
    insertRows("profiles", plan.profiles),
    insertRows("platform_identities", plan.identities),
    insertRows("colleges", plan.colleges),
    insertRows("program_memberships", plan.memberships),
    insertRows("collegiate_registrations", plan.registrations),
    insertRows("support_tickets", plan.tickets),
    insertRows("support_ticket_messages", plan.messages),
    `DROP TABLE ${GUARD_TABLE};`,
    "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function summarizePlan(plan) {
  return {
    users: plan.users.length,
    discordAccounts: plan.accounts.length,
    profiles: plan.profiles.length,
    platformIdentities: plan.identities.length,
    colleges: plan.colleges.length,
    registrations: plan.registrations.length,
    verifiedMemberships: plan.memberships.filter((row) => row.status === "VERIFIED").length,
    manualReviewMemberships: plan.memberships.filter((row) => row.status === "MANUAL_REVIEW").length,
    tickets: plan.tickets.length,
    ticketMessages: plan.messages.length,
    warnings: plan.warnings.length,
  };
}

function parseArgs(argv) {
  const args = { apply: false, input: null, outputSql: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index] ?? null;
    else if (arg === "--output-sql") args.outputSql = argv[++index] ?? null;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--remote") {
      throw new Error("remote targets are intentionally unsupported");
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.input) throw new Error("provide --input <sanitized-export.json>");
  return args;
}

function backupLocalD1() {
  const source = path.join(ROOT, ".wrangler", "state", "v3", "d1");
  if (!existsSync(source)) {
    throw new Error("local D1 state does not exist; run local migrations first");
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(ROOT, "temp", "d1-backups", `legacy-bot-${stamp}`);
  mkdirSync(path.dirname(backup), { recursive: true });
  cpSync(source, backup, { recursive: true });
  return backup;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = JSON.parse(readFileSync(path.resolve(args.input), "utf8"));
  const schools = JSON.parse(
    readFileSync(path.join(ROOT, "public", "schools.json"), "utf8"),
  );
  const plan = buildMigrationPlan(source, schools);
  const summary = summarizePlan(plan);
  console.log(JSON.stringify(summary, null, 2));
  for (const warning of plan.warnings) console.warn(`Warning: ${warning}`);

  if (args.outputSql) {
    const outputPath = path.resolve(args.outputSql);
    const tempRoot = `${path.join(ROOT, "temp")}${path.sep}`;
    if (!outputPath.startsWith(tempRoot)) {
      throw new Error("--output-sql must write below the ignored temp/ directory");
    }
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, renderMigrationSql(plan), { mode: 0o600 });
    console.log(`Migration SQL: ${path.relative(ROOT, outputPath)}`);
  }

  if (!args.apply) {
    console.log("Dry run only. Pass --apply to write local D1.");
    return;
  }

  const backup = backupLocalD1();
  const sqlPath = path.join(
    tmpdir(),
    `commons-legacy-bot-${process.pid}-${Date.now()}.sql`,
  );
  writeFileSync(sqlPath, renderMigrationSql(plan), { mode: 0o600 });
  console.log(`Local D1 backup: ${path.relative(ROOT, backup)}`);
  try {
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        "website-sql",
        "--local",
        "--file",
        sqlPath,
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
  } finally {
    rmSync(sqlPath, { force: true });
  }
  console.log("Legacy operational data imported into local D1.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  }
}