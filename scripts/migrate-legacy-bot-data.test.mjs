import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMigrationPlan,
  normalizeDiscordId,
  renderMigrationSql,
  stableId,
  summarizePlan,
} from "./migrate-legacy-bot-data.mjs";

const source = {
  version: 1,
  exportedAt: "2026-03-01T12:00:00Z",
  users: [
    {
      discordId: "123456789012345678",
      username: "Verified Member",
      battleTag: "Player#1234",
      steamFriendCode: "123456",
      userType: "University student",
      graduationDate: "5/1/2027",
      schoolName: "Example University",
      schoolWebsite: "https://example.edu",
      schoolEmail: "member@example.edu",
      verifiedAt: "2/1/2025 10:00:00",
      status: "VERIFIED",
      dmPreference: "ENABLED",
      lastUpdated: "2/1/2025 10:00:00",
      verificationCode: "MUST-NOT-MIGRATE",
      kickTime: "ALSO-MUST-NOT-MIGRATE",
    },
    {
      discordId: "2.34568E+17",
      canonicalDiscordId: "234567890123456789",
      username: "Lifecycle Only",
      status: "JOINED",
      dmPreference: "DISABLED",
      lastUpdated: "2/2/2025 10:00:00",
    },
  ],
  forms: [
    {
      timestamp: "1/1/2025 10:00:00",
      discordId: "123456789012345678",
      ageRange: "18-25 years old",
      referrer: "345678901234567890",
      circumstances: "Legacy context",
    },
  ],
  tickets: [
    {
      ticketId: "TICKET-0007",
      discordUserId: "123456789012345678",
      username: "Verified Member",
      channelId: "456789012345678901",
      channelName: "ticket-verified-0007",
      inquiryType: "Other",
      description: "Opening description",
      status: "Closed",
      createdAt: "2025-01-01T10:00:00Z",
      lastActivity: "2025-01-02T10:00:00Z",
      closedAt: "2025-01-02T10:00:00Z",
      closedBy: "System (Auto-closed)",
      warningSent: "True",
    },
  ],
};

test("normalizes Discord mentions but rejects non-claimable source keys", () => {
  assert.deepEqual(normalizeDiscordId("<@!123456789012345678>"), {
    sourceKey: "<@!123456789012345678>",
    accountId: "123456789012345678",
  });
  assert.deepEqual(normalizeDiscordId("1.23457E+17"), {
    sourceKey: "1.23457E+17",
    accountId: null,
  });
});

test("builds deterministic operational rows without inventing memberships", () => {
  const plan = buildMigrationPlan(source, [
    {
      name: "Example University",
      country: "United States",
      website: "https://example.edu/",
    },
  ]);

  assert.equal(plan.users.length, 2);
  assert.equal(plan.accounts.length, 2);
  assert.equal(plan.accounts[1].account_id, "234567890123456789");
  assert.equal(plan.memberships.length, 1);
  assert.equal(plan.memberships[0].status, "VERIFIED");
  assert.equal(plan.registrations[0].graduation_date, "2027-05");
  assert.equal(plan.registrations[0].domain_matched, true);
  assert.equal(plan.profiles[0].age_range, "18-25 years old");
  assert.equal(plan.tickets[0].user_id, stableId("user", source.users[0].discordId));
  assert.equal(plan.tickets[0].close_reason, "inactivity");

  assert.deepEqual(summarizePlan(plan), {
    users: 2,
    discordAccounts: 2,
    profiles: 2,
    platformIdentities: 4,
    colleges: 1,
    registrations: 1,
    verifiedMemberships: 1,
    manualReviewMemberships: 0,
    tickets: 1,
    ticketMessages: 2,
    warnings: 0,
  });
});

test("renders idempotent guarded SQL without forbidden source fields", () => {
  const sql = renderMigrationSql(buildMigrationPlan(source));

  assert.match(sql, /CREATE TABLE ff_legacy_bot_import_guard_20260826/);
  assert.match(sql, /JOIN profiles/);
  assert.match(sql, /JOIN collegiate_registrations/);
  assert.doesNotMatch(sql, /CREATE TEMP TABLE/);
  assert.match(sql, /ON CONFLICT\(id\) DO NOTHING/);
  assert.doesNotMatch(sql, /^\+/m);
  assert.doesNotMatch(sql, /MUST-NOT-MIGRATE/);
  assert.doesNotMatch(sql, /ALSO-MUST-NOT-MIGRATE/);
  assert.doesNotMatch(sql, /school_email_verifications/);
  assert.doesNotMatch(sql, /moderation_actions/);
});