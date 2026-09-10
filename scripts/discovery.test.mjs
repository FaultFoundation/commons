import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { drizzle } from "drizzle-orm/d1";
const require = createRequire(import.meta.url),
  root = resolve(import.meta.dirname, "..");
function fixture() {
  const sqlite = new DatabaseSync(":memory:", {
    enableDoubleQuotedStringLiterals: true,
  });
  for (const file of readdirSync(resolve(root, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(resolve(root, "drizzle", file), "utf8"));
  sqlite.exec(
    "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('member','Member','member@example.test',1,0,0),('other','Other','other@example.test',1,0,0)",
  );
  const client = {
    prepare(query) {
      return {
        bind(...values) {
          const execute = () => {
            if (f.failReview && query.includes("SET status=?,reviewed_by"))
              throw new Error("Injected batch failure");
            const stmt = sqlite.prepare(query);
            const results = stmt.all(...values);
            return {
              results,
              meta: {
                changes: sqlite.prepare("SELECT changes() AS n").get().n,
              },
            };
          };
          return {
            _execute: execute,
            async all() {
              return execute();
            },
            async raw() {
              const stmt = sqlite.prepare(query);
              stmt.setReturnArrays(true);
              return stmt.all(...values);
            },
            async run() {
              return execute();
            },
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
    entries: [],
    actor: "member",
    staff: true,
    db: drizzle(client),
  };
  const mocks = {
    react: { cache: (f) => f },
    "@/lib/db": { getDb: () => f.db },
    "@opennextjs/cloudflare": {
      getCloudflareContext: () => ({ env: { DB: client } }),
    },
    "@/lib/session": {
      getSessionCached: async () =>
        f.actor ? { user: { id: f.actor } } : null,
    },
    "@/lib/admin-api": {
      requireStaffApi: async () =>
        f.staff
          ? { ok: true, userId: f.actor }
          : {
              ok: false,
              response: Response.json({ error: "Forbidden" }, { status: 403 }),
            },
    },
    "@/lib/tournament-entries": {
      loadTournamentEntries: async () =>
        f.load("@/lib/discovery").enrichDiscovery(f.entries),
    },
  };
  const modules = new Map();
  f.load = (id) => {
    if (id in mocks) return mocks[id];
    if (!id.startsWith("@/")) return require(id);
    if (modules.has(id)) return modules.get(id);
    const path = resolve(root, id.slice(2) + ".ts");
    const code = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const exports = {};
    modules.set(id, exports);
    runInNewContext(code, {
      exports,
      require: f.load,
      console,
      Date,
      URL,
      Request,
      Response,
      Map,
      Set,
      JSON,
      crypto: globalThis.crypto,
    });
    return exports;
  };
  f.post = async (body) =>
    f
      .load("@/app/api/tournaments/discovery/route")
      .POST(
        new Request("https://commons.test/api/tournaments/discovery/", {
          method: "POST",
          headers: { origin: "https://commons.test" },
          body: JSON.stringify(body),
        }),
      );
  f.entry = (id, name, extra = {}) => ({
    id,
    name,
    game: "Rocket League",
    startsAt: Date.now() + 86400000,
    endsAt: null,
    status: "registration",
    featured: false,
    format: "",
    entrantCount: 4,
    maxParticipants: null,
    bannerUrl: null,
    source: "startgg",
    organizer: "Example Esports",
    organizerUrl: "https://www.start.gg/user/example",
    ...extra,
  });
  return f;
}
const facts = {
  audience: "collegiate",
  venue: "online",
  competition: "league",
  organizationId: null,
  seriesId: null,
  featured: false,
};
test("parent adapters scope identities by provider and reject lookalike or generic URLs", async () => {
  const f = fixture();
  const parent = f.load("@/lib/discovery-shared").providerParentSeries;
  const cases = [
    ["startgg", "https://www.start.gg/user/abc", "series:startgg:owner:abc"],
    ["startgg", "https://start.gg/user/abc/?tab=events", "series:startgg:owner:abc"],
    ["faceit", "https://www.faceit.com/en/organizers/abc", "series:faceit:organizer:abc"],
    ["faceit", "https://faceit.com/fr/organizers/abc/DisplayName", "series:faceit:organizer:abc"],
    ["faceit", "https://faceit.com/en/organizers/faceit", null],
    ["startgg", "https://evil.test/user/abc", null],
    ["startgg", "https://start.gg.evil.test/user/abc", null],
    ["startgg", "https://www.start.gg/tournament/abc", null],
    ["faceit", "https://start.gg/user/abc", null],
    ["faceit", "https://user:pass@faceit.com/organizers/abc", null],
  ];
  for (const [source, organizerUrl, expected] of cases) {
    assert.equal(parent(f.entry("x", "Event", { source, organizerUrl }))?.id ?? null, expected);
  }
  for (const source of [undefined, "challonge"]) {
    assert.equal(parent(f.entry("x", "Event", {source,externalUrl:"https://necc.challonge.com/event"})).id,"series:challonge:community:necc");
    for (const externalUrl of ["https://challonge.com/event", "https://www.challonge.com/event", "https://api.challonge.com/event", "https://necc.challonge.com.evil.test/event"]) {
      assert.equal(parent(f.entry("x", "Event", {source,externalUrl})),null);
    }
  }
  const entries = await f.load("@/lib/discovery").enrichDiscovery([
    f.entry("a", "Fall 2024", {sourceTournamentId:"123"}),
    f.entry("b", "Other game", {sourceTournamentId:"123",organizerUrl:null}),
    f.entry("c", "Another event", {sourceTournamentId:"456"}),
    f.entry("d", "Same name", {source:"faceit",organizerUrl:"https://faceit.com/en/organizers/example"}),
  ]);
  assert.equal(entries[0].discovery.seriesId, entries[1].discovery.seriesId);
  assert.equal(entries[0].discovery.seriesId, entries[2].discovery.seriesId);
  assert.notEqual(entries[0].discovery.seriesId, entries[3].discovery.seriesId);
});
test("audit all stored start.gg and FACEIT parents without inventing missing identities", async () => {
  const f=fixture();
  const rows=JSON.parse(readFileSync(resolve(root,"scripts/fixtures/provider-parents-3610.json"),"utf8"));
  const parent=f.load("@/lib/discovery-shared").providerParentSeries;
  const result=await f.load("@/lib/discovery").enrichDiscovery(rows);
  assert.equal(result.length,3610);
  for (const [source,expectedRows,expectedParents] of [["startgg",1188,610],["faceit",252,125]]) {
    const direct=rows.filter(t=>t.source===source && parent(t));
    assert.equal(direct.length,expectedRows);
    assert.equal(new Set(direct.map(t=>parent(t).id)).size,expectedParents);
    for(const t of result.filter(t=>t.source===source && parent(t))) {
      assert.equal(t.discovery.seriesId,parent(t).id,t.name);
    }
    const grouped=result.filter(t=>t.source===source && t.discovery.seriesId?.startsWith(`series:${source}:`));
    console.log(`${source}: ${grouped.length} rows in provider parent groups`);
  }
  const catalog=await f.load("@/lib/discovery").discoveryCatalog(result);
  for(const t of result) if(t.discovery.seriesId) assert.ok(catalog.some(p=>p.id===t.discovery.seriesId));
});
test("all 1,100 imported LeagueOS tournaments reach the correct parent profile", async () => {
  const f = fixture();
  const rows = JSON.parse(readFileSync(resolve(root, "scripts/fixtures/leagueos-series-1100.json"), "utf8"));
  const entries = await f.load("@/lib/discovery").enrichDiscovery(rows);
  const groups = new Map();
  for (const entry of entries) {
    const parent = entry.sourceTournamentId.split(":")[0];
    assert.equal(entry.discovery.seriesId, `series:leagueos:${parent}`, entry.name);
    const members = groups.get(parent) ?? [];
    members.push(entry);
    groups.set(parent, members);
  }
  assert.equal(entries.length, 1100);
  assert.equal(groups.size, 58);
  const multiGame = [...groups.values()].filter(g => new Set(g.map(t => t.game)).size > 1);
  assert.equal(multiGame.length, 38);
  assert.equal(multiGame.reduce((n, g) => n + g.length, 0), 1048);
  const catalog = await f.load("@/lib/discovery").discoveryCatalog(entries);
  assert.equal(catalog.filter(p => p.kind === "series").length, 58);
  // The profile page uses precisely this seriesId membership filter.
  for (const [parent, members] of groups) {
    assert.equal(entries.filter(t => t.discovery.seriesId === `series:leagueos:${parent}`).length, members.length);
  }
  // Import order must not affect identity, including completed historical rows.
  const reversed = await f.load("@/lib/discovery").enrichDiscovery([...rows].reverse());
  assert.deepEqual(reversed.map(t => t.discovery.seriesId).reverse(), entries.map(t => t.discovery.seriesId));
});
test("LeagueOS parent membership survives titles, games and season changes", async () => {
  const f = fixture();
  const entry = (id, name, extra = {}) => f.entry(id, name, {
    source: "leagueos", sourceTournamentId: `necc:${id}`,
    organizer: "NECC", organizerUrl: "https://necc.leagueos.gg",
    game: "Overwatch", ...extra,
  });
  const entries = [
    entry("ow1", "Spring 2026 - OW | Division I"),
    entry("ow2", "Spring 2026 - OW | Division II"),
    entry("val", "Spring 2026 - VAL | Signups", { game: "VALORANT" }),
    entry("rl", "Spring 2026 - RL | Nationals", { game: "Rocket League" }),
    entry("fall", "Fall 2026 - OW | Division I"),
    entry("old", "Spring 2025 - OW | Division I"),
    entry("other", "Spring 2026 - OW | Division I", { sourceTournamentId: "other:event" }),
    entry("cup", "Spring 2026 - OW | Invitational"),
    entry("undated", "Overwatch | Signups"),
    entry("missing", "Spring 2026 - OW | Division I", { sourceTournamentId: null }),
    entry("wronggame", "Spring 2026 - VAL | Division I"),
  ];
  const result = await f.load("@/lib/discovery").enrichDiscovery(entries);
  for (const t of result.filter((_, i) => ![6, 9].includes(i))) {
    assert.equal(t.discovery.seriesId, "series:leagueos:necc");
    assert.equal(t.discovery.seriesName, "NECC");
  }
  for (const t of [result[6], result[9]]) assert.notEqual(t.discovery.seriesId, result[0].discovery.seriesId);
  const catalog = await f.load("@/lib/discovery").discoveryCatalog(result);
  assert.equal(catalog.find(p => p.id === result[0].discovery.seriesId).name, "NECC");
  f.entries = entries;
  await f.post({ action: "correction", targetId: "ow1", data: facts, evidence: "Keep this event separate." });
  const row = f.sqlite.prepare("SELECT * FROM discovery_submissions").get();
  assert.equal((await f.post({ action: "review", id: row.id, decision: "approve" })).status, 200);
  const corrected = (await f.load("@/lib/discovery").enrichDiscovery(entries))[0];
  assert.equal(corrected.discovery.seriesId, null);
  assert.equal(corrected.discovery.reviewed, true);
});
test("unknown metadata stays unknown; logos, counts and country do not imply eligibility or venue", () => {
  const f = fixture(),
    s = f.load("@/lib/discovery-shared");
  const d = s.inferFacts(
    f.entry("a", "Open Cup", {
      country: "US",
      city: "Denver",
      entrantCount: 10000,
    }),
  );
  assert.equal(d.audience, "unknown");
  assert.equal(d.venue, "unknown");
  assert.equal(s.inferFacts(f.entry("location", "Open Cup", { description: "Location: TBD" })).venue, "unknown");
  assert.equal(
    s.inferFacts(
      f.entry("b", "Campus Cup", { academicVerificationRequired: true }),
    ).audience,
    "collegiate",
  );
  assert.equal(s.safeWebsite("javascript:alert(1)"), null);
});
test("collegiate competition aliases and eligibility evidence distinguish ambiguous and public events", () => {
  const f = fixture(), s = f.load("@/lib/discovery-shared");
  const cases = [
    ["NACE Starleague Fall 2026", {}, "collegiate"],
    ["necc Division VII Nationals", {}, "collegiate"],
    ["CRL Open Qualifier", {}, "collegiate"],
    ["CRL Finals", { game: "Valorant" }, "unknown"],
    ["CRL Finals", { game: null }, "unknown"],
    ["CRL Rocket League Finals", { game: null }, "collegiate"],
    ["MENACE Cup", {}, "unknown"],
    ["NECCS Cup", {}, "unknown"],
    ["ＮＡＣＥ Finals", {}, "collegiate"],
    ["Campus Cup", { description: "Only enrolled university students may compete." }, "collegiate"],
    ["Campus Cup", { description: "Eligibility: college teams" }, "collegiate"],
    ["Community Cup", { description: "Our sponsor is a university. Meet our NECC alumni." }, "unknown"],
    ["Community Cup", { organizer: "NACE" }, "unknown"],
    ["University of Example Weekly", { description: "Open to everyone" }, "open"],
    ["Varsity High School Finals", {}, "unknown"],
    ["Student-only Cup", {}, "unknown"],
    ["NECC High School Invitational", {}, "unknown"],
    ["NECC Community Cup", { description: "Non-students are welcome" }, "unknown"],
    ["Collegiate Invitational", { description: "Open to the public" }, "unknown"],
    ["Non-collegiate Championship", {}, "unknown"],
    ["Community Cup", { description: "This is not a collegiate tournament." }, "unknown"],
    ["Community Cup", { description: "Not restricted to college students." }, "unknown"],
    ["Open Qualifier", {}, "unknown"],
    ["College League", {}, "collegiate"],
  ];
  for (const [name, extra, expected] of cases) {
    const entry = f.entry("example", name, extra);
    const result = s.inferFacts(entry);
    assert.equal(result.audience, expected, `${name}: ${JSON.stringify(extra)}`);
    assert.equal(s.matchesDiscovery({ ...entry, discovery: result },
      { ...s.EMPTY_FILTERS, audience: "collegiate" }, [], Date.now()), expected === "collegiate");
    if (expected !== "unknown") assert.ok(result.reasons.length);
  }
});
test("staff audience correction overrides an acronym suggestion after source refresh", async () => {
  const f = fixture();
  f.entries = [f.entry("alias", "NECC Community Cup")];
  assert.equal((await f.load("@/lib/discovery").enrichDiscovery(f.entries))[0].discovery.audience, "collegiate");
  await f.post({ action: "correction", targetId: "alias", data: { ...facts, audience: "open" }, evidence: "Organizer confirms public community event." });
  const row = f.sqlite.prepare("SELECT * FROM discovery_submissions").get();
  assert.equal((await f.post({ action: "review", id: row.id, decision: "approve" })).status, 200);
  f.entries[0].name = "NECC Community Cup - refreshed";
  const result = (await f.load("@/lib/discovery").enrichDiscovery(f.entries))[0].discovery;
  assert.equal(result.audience, "open");
  assert.equal(result.reviewed, true);
});
test("start.gg owner grouping spans seasons and divisions but keeps distinct accounts separate", async () => {
  const f = fixture();
  f.entries = [
    f.entry("1", "AEL Season 2 Challenger - Week 1"),
    f.entry("2", "AEL Season 2 Challenger - Week 2"),
    f.entry("3", "AEL Season 3 Challenger - Week 1"),
    f.entry("4", "AEL Season 2 Premier - Week 1"),
    f.entry("5", "AEL Season 2 Challenger - Week 1", {
      organizerUrl: "https://www.start.gg/user/different",
    }),
    f.entry("6", "AEL Season 2 Challenger - Week 1", { organizerUrl: null }),
  ];
  const e = await f.load("@/lib/discovery").enrichDiscovery(f.entries);
  assert.equal(e[0].discovery.seriesId, e[1].discovery.seriesId);
  for (const i of [2, 3]) assert.equal(e[0].discovery.seriesId, e[i].discovery.seriesId);
  for (const i of [4, 5])
    assert.notEqual(e[0].discovery.seriesId, e[i].discovery.seriesId);
  assert.equal(e[5].discovery.organizationId, null);
});
test("start.gg uses owner parents and shared tournament IDs when owner metadata is absent", async () => {
  const f = fixture();
  f.entries = [
    // 2026 AEL: two games projected as sibling rows of ONE start.gg tournament.
    f.entry("startgg:949634:g14", "2026 AEL University Open Series - Season 2", {
      sourceTournamentId: "949634",
      game: "Rocket League",
    }),
    f.entry("startgg:949634:g34223", "2026 AEL University Open Series - Season 2", {
      sourceTournamentId: "949634",
      game: "VALORANT",
    }),
    // 2025 AEL: two games, but NO organizer at all — organizer/name inference
    // cannot group these, so ONLY the shared source-tournament id can.
    f.entry("startgg:806959:g14", "2025 AEL University Open Series - Season 2", {
      sourceTournamentId: "806959",
      game: "Rocket League",
      organizer: null,
      organizerUrl: null,
    }),
    f.entry("startgg:806959:g34223", "2025 AEL University Open Series - Season 2", {
      sourceTournamentId: "806959",
      game: "VALORANT",
      organizer: null,
      organizerUrl: null,
    }),
    // A single-game tournament (one row) is a plain card, not a series.
    f.entry("startgg:111:g14", "Solo Cup", {
      sourceTournamentId: "111",
      organizerUrl: null,
      game: "Rocket League",
    }),
  ];
  const e = await f.load("@/lib/discovery").enrichDiscovery(f.entries);
  // Known owner groups its events across games and seasons.
  assert.equal(e[0].discovery.seriesId, e[1].discovery.seriesId);
  assert.equal(e[0].discovery.seriesId, "series:startgg:owner:example");
  assert.equal(
    e[0].discovery.seriesName,
    "Example Esports",
  );
  // 2025's two games group even with no organizer (shared tournament id alone).
  assert.equal(e[2].discovery.seriesId, e[3].discovery.seriesId);
  assert.equal(e[2].discovery.seriesId, "series:multigame:startgg:806959");
  // Missing owner cannot connect this older tournament to the account.
  assert.notEqual(e[0].discovery.seriesId, e[2].discovery.seriesId);
  // The lone single-game tournament is never a multi-game series.
  assert.equal(e[4].discovery.seriesId ?? null, null);
});
test("filters combine dimensions and include ongoing leagues in date window", () => {
  const f = fixture(),
    s = f.load("@/lib/discovery-shared"),
    now = Date.now();
  const t = {
    ...f.entry("1", "College League", {
      startsAt: now - 86400000,
      endsAt: now + 86400000,
    }),
    discovery: { ...facts, organizationId: "org", seriesId: "series" },
    registrationClosesAt: now + 3600000,
  };
  const filter = {
    ...s.EMPTY_FILTERS,
    audience: "collegiate",
    venue: "online",
    competition: "series",
    days: "7",
    registration: "closing",
    following: true,
  };
  assert.equal(s.matchesDiscovery(t, filter, ["org"], now), true);
  assert.equal(s.matchesDiscovery(t, filter, [], now), false);
  assert.equal(
    s.matchesDiscovery(
      { ...t, registrationClosesAt: null },
      filter,
      ["org"],
      now,
    ),
    false,
  );
  assert.equal(
    s.matchesDiscovery(t, { ...filter, venue: "in-person" }, ["org"], now),
    false,
  );
});
test("member cannot self-feature or approve a correction; origin and session gates are enforced", async () => {
  const f = fixture();
  f.entries = [f.entry("1", "College League")];
  f.staff = false;
  assert.equal(
    (
      await f.post({
        action: "correction",
        targetId: "1",
        data: { ...facts, featured: true },
        evidence: "Official college eligibility rules.",
      })
    ).status,
    200,
  );
  const row = f.sqlite.prepare("SELECT * FROM discovery_submissions").get();
  assert.equal(JSON.parse(row.data).featured, false);
  assert.equal(
    (await f.post({ action: "review", id: row.id, decision: "approve" }))
      .status,
    403,
  );
  const route = f.load("@/app/api/tournaments/discovery/route");
  assert.equal(
    (
      await route.POST(
        new Request("https://commons.test/api/tournaments/discovery/", {
          method: "POST",
          headers: { origin: "https://evil.test" },
          body: "{}",
        }),
      )
    ).status,
    403,
  );
  f.actor = null;
  assert.equal(
    (await f.post({ action: "follow", targetId: "x", follow: true })).status,
    401,
  );
});
test("approved correction survives refresh, records history, and undo restores prior revisions in order", async () => {
  const f = fixture();
  f.entries = [f.entry("1", "Community Cup")];
  async function correction(data) {
    assert.equal(
      (
        await f.post({
          action: "correction",
          targetId: "1",
          data,
          evidence: "Official event rules confirm this.",
        })
      ).status,
      200,
    );
    return f.sqlite
      .prepare("SELECT id FROM discovery_submissions WHERE status='pending'")
      .get().id;
  }
  const first = await correction(facts);
  assert.equal(
    (
      await f.post({
        action: "review",
        id: first,
        decision: "approve",
        data: facts,
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.load("@/lib/discovery").enrichDiscovery(f.entries))[0].discovery
      .audience,
    "collegiate",
  );
  const second = await correction({ ...facts, venue: "in-person" });
  assert.equal(
    (await f.post({ action: "review", id: second, decision: "approve" }))
      .status,
    200,
  );
  assert.equal((await f.post({ action: "undo", id: first })).status, 409);
  assert.equal((await f.post({ action: "undo", id: second })).status, 200);
  assert.equal(
    JSON.parse(
      f.sqlite.prepare("SELECT data FROM discovery_overrides").get().data,
    ).venue,
    "online",
  );
  assert.equal((await f.post({ action: "undo", id: first })).status, 200);
  assert.equal(
    f.sqlite.prepare("SELECT count(*) AS n FROM discovery_overrides").get().n,
    0,
  );
  assert.equal((await f.post({ action: "undo", id: first })).status, 409);
});
test("identity corrections learn future attribution and preserve older tournaments; undo removes rule", async () => {
  const f = fixture();
  f.entries = [
    f.entry("past", "Community Cup", { startsAt: Date.now() - 86400000 }),
    f.entry("future", "Community Cup"),
  ];
  await f.post({
    action: "create-profile",
    kind: "organization",
    name: "New Organization",
  });
  const org = f.sqlite.prepare("SELECT id FROM discovery_profiles").get().id;
  await f.post({
    action: "correction",
    targetId: "future",
    data: { ...facts, organizationId: org },
    evidence: "This source account now belongs to our organization.",
  });
  const id = f.sqlite.prepare("SELECT id FROM discovery_submissions").get().id;
  assert.equal(
    (
      await f.post({
        action: "review",
        id,
        decision: "approve",
        applyIdentity: true,
      })
    ).status,
    200,
  );
  f.entries.push(f.entry("next", "Future Event"));
  const rows = await f.load("@/lib/discovery").enrichDiscovery(f.entries);
  assert.notEqual(rows[0].discovery.organizationId, org);
  assert.equal(rows[2].discovery.organizationId, org);
  assert.equal((await f.post({ action: "undo", id })).status, 200);
  assert.equal(
    f.sqlite.prepare("SELECT count(*) AS n FROM discovery_identities").get().n,
    0,
  );
});
test("claim approval grants only profile editing; competing claim cannot acquire or report ownership", async () => {
  const f = fixture();
  f.entries = [f.entry("1", "College League")];
  const profiles = await f
    .load("@/lib/discovery")
    .discoveryCatalog(
      await f.load("@/lib/discovery").enrichDiscovery(f.entries),
    );
  const org = profiles.find((p) => p.kind === "organization").id;
  await f.post({
    action: "claim",
    targetId: org,
    evidence: "Verified source account and organization website.",
  });
  const first = f.sqlite
    .prepare("SELECT id FROM discovery_submissions")
    .get().id;
  f.actor = "other";
  await f.post({
    action: "claim",
    targetId: org,
    evidence: "Alternative claim submitted before the first review.",
  });
  const second = f.sqlite
    .prepare("SELECT id FROM discovery_submissions WHERE user_id='other'")
    .get().id;
  f.actor = "member";
  assert.equal(
    (await f.post({ action: "review", id: first, decision: "approve" })).status,
    200,
  );
  assert.notEqual(
    (await f.post({ action: "review", id: second, decision: "approve" }))
      .status,
    200,
  );
  f.actor = "other";
  assert.equal(
    (
      await f.post({
        action: "edit-profile",
        targetId: org,
        name: "Hijacked",
        description: "",
        website: "",
      })
    ).status,
    403,
  );
  f.actor = "member";
  assert.equal(
    (
      await f.post({
        action: "edit-profile",
        targetId: org,
        name: "Verified Org",
        description: "New profile description",
        website: "https://example.test",
      })
    ).status,
    200,
  );
  assert.equal((await f.post({ action: "undo", id: first })).status, 200);
  assert.equal(
    (
      await f.post({
        action: "edit-profile",
        targetId: org,
        name: "No longer owner",
        description: "",
        website: "",
      })
    ).status,
    403,
  );
});
test("follows are idempotent, per member, and preserve an inferred profile URL", async () => {
  const f = fixture();
  f.entries = [f.entry("1", "Season 1")];
  const profiles = await f
    .load("@/lib/discovery")
    .discoveryCatalog(
      await f.load("@/lib/discovery").enrichDiscovery(f.entries),
    );
  const target = profiles.find((p) => p.kind === "series").id;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await f.post({ action: "follow", targetId: target, follow: true }))
        .status,
      200,
    );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) AS n FROM discovery_follows").get().n,
    1,
  );
  f.entries = [];
  assert.equal(
    (await f.load("@/lib/discovery").discoveryCatalog([]))[0].id,
    target,
  );
  f.actor = "other";
  assert.deepEqual(
    await f.load("@/lib/discovery").discoveryFollowIds("other"),
    [],
  );
  await f.post({ action: "follow", targetId: target, follow: false });
  assert.equal(
    f.sqlite.prepare("SELECT count(*) AS n FROM discovery_follows").get().n,
    1,
  );
  f.actor = "member";
  assert.equal(
    (await f.post({ action: "follow", targetId: target, follow: false }))
      .status,
    200,
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) AS n FROM discovery_follows").get().n,
    0,
  );
});
test("stale concurrent claim reviews yield exactly one owner and one approved submission", async () => {
  const f = fixture();
  f.entries = [f.entry("1", "League")];
  const catalog = await f
    .load("@/lib/discovery")
    .discoveryCatalog(
      await f.load("@/lib/discovery").enrichDiscovery(f.entries),
    );
  const org = catalog.find((p) => p.kind === "organization").id;
  await f.post({
    action: "claim",
    targetId: org,
    evidence: "First organization ownership evidence.",
  });
  f.actor = "other";
  await f.post({
    action: "claim",
    targetId: org,
    evidence: "Second organization ownership evidence.",
  });
  const schema = f.load("@/db/schema");
  const rows = await f.db.select().from(schema.discoverySubmissions);
  const helper = f.load("@/lib/discovery-review");
  const results = await Promise.all(
    rows.map((row) =>
      helper.reviewDiscovery({
        row,
        decision: "approve",
        data: {},
        applyIdentity: false,
        actor: "member",
        entries: f.entries,
        profiles: catalog,
      }),
    ),
  );
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    f.sqlite
      .prepare(
        "SELECT count(*) AS n FROM discovery_submissions WHERE status='approved'",
      )
      .get().n,
    1,
  );
});
test("a failed approval batch rolls back profile, override, identity and review state together", async () => {
  const f = fixture();
  f.entries = [f.entry("1", "League")];
  await f.post({
    action: "correction",
    targetId: "1",
    data: facts,
    evidence: "A correction requiring an atomic update.",
  });
  const id = f.sqlite.prepare("SELECT id FROM discovery_submissions").get().id;
  f.failReview = true;
  assert.notEqual(
    (await f.post({ action: "review", id, decision: "approve" })).status,
    200,
  );
  assert.equal(
    f.sqlite.prepare("SELECT status FROM discovery_submissions").get().status,
    "pending",
  );
  assert.equal(
    f.sqlite.prepare("SELECT count(*) AS n FROM discovery_overrides").get().n,
    0,
  );
});
