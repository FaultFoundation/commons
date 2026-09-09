import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { drizzle } from 'drizzle-orm/d1';

// The one place the offered formats are listed; the loop below stays in step
// with it, so adding a format is still a one-line change.
const SCOUT_GAME_MODES = ['1v1', '3v3', '5v5', '6v6'];

// Scouting reads the faceit_* cache the ow-data Worker writes. The regression
// this guards: an Overwatch FACEIT match is a Bo3/Bo5 SERIES, so "win rate by
// map" is an aggregate over the maps INSIDE a match (faceit_match_rounds), not
// over faceit_matches.map_name — which only ever holds the series' first veto
// pick. Reading the match column produced a chart of mostly Control maps, a
// map split in two whenever a veto shipped no mode tag, and totals that
// disagreed with the player's own FACEIT profile.
//
// The DDL is inline rather than replayed from a migration folder because the
// Commons deliberately owns no migrations for these tables (db/faceit-schema.ts
// is a typing mirror; the ow-data repo owns the schema). Queries still run
// through the real Drizzle D1 driver against real SQLite.

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');

const DDL = `
CREATE TABLE faceit_players (
  player_id TEXT PRIMARY KEY, nickname TEXT NOT NULL, avatar_url TEXT, country TEXT,
  game TEXT NOT NULL DEFAULT 'ow2', game_player_id TEXT, game_player_name TEXT,
  skill_level INTEGER, faceit_elo INTEGER, region TEXT, faceit_url TEXT,
  verified INTEGER, activated_at INTEGER, search_mode TEXT, poll_chunk INTEGER,
  list_offset INTEGER NOT NULL DEFAULT 0, list_done INTEGER NOT NULL DEFAULT 0,
  detail_done INTEGER NOT NULL DEFAULT 0, status TEXT, status_detail TEXT,
  match_count INTEGER NOT NULL DEFAULT 0, first_searched_at INTEGER,
  last_searched_at INTEGER, last_synced_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE faceit_matches (
  match_id TEXT PRIMARY KEY, game TEXT, region TEXT, competition_id TEXT,
  competition_name TEXT, competition_type TEXT, organizer_id TEXT, game_mode TEXT,
  match_type TEXT, best_of INTEGER, round INTEGER, group_num INTEGER,
  status TEXT NOT NULL DEFAULT 'finished', winner_faction TEXT, factions_json TEXT,
  location_id TEXT, server_name TEXT, map_id TEXT, map_name TEXT, map_mode TEXT,
  hero_bans_json TEXT, voting_json TEXT, voting_synced_at INTEGER, replay_codes_json TEXT, attacking_first TEXT,
  configured_at INTEGER, started_at INTEGER, finished_at INTEGER, faceit_url TEXT,
  detail_synced_at INTEGER, stats_synced_at INTEGER, rounds_synced_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE faceit_match_players (
  id TEXT PRIMARY KEY, match_id TEXT NOT NULL, player_id TEXT NOT NULL, nickname TEXT,
  avatar_url TEXT, faction TEXT, team_id TEXT, game_player_id TEXT,
  game_player_name TEXT, game_skill_level INTEGER, membership TEXT, result TEXT,
  role TEXT, eliminations INTEGER, deaths INTEGER, assists INTEGER, kd_ratio REAL,
  damage_dealt INTEGER, healing_done INTEGER, damage_mitigated INTEGER,
  final_blows INTEGER, solo_kills INTEGER, objective_time INTEGER, time_played INTEGER,
  stats_json TEXT, stats_synced_at INTEGER, created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL);
CREATE TABLE faceit_match_rounds (
  id TEXT PRIMARY KEY, match_id TEXT NOT NULL, round_index INTEGER NOT NULL,
  map_id TEXT, map_name TEXT, map_mode TEXT, winner_team_id TEXT, score_summary TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
`;

const US = 'team-us';
const THEM = 'team-them';

/** A Bo5 whose FIRST map is lost but whose SERIES is won — the shape that made
 *  the list phase's first-map winner look like the match result. */
const SERIES = [
  { id: 'm1', mode: '5v5', result: 'win', rounds: [
    ['Ilios', 'Control', THEM], ['Circuit Royal', 'Escort', US],
    ['New Junk City', 'Flashpoint', US], ['Runasapi', 'Push', THEM],
    ["King's Row", 'Hybrid', US]] },
  // Ilios again, this time with no mode on the round (an organizer whose veto
  // ships untagged map entities) — it must NOT become a second Ilios row.
  { id: 'm2', mode: '5v5', result: 'loss', rounds: [
    ['Ilios', null, US], ['Busan', 'Control', THEM], ['Nepal', 'Control', null]] },
  // A match FACEIT has no stats for: marked collected, contributes no maps.
  { id: 'm3', mode: '5v5', result: 'loss', rounds: [] },
  // A 1v1 "Tank Duel" — a different game entirely, which FACEIT keeps in its own
  // stats segment. Counting it under 5v5 is what put our map win rates above the
  // player's own FACEIT profile, so it must stay out of the 5v5 view.
  { id: 'm4', mode: '1v1', result: 'win', rounds: [['Lijiang Tower', 'Control', US]] },
];

function fixture() {
  const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  sqlite.exec(DDL);
  sqlite.prepare(`INSERT INTO faceit_players
    (player_id,nickname,game,search_mode,list_done,detail_done,status,match_count,created_at,updated_at)
    VALUES ('p1','Scouted','ow2','deep',1,1,'ready',?,0,0)`).run(SERIES.length);
  for (const [i, m] of SERIES.entries()) {
    sqlite.prepare(`INSERT INTO faceit_matches
      (match_id,competition_name,game_mode,best_of,status,factions_json,started_at,
       detail_synced_at,stats_synced_at,rounds_synced_at,created_at,updated_at)
      VALUES (?,'Season 9',?,?, 'finished',?,?,1,1,1,0,0)`).run(
      m.id, m.mode, m.rounds.length || null,
      JSON.stringify({ faction1: { nickname: 'Us', score: 3 }, faction2: { nickname: 'Them', score: 2 } }),
      1000 - i);
    sqlite.prepare(`INSERT INTO faceit_match_players
      (id,match_id,player_id,nickname,faction,team_id,result,stats_synced_at,created_at,updated_at)
      VALUES (?,?,'p1','Scouted','faction1',?,?,1,0,0)`).run(`${m.id}:p1`, m.id, US, m.result);
    for (const [n, [map, mode, winner]] of m.rounds.entries()) {
      sqlite.prepare(`INSERT INTO faceit_match_rounds
        (id,match_id,round_index,map_name,map_mode,winner_team_id,created_at,updated_at)
        VALUES (?,?,?,?,?,?,0,0)`).run(`${m.id}:${n + 1}`, m.id, n + 1, map, mode, winner);
    }
  }

  const client = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return { bind(...params) {
        return {
          async raw() { stmt.setReturnArrays(true); return stmt.all(...params); },
          async all() { return { results: stmt.all(...params), meta: {} }; },
          async run() { return stmt.run(...params); },
        };
      } };
    },
    async batch(statements) { return Promise.all(statements.map(s => s.all())); },
  };
  const db = drizzle(client);
  const mocks = {
    'server-only': {},
    react: { cache: f => f },
    '@opennextjs/cloudflare': { getCloudflareContext: () => ({ env: {} }) },
    '@/lib/ow-db': { getOwDb: () => db },
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
      exports, require: load, Date, crypto, URL,
      console: { ...console, error() {} },
    }, { filename: path });
    return exports;
  }
  return { sqlite, load };
}

test('win rate by map counts every map of a series, once per map name', async () => {
  const f = fixture();
  try {
    const { getScoutingData } = f.load('@/lib/faceit-scouting');
    const res = await getScoutingData({ playerId: 'p1' });
    assert.equal(res.status, 'ready');
    const byMap = new Map(res.data.mapWinrates.map(r => [r.map, r]));

    // Every map of the Bo5 is counted, not just its first pick.
    assert.deepEqual([...byMap.keys()].sort(), [
      'Busan', 'Circuit Royal', 'Ilios', "King's Row", 'Nepal', 'New Junk City', 'Runasapi',
    ]);
    // One Ilios row across both a tagged and an untagged appearance, and the
    // mode survives from the appearance that had one.
    assert.equal(byMap.get('Ilios').total, 2);
    assert.equal(byMap.get('Ilios').wins, 1);
    assert.equal(byMap.get('Ilios').losses, 1);
    assert.equal(byMap.get('Ilios').mapMode, 'Control');
    // A map with no winner is a draw, not a loss, and stays out of the rate.
    assert.deepEqual(
      { ...byMap.get('Nepal'), map: undefined, mapMode: undefined },
      { map: undefined, mapMode: undefined, wins: 0, losses: 0, draws: 1, total: 1, winrate: null },
    );
    assert.equal(byMap.get('Runasapi').winrate, 0);
    assert.equal(byMap.get('Circuit Royal').winrate, 1);
  } finally { f.sqlite.close(); }
});

test('the summary reports the map record and the series record separately', async () => {
  const f = fixture();
  try {
    const { getScoutingData } = f.load('@/lib/faceit-scouting');
    const { data } = await getScoutingData({ playerId: 'p1' });

    // Series: three matches, one won — what the match list shows.
    assert.equal(data.summary.total, 3);
    assert.equal(data.summary.wins, 1);
    assert.equal(data.summary.losses, 2);
    assert.equal(data.summary.winrate, 1 / 3);

    // Maps: eight played, four won, one drawn — what FACEIT's profile shows.
    assert.equal(data.summary.maps.total, 8);
    assert.equal(data.summary.maps.wins, 4);
    assert.equal(data.summary.maps.losses, 3);
    assert.equal(data.summary.maps.draws, 1);
    assert.equal(data.summary.maps.winrate, 4 / 7);

    // The headline is the sum of the bars, so the two can never disagree.
    const bars = data.mapWinrates.reduce((n, r) => n + r.total, 0);
    assert.equal(bars, data.summary.maps.total);
    assert.equal(data.summary.matchesWithMaps, 3);
  } finally { f.sqlite.close(); }
});

// `data` is built inside the vm realm, so arrays coming back are spread into
// this realm before deepEqual, which compares prototypes.
test('a match carries the maps it was actually played on, in order', async () => {
  const f = fixture();
  try {
    const { getScoutingData } = f.load('@/lib/faceit-scouting');
    const { data } = await getScoutingData({ playerId: 'p1' });
    const byId = new Map(data.matches.map(m => [m.matchId, m]));
    assert.deepEqual([...byId.get('m1').maps], [
      'Ilios', 'Circuit Royal', 'New Junk City', 'Runasapi', "King's Row",
    ]);
    assert.deepEqual([...byId.get('m3').maps], []);
  } finally { f.sqlite.close(); }
});

test('match detail names each round by its map, from the scouted player side', async () => {
  const f = fixture();
  try {
    const { getScoutMatchDetail } = f.load('@/lib/faceit-scouting');
    const detail = await getScoutMatchDetail('m1', 'p1');
    assert.equal(detail.roundCount, 5);
    assert.deepEqual([...detail.rounds.map(r => r.mapName)], [
      'Ilios', 'Circuit Royal', 'New Junk City', 'Runasapi', "King's Row",
    ]);
    // Map 1 is lost even though the series is won — the two are separate facts.
    assert.deepEqual([...detail.rounds.map(r => r.result)], [
      'loss', 'win', 'win', 'loss', 'win',
    ]);
  } finally { f.sqlite.close(); }
});

test('the format filter keeps a 1v1 Tank Duel out of the 5v5 view', async () => {
  const f = fixture();
  try {
    const { getScoutingData } = f.load('@/lib/faceit-scouting');

    const five = await getScoutingData({ playerId: 'p1' }, '5v5');
    assert.equal(five.data.gameMode, '5v5');
    assert.equal(five.data.summary.total, 3, 'three 5v5 series');
    assert.equal(five.data.summary.maps.total, 8);
    assert.ok(
      !five.data.mapWinrates.some(r => r.map === 'Lijiang Tower'),
      'the 1v1 map must not appear in the 5v5 chart',
    );
    assert.ok(!five.data.matches.some(m => m.matchId === 'm4'));

    const one = await getScoutingData({ playerId: 'p1' }, '1v1');
    assert.equal(one.data.summary.total, 1);
    assert.equal(one.data.summary.maps.total, 1);
    assert.deepEqual([...one.data.mapWinrates.map(r => r.map)], ['Lijiang Tower']);
    assert.equal(one.data.mapWinrates[0].winrate, 1);
    assert.deepEqual([...one.data.matches.map(m => m.matchId)], ['m4']);

    // A format nobody played is empty, not an error — the view says so.
    for (const unplayed of ['3v3', '6v6']) {
      const none = await getScoutingData({ playerId: 'p1' }, unplayed);
      assert.equal(none.status, 'ready', unplayed);
      assert.equal(none.data.summary.total, 0, unplayed);
      assert.equal(none.data.summary.maps.winrate, null, unplayed);
      assert.equal(none.data.mapWinrates.length, 0, unplayed);
    }
  } finally { f.sqlite.close(); }
});

test('collection progress and readiness ignore the format filter', async () => {
  const f = fixture();
  try {
    const { getScoutingData } = f.load('@/lib/faceit-scouting');
    // The deep loading bar tracks the backfill of the WHOLE history, so a
    // narrow format must not make a half-collected player look finished.
    for (const mode of SCOUT_GAME_MODES) {
      const res = await getScoutingData({ playerId: 'p1' }, mode);
      assert.equal(res.progress.total, 4, `progress.total under ${mode}`);
      assert.equal(res.progress.detailed, 4, `progress.detailed under ${mode}`);
      assert.equal(res.status, 'ready');
    }
  } finally { f.sqlite.close(); }
});
