import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

// Execute production TS with controlled provider I/O. Queries still go through
// the real Drizzle D1 driver and SQLite, including compare-and-swap and JSON_SET.
function fixture({ metadata = null, fail = false, authenticated = true } = {}) {
  const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  sqlite.exec('PRAGMA foreign_keys = OFF');
  for (const file of readdirSync(resolve(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8'));
  }
  sqlite.exec("PRAGMA foreign_keys = OFF");
  sqlite.prepare(`INSERT INTO platform_identities (id,user_id,provider,external_id,metadata,created_at,updated_at)
    VALUES ('identity','member','challonge','remote',?,0,0)`).run(metadata);
  const queries = [];
  const client = {
    prepare(sql) {
      queries.push(sql);
      const stmt = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          async raw() { stmt.setReturnArrays(true); return stmt.all(...params); },
          async all() { const results = stmt.all(...params); return { results, meta: { changes: sqlite.prepare('SELECT changes() AS n').get().n } }; },
          async run() { return stmt.run(...params); },
        };
      } };
    },
    async batch(statements) { return Promise.all(statements.map(s => s.all())); },
  };
  const db = drizzle(client);
  let fetches = 0;
  const mocks = {
    react: { cache: f => f },
    '@opennextjs/cloudflare': { getCloudflareContext: () => ({ env: { CHALLONGE_API_V1_KEY: 'test' } }) },
    '@/lib/db': { getDb: () => db },
    '@/lib/session': { getSessionCached: async () => authenticated ? { user: { id: 'member' } } : null },
    '@/lib/auth': {
      challongeAuthEnabled: () => true, faceitAuthEnabled: () => false, startggAuthEnabled: () => false,
      getAuth: () => ({ api: { getAccessToken: async () => ({ accessToken: 'test' }) } }),
    },
    '@/lib/account-links': { getAccountLinksCached: async () => [{ providerId: 'challonge', accountId: 'remote', scope: 'tournaments:read' }] },
    '@/lib/platform-identities': {
      hasScope: () => true,
      getPlatformIdentitiesCached: async () => sqlite.prepare('SELECT id,provider,external_id AS externalId,metadata FROM platform_identities').all(),
    },
    '@/lib/avatars': { deleteAvatarByUrl: async () => {} },
    '@/lib/staff': {},
  };
  const modules = new Map();
  function load(id) {
    if (id in mocks) return mocks[id];
    if (!id.startsWith('@/')) return require(id);
    if (modules.has(id)) return modules.get(id);
    const path = resolve(root, id.slice(2) + '.ts');
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    modules.set(id, exports);
    runInNewContext(code, {
      exports, require: load, Date, crypto, AbortSignal, Response, URL,
      console: { ...console, error() {} },
      fetch: async () => {
        fetches++;
        if (fail) return new Response('unavailable', { status: 503 });
        return Response.json({ data: [{ id: 'remote', attributes: { name: 'Event', state: 'pending' } }] });
      },
    }, { filename: path });
    return exports;
  }
  return { sqlite, queries, load, fetches: () => fetches };
}

test('simultaneous stale schedule refreshes issue one provider fetch and preserve metadata', async () => {
  const f = fixture({ metadata: JSON.stringify({ connectReachable: true, handle: 'keep' }) });
  try {
    const { syncSchedule } = f.load('@/lib/schedule');
    const results = await Promise.all(Array.from({ length: 8 }, () => syncSchedule('member', new Headers())));
    assert.equal(f.fetches(), 1);
    assert.equal(results.filter(Boolean).length, 1);
    const metadata = JSON.parse(f.sqlite.prepare('SELECT metadata FROM platform_identities').get().metadata);
    assert.equal(metadata.handle, 'keep');
    assert.equal(metadata.connectReachable, true);
    assert.ok(metadata.scheduleSyncedAt > 0);
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM external_matches').get().n, 1);
    await syncSchedule('member', new Headers());
    assert.equal(f.fetches(), 1);
    f.sqlite.exec("UPDATE platform_identities SET metadata = '{}'");
    assert.equal(await syncSchedule('member', new Headers()), false, 'identical history is not rewritten');
    assert.equal(f.fetches(), 2);
  } finally { f.sqlite.close(); }
});

for (const metadata of [null, 'broken json', 'null', '[]']) {
  test(`failed schedule pulls back off and preserve stored matches (metadata ${metadata})`, async () => {
    const f = fixture({ metadata, fail: true });
    try {
      f.sqlite.exec(`INSERT INTO external_matches (id,user_id,provider,external_id,title,status,created_at,updated_at)
        VALUES ('old','member','challonge','old','Cached event','scheduled',0,0)`);
      const { syncSchedule } = f.load('@/lib/schedule');
      assert.equal(await syncSchedule('member', new Headers()), false);
      assert.equal(await syncSchedule('member', new Headers()), false);
      assert.equal(f.fetches(), 1);
      assert.equal(f.sqlite.prepare('SELECT title FROM external_matches').get().title, 'Cached event');
    } finally { f.sqlite.close(); }
  });
}

test('calendar and tournament reads never fetch providers, even with stale identities', async () => {
  const f = fixture();
  try {
    await f.load('@/lib/schedule').loadSchedule('member');
    await f.load('@/lib/tournaments').listTournaments();
    assert.equal(f.fetches(), 0);
    assert.equal(f.queries.some(q => /^(update|insert|delete)/i.test(q)), false);
  } finally { f.sqlite.close(); }
});

test('fresh tournament lease reads only its timestamp and id', async () => {
  const f = fixture();
  try {
    f.sqlite.prepare(`INSERT INTO tournaments (id,program_id,source,external_id,name,format,status,provider_synced_at,created_at,updated_at)
      VALUES ('100000','program','challonge','remote','Event','single_elim','registration',?,0,0)`).run(Date.now());
    assert.equal(await f.load('@/lib/tournaments').syncChallongeTournamentsIfStale(), false);
    assert.equal(f.fetches(), 0);
    assert.equal(f.queries.length, 1);
    assert.match(f.queries[0], /^select "id", "provider_synced_at"/);
    assert.match(f.queries[0], /limit/);
  } finally { f.sqlite.close(); }
});


test('failed tournament listings retain local rows and back off before retrying', async () => {
  const f = fixture({ fail: true });
  try {
    f.sqlite.exec(`INSERT INTO tournaments (id,program_id,source,external_id,name,format,status,created_at,updated_at)
      VALUES ('100000','program','challonge','remote','Event','single_elim','registration',0,0)`);
    const { syncChallongeTournamentsIfStale } = f.load('@/lib/tournaments');
    assert.equal(await syncChallongeTournamentsIfStale(), false);
    assert.equal(await syncChallongeTournamentsIfStale(), false);
    assert.equal(f.fetches(), 1);
    const row = f.sqlite.prepare('SELECT provider_synced_at AS at FROM tournaments').get();
    assert.ok(row);
    const retryIn = row.at + 86400000 - Date.now();
    assert.ok(retryIn > 290000 && retryIn <= 300000);
  } finally { f.sqlite.close(); }
});

test('refresh endpoint validates origin, authentication, body, and source selection', async () => {
  const f = fixture();
  try {
    const { POST } = f.load('@/app/api/dashboard/refresh/route');
    const request = (body, origin = 'https://commons.test') => new Request('https://commons.test/api/dashboard/refresh', {
      method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal((await POST(request({}, 'https://foreign.test'))).status, 403);
    assert.equal((await POST(request(null))).status, 400);
    assert.equal((await POST(request([]))).status, 400);
    assert.equal((await POST(request({ schedule: 'true', tournaments: false }))).status, 200);
    assert.equal(f.fetches(), 0);
    const response = await POST(request({ schedule: true, userId: 'someone-else' }));
    assert.equal((await response.json()).refreshed, true);
    assert.equal(f.sqlite.prepare('SELECT user_id FROM external_matches').get().user_id, 'member');
  } finally { f.sqlite.close(); }
  const anonymous = fixture({ authenticated: false });
  try {
    const { POST } = anonymous.load('@/app/api/dashboard/refresh/route');
    const response = await POST(new Request('https://commons.test/api/dashboard/refresh', {
      method: 'POST', headers: { origin: 'https://commons.test' }, body: '{}',
    }));
    assert.equal(response.status, 401);
    assert.equal(anonymous.fetches(), 0);
  } finally { anonymous.sqlite.close(); }
});
