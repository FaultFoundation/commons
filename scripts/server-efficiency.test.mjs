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
      exports, require: load, Date, crypto, AbortSignal, Response, URL, Headers,
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

test('public schedule cache reuses fresh data and refreshes expired data', async () => {
  const f = fixture();
  try {
    const { cachedPublicSchedule } = f.load('@/lib/public-schedule-cache');
    let builds = 0;
    const build = async () => [{ id: 'public:match', status: 'scheduled', title: `Revision ${++builds}` }];
    assert.equal((await cachedPublicSchedule(build))[0].title, 'Revision 1');
    assert.equal((await cachedPublicSchedule(build))[0].title, 'Revision 1');
    assert.equal(builds, 1);
    f.sqlite.exec("UPDATE tournament_list_cache SET built_at = 0");
    assert.equal((await cachedPublicSchedule(build))[0].title, 'Revision 2');
    assert.equal(builds, 2);
  } finally { f.sqlite.close(); }
});

test('concurrent stale schedule reads elect one builder and a failure preserves the snapshot', async () => {
  const f = fixture();
  try {
    const { cachedPublicSchedule } = f.load('@/lib/public-schedule-cache');
    await cachedPublicSchedule(async () => [{ id: 'public:match', status: 'scheduled', title: 'Known good' }]);
    f.sqlite.exec("UPDATE tournament_list_cache SET built_at = 0");
    let builds = 0;
    const results = await Promise.all(Array.from({ length: 8 }, () => cachedPublicSchedule(async () => {
      builds++;
      throw new Error('CEN overloaded');
    })));
    assert.equal(builds, 1);
    assert.ok(results.every(entries => entries[0].title === 'Known good'));
    const row = f.sqlite.prepare("SELECT payload, built_at FROM tournament_list_cache WHERE id = 'public-schedule-v1'").get();
    assert.equal(JSON.parse(row.payload)[0].title, 'Known good');
    assert.equal(row.built_at, 0, 'failure does not mark stale data fresh');
  } finally { f.sqlite.close(); }
});

test('schedule cache recovers from malformed data and tolerates a missing cache table', async () => {
  const f = fixture();
  try {
    const { cachedPublicSchedule } = f.load('@/lib/public-schedule-cache');
    f.sqlite.exec("INSERT INTO tournament_list_cache (id,payload,built_at) VALUES ('public-schedule-v1','broken',0)");
    assert.equal((await cachedPublicSchedule(async () => [{ id: 'public:new', status: 'live' }]))[0].status, 'live');
    f.sqlite.exec('DROP TABLE tournament_list_cache');
    assert.equal((await cachedPublicSchedule(async () => [{ id: 'public:new', status: 'finished' }]))[0].status, 'finished');
  } finally { f.sqlite.close(); }
});

test('tournament transport preserves all values and discovery behavior with fewer bytes', () => {
  const f = fixture();
  try {
    const { packTournamentEntries, unpackTournamentEntries } = f.load('@/lib/tournament-wire');
    const { matchesDiscovery, discoveryScore, EMPTY_FILTERS } = f.load('@/lib/discovery-shared');
    const entries = Array.from({ length: 2446 }, (_, i) => ({
      id: `startgg:${i}`, name: `College Tournament ${i}`, format: '', status: 'registration',
      entrantCount: i, maxParticipants: null, startsAt: 1900000000000, bannerUrl: null,
      featured: false, game: 'Overwatch', gameLogoUrl: null, organizer: 'College League',
      organizerUrl: null, prizePool: null, registrationClosesAt: null,
      discovery: { audience: 'collegiate', venue: 'online', competition: 'league',
        organizationId: null, seriesId: null, featured: false, reviewed: false, reasons: ['College wording'] },
    }));
    entries.push({ ...entries[0], discovery: undefined, name: 'Unicode 🎮 <script> & "quotes"' });
    const packed = JSON.parse(JSON.stringify(packTournamentEntries(entries)));
    const decoded = unpackTournamentEntries(packed);
    assert.deepEqual(JSON.parse(JSON.stringify(decoded)), JSON.parse(JSON.stringify(entries)));
    assert.deepEqual(JSON.parse(JSON.stringify(unpackTournamentEntries(packTournamentEntries([])))), []);
    const before = Buffer.byteLength(JSON.stringify(entries));
    const after = Buffer.byteLength(JSON.stringify(packed));
    assert.ok(after < before * 0.65, `${before} -> ${after}`);
    const filters = { ...EMPTY_FILTERS, audience: 'collegiate', query: 'league' };
    assert.deepEqual(entries.map(t => matchesDiscovery(t, filters, [])), decoded.map(t => matchesDiscovery(t, filters, [])));
    assert.deepEqual(entries.map(t => discoveryScore(t)), decoded.map(t => discoveryScore(t)));
  } finally { f.sqlite.close(); }
});

test('missing session cookies redirect before protected rendering; cookie hints still require page auth', () => {
  const f = fixture();
  try {
    const { middleware } = f.load('@/middleware');
    const { NextRequest } = require('next/server');
    for (const path of ['/home/', '/tournaments/', '/tournaments/startgg%3A1/']) {
      const response = middleware(new NextRequest(`https://commons.fault.foundation${path}`));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), 'https://commons.fault.foundation/login/');
    }
    for (const name of ['better-auth.session_token', '__Secure-better-auth.session_token']) {
      assert.equal(middleware(new NextRequest('https://commons.fault.foundation/home/', {
        headers: { cookie: `${name}=test` },
      })).headers.get('x-middleware-next'), '1');
    }
    assert.equal(middleware(new NextRequest('https://commons.fault.foundation/login/')).status, 200);
  } finally { f.sqlite.close(); }
});

test('Challonge community links survive the database-to-discovery path without changing internal routing', async () => {
  const f=fixture();
  try {
    for (const [id,url] of [['a','https://campus.challonge.com/fall'],['b','https://campus.challonge.com/spring'],['c','https://other.challonge.com/fall']]) {
      f.sqlite.prepare(`INSERT INTO tournaments (id,program_id,source,external_id,external_url,name,format,status,created_at,updated_at)
        VALUES (?,'program','challonge',?,?,'Event','single_elim','completed',0,0)`).run(id,id,url);
    }
    const entries=await f.load('@/lib/tournament-entries').loadTournamentEntries();
    const a=entries.find(t=>t.id==='a'), b=entries.find(t=>t.id==='b'), c=entries.find(t=>t.id==='c');
    assert.equal(a.discovery.seriesId,'series:challonge:community:campus');
    assert.equal(a.discovery.seriesId,b.discovery.seriesId);
    assert.notEqual(a.discovery.seriesId,c.discovery.seriesId);
    assert.equal(a.source,undefined);
    assert.equal(a.externalUrl,'https://campus.challonge.com/fall');
  } finally {f.sqlite.close();}
});

test('tournament list cache rebuilds old discovery versions and reuses current snapshots', async () => {
  const f = fixture();
  try {
    const { loadTournamentEntries } = f.load('@/lib/tournament-entries');
    const { packTournamentEntries } = f.load('@/lib/tournament-wire');
    const entries = [{ id: 'public:1', name: 'Old grouping', status: 'active', startsAt: null, featured: false }];
    f.sqlite.prepare('INSERT INTO tournament_list_cache (id,payload,built_at) VALUES (?,?,?)')
      .run('default', JSON.stringify(entries), Date.now());
    for (const old of [entries, { version: 1, data: packTournamentEntries(entries) }, { version: 2, data: packTournamentEntries(entries) }]) {
      f.sqlite.prepare('UPDATE tournament_list_cache SET payload = ?, built_at = ?, lease_until = NULL WHERE id = ?')
        .run(JSON.stringify(old), Date.now(), 'default');
      assert.deepEqual(JSON.parse(JSON.stringify(await loadTournamentEntries())), []);
      const saved = JSON.parse(f.sqlite.prepare("SELECT payload FROM tournament_list_cache WHERE id = 'default'").get().payload);
      assert.equal(saved.version, 3);
    }
    f.sqlite.prepare('UPDATE tournament_list_cache SET payload = ? WHERE id = ?')
      .run(JSON.stringify({ version: 3, data: packTournamentEntries(entries) }), 'default');
    assert.deepEqual(JSON.parse(JSON.stringify(await loadTournamentEntries())), entries);
  } finally { f.sqlite.close(); }
});
