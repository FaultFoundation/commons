import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { drizzle } from "drizzle-orm/d1";

// Sign-up forms: the export/validation rules (pure) and the member submit
// action run through real Drizzle against real SQLite, with every provider
// read (session, registration, linked accounts, Discord, OverFast) mocked.

const require = createRequire(import.meta.url),
  root = resolve(import.meta.dirname, "..");

function fixture() {
  const sqlite = new DatabaseSync(":memory:", { enableDoubleQuotedStringLiterals: true });
  for (const file of readdirSync(resolve(root, "drizzle")).filter((f) => f.endsWith(".sql")).sort())
    sqlite.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
  sqlite.exec(
    "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('owner','Owner','owner@example.test',1,0,0),('player','Player','player@example.test',1,0,0)",
  );
  const client = {
    prepare(query) {
      return {
        bind(...values) {
          const execute = () => {
            const results = sqlite.prepare(query).all(...values);
            return { results, meta: { changes: sqlite.prepare("SELECT changes() AS n").get().n } };
          };
          return {
            _execute: execute,
            async all() { return execute(); },
            async raw() {
              const stmt = sqlite.prepare(query);
              stmt.setReturnArrays(true);
              return stmt.all(...values);
            },
            async run() { return execute(); },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s) => s._execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };

  const f = {
    sqlite,
    db: drizzle(client),
    me: { id: "player", name: "Player", email: "player@example.test", emailVerified: true },
    reg: { status: "VERIFIED", userType: "University student", schoolName: "UIC", schoolEmail: "p@cs.uic.edu" },
    links: [{ providerId: "discord", accountId: "d1", scope: "identify guilds.members.read" }],
    identities: [{ provider: "discord", handle: "playerone", externalId: "111" }],
    inGuild: true,
    revalidated: [],
  };
  const mocks = {
    react: { cache: (fn) => fn },
    "next/headers": { headers: async () => new Headers() },
    "next/cache": { revalidatePath: (p) => f.revalidated.push(p) },
    "@/lib/db": { getDb: () => f.db },
    "@/lib/auth": {
      getAuth: () => ({ api: { getSession: async () => (f.me ? { user: f.me } : null) } }),
      discordAuthEnabled: () => true,
      battlenetAuthEnabled: () => true,
      faceitAuthEnabled: () => true,
      startggAuthEnabled: () => true,
      challongeAuthEnabled: () => true,
    },
    "@/lib/registration": {
      getRegistrationState: async () => f.reg,
      getRegistrationStateCached: async () => f.reg,
    },
    "@/lib/account-links": {
      getAccountLinks: async () => f.links,
      getAccountLinksCached: async () => f.links,
    },
    "@/lib/platform-identities": {
      getPlatformIdentities: async () => f.identities,
      getPlatformIdentitiesCached: async () => f.identities,
    },
    "@/lib/integrations": {
      checkDiscordGuild: async () => ({ state: "checked", inGuild: f.inGuild }),
    },
    "@/lib/ow-stats": {
      getCachedOwState: async () => ({ visibility: null, latest: null }),
      refreshOwState: async () => ({ visibility: null, latest: null }),
    },
  };
  const modules = new Map();
  f.load = (id) => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith("@/")) return require(id);
    if (modules.has(id)) return modules.get(id);
    const path = resolve(root, id.slice(2) + ".ts");
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    modules.set(id, exports);
    runInNewContext(code, {
      exports, require: f.load, console, Date, URL, Headers, Map, Set, JSON,
      crypto: globalThis.crypto,
    });
    return exports;
  };

  /** A form with three requirements and three questions, open by default. */
  f.form = ({ status = "open", closesAt = null, serverRequired = true } = {}) => {
    const now = Date.now();
    sqlite.prepare(
      "INSERT INTO signup_forms (id,owner_user_id,title,status,closes_at,created_at,updated_at) VALUES ('Form000001','owner','Open',?,?,?,?)",
    ).run(status, closesAt, now, now);
    const item = sqlite.prepare(
      "INSERT INTO signup_form_items (id,form_id,kind,position,label,required,config,created_at) VALUES (?,?,?,?,?,?,?,?)",
    );
    item.run("academic", "Form000001", "academic", 0, null, 1, JSON.stringify({ domains: ["uic.edu"] }), now);
    item.run("server", "Form000001", "discord_server", 0, null, serverRequired ? 1 : 0,
      JSON.stringify({ guildId: "123456789012345678", inviteUrl: null, serverName: "Fault" }), now);
    item.run("discord", "Form000001", "discord", 0, null, 1, null, now);
    item.run("team", "Form000001", "short_text", 1, "Team name", 1, null, now);
    item.run("role", "Form000001", "single_choice", 2, "Role", 1, JSON.stringify({ options: ["Tank", "Support"] }), now);
    item.run("rules", "Form000001", "checkbox", 3, "Rules", 1, null, now);
    return "Form000001";
  };
  f.values = () =>
    Object.fromEntries(
      sqlite.prepare("SELECT item_id, value, met FROM signup_response_values").all()
        .map((r) => [r.item_id, { value: r.value && JSON.parse(r.value), met: r.met }]),
    );
  return f;
}

const answers = { team: "Fault Esports", role: "Support", rules: true };
/** Objects made inside the vm sandbox carry its prototypes; compare as data. */
const plain = (x) => JSON.parse(JSON.stringify(x));

test("csvCell defuses spreadsheet formulas and quotes separators", () => {
  const { csvCell } = fixture().load("@/lib/signup-forms-shared");
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-cmd"), "'-cmd");
  assert.equal(csvCell("@sum"), "'@sum");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("plain"), "plain");
});

test("domains normalize from pasted shapes and match subdomains only", () => {
  const { normalizeDomains, emailOnDomains } = fixture().load("@/lib/signup-forms-shared");
  assert.deepEqual(
    [...normalizeDomains("@UIC.edu, https://www.illinois.edu/path junk uic.edu")],
    ["uic.edu", "illinois.edu"],
  );
  assert.equal(emailOnDomains("a@cs.uic.edu", ["uic.edu"]), true);
  assert.equal(emailOnDomains("a@uic.edu", ["uic.edu"]), true);
  assert.equal(emailOnDomains("a@notuic.edu", ["uic.edu"]), false);
  assert.equal(emailOnDomains(null, ["uic.edu"]), false);
});

test("answers validate against the question's own rules", () => {
  const { normalizeAnswer } = fixture().load("@/lib/signup-forms-shared");
  const choice = { kind: "single_choice", label: "Role", required: true, config: { options: ["Tank"] } };
  assert.equal(normalizeAnswer(choice, "Tank").ok, true);
  assert.equal(normalizeAnswer(choice, "Healer").ok, false);
  assert.equal(normalizeAnswer(choice, "").ok, false);
  const multi = { kind: "multi_choice", label: "Days", required: false, config: { options: ["Mon", "Tue"] } };
  assert.deepEqual([...normalizeAnswer(multi, ["Tue", "Mon"]).value], ["Mon", "Tue"]);
  assert.equal(normalizeAnswer(multi, ["Sun"]).ok, false);
  assert.equal(normalizeAnswer(multi, []).value, null);
  const box = { kind: "checkbox", label: "Rules", required: true, config: {} };
  assert.equal(normalizeAnswer(box, false).ok, false);
  assert.equal(normalizeAnswer({ kind: "short_text", label: "T", required: true, config: {} }, "x".repeat(301)).ok, false);
});

test("export columns carry only what the form asked for, in a fixed order", () => {
  const { exportColumns } = fixture().load("@/lib/signup-forms-shared");
  const items = [
    { id: "q", kind: "short_text", position: 1, label: "Team", required: true, config: {} },
    { id: "f", kind: "faceit", position: 0, label: null, required: false, config: {} },
    { id: "e", kind: "account_email", position: 0, label: null, required: true, config: {} },
  ];
  assert.deepEqual(
    plain(exportColumns(items).map((c) => c.header)),
    ["Name", "Submitted", "Last Updated", "Email", "FACEIT", "FACEIT ID", "Team"],
  );
});

test("submit refuses unmet requirements and bad answers, writing nothing", async () => {
  const f = fixture();
  const formId = f.form();
  const { submitSignup } = f.load("@/app/f/[id]/actions");

  f.reg = { ...f.reg, schoolEmail: "p@uchicago.edu" };
  const wrongSchool = await submitSignup(formId, answers);
  assert.equal(wrongSchool.ok, false);
  assert.deepEqual([...wrongSchool.blocking], ["Academic Verification"]);

  f.reg = { ...f.reg, schoolEmail: "p@cs.uic.edu" };
  f.inGuild = false;
  assert.deepEqual([...(await submitSignup(formId, answers)).blocking], ["Discord Server Member"]);

  f.inGuild = true;
  assert.equal((await submitSignup(formId, { ...answers, role: "Healer" })).ok, false);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM signup_responses").get().n, 0);
});

test("an optional requirement never blocks and stores met = false", async () => {
  const f = fixture();
  const formId = f.form({ serverRequired: false });
  f.inGuild = false;
  const { submitSignup } = f.load("@/app/f/[id]/actions");
  assert.equal((await submitSignup(formId, answers)).ok, true);
  assert.deepEqual(f.values().server, { value: null, met: 0 });
});

test("submit snapshots evidence; a re-submit replaces it in one row", async () => {
  const f = fixture();
  const formId = f.form();
  const { submitSignup, withdrawSignup } = f.load("@/app/f/[id]/actions");

  assert.deepEqual(plain(await submitSignup(formId, answers)), { ok: true });
  let values = f.values();
  assert.deepEqual(values.academic.value, { school: "UIC", memberType: "University student", emailDomain: "cs.uic.edu" });
  assert.deepEqual(values.discord.value, { handle: "playerone", id: "111" });
  assert.equal(values.role.value, "Support");

  f.identities = [{ provider: "discord", handle: "renamed", externalId: "111" }];
  assert.deepEqual(plain(await submitSignup(formId, { ...answers, role: "Tank" })), { ok: true });
  values = f.values();
  assert.equal(values.role.value, "Tank");
  assert.equal(values.discord.value.handle, "renamed");
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM signup_responses").get().n, 1);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM signup_response_values").get().n, 6);

  const { listResponsesForExport } = f.load("@/lib/signup-forms");
  assert.equal((await listResponsesForExport(formId)).length, 1);
  await withdrawSignup(formId);
  assert.equal((await listResponsesForExport(formId)).length, 0);
});

test("closed, past-deadline and draft forms take no submissions", async () => {
  for (const opts of [{ status: "closed" }, { status: "draft" }, { closesAt: Date.now() - 1000 }]) {
    const f = fixture();
    const formId = f.form(opts);
    const { submitSignup } = f.load("@/app/f/[id]/actions");
    const result = await submitSignup(formId, answers);
    assert.equal(result.ok, false, JSON.stringify(opts));
  }
});
