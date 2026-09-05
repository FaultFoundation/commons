import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/d1';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
function loader(overrides = {}) {
  const cache = new Map();
  function load(name) {
    if (overrides.modules?.[name]) return overrides.modules[name];
    if (!name.startsWith('@/')) return require(name);
    if (cache.has(name)) return cache.get(name);
    const path = resolve(root, name.slice(2) + '.ts');
    let source = readFileSync(path, 'utf8');
    if (name === '@/lib/player-data-sync') source += '\nexport { parseFaceitMatch, parseStartggSet, challongeTournamentMatches };';
    const module = { exports: {} }; cache.set(name, module.exports);
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }}).outputText;
    runInNewContext(code, { module, exports: module.exports, require: load, console, URL, Date, crypto, AbortSignal, fetch: overrides.fetch });
    return module.exports;
  }
  return load;
}
const load = loader();
const fmt = load('@/lib/tournament-format');
const rr = load('@/lib/round-robin-shared');
const match = (a,b, extra={}) => ({ id: `${a}-${b}`, entrant1Name:a, entrant2Name:b, roundOrder:1, ...extra });
test('partial elimination and Swiss schedules remain unconfirmed, never density-guessed', () => {
  assert.equal(fmt.classifyExternalFormat([match('A','B'),match('B','C')]), null);
  assert.equal(fmt.classifyExternalFormat([match('A','B'),match('C','D'),match('A','C')]), null);
});
test('complete unique pairings identify RR; duplicate rows cannot inflate coverage', () => {
  assert.equal(fmt.classifyExternalFormat([match('A','B'),match('B','C'),match('A','C')]), 'round_robin');
  assert.equal(fmt.classifyExternalFormat([match('A','B'),match('A','B'),match('B','C')]), null);
});
test('provider metadata takes precedence and mixed stages are not collapsed', () => {
  for (const [raw, expected] of [['ROUND_ROBIN','round_robin'],['singleElimination','single_elim'],['doubleElimination','double_elim'],['SWISS','swiss']]) {
    assert.equal(fmt.classifyExternalFormat([match('A','B',{ bracketType:raw })]), expected);
  }
  assert.equal(fmt.classifyExternalFormat([match('A','B',{ bracketType:'ROUND_ROBIN' }),match('A','C',{ bracketType:'SINGLE_ELIMINATION' })]), null);
  assert.equal(fmt.classifyExternalFormat([match('A','B',{ round:'Losers Round 1', roundOrder:1 })]), 'double_elim');
});
test('round robin open is not live, completed draws stay completed, events stay separate', () => {
  const groups = rr.rrGroupsFromExternal([{matches:[match('A','B',{state:'3'})]}, {matches:[match('A','C',{state:'ready'})]}]);
  assert.equal(groups.length,2);
  assert.equal(groups[0].matches[0].state,'done');
  assert.equal(groups[1].matches[0].state,'upcoming');
  const internal = rr.rrGroupsFromSnapshot({participants:[],matches:[{id:'1',round:1,state:'open',scores:null}]});
  assert.equal(internal[0].matches[0].state,'upcoming');
});
test('statistics exclude unfinished and unattributed results', () => {
  const summary = load('@/lib/match-statistics').summarizeMatches([{status:'finished',result:'win'},{status:'finished',result:'loss'},{status:'finished',result:null},{status:'scheduled',result:'win'}]);
  assert.equal(summary.decided,2); assert.equal(summary.winRate,50); assert.equal(summary.unknown,1);
});
test('FACEIT parses both roster shapes and does not invent a result for an unrelated player', () => {
  const api = load('@/lib/player-data-sync');
  for (const key of ['players','roster']) {
    const m = {match_id:'1',status:'FINISHED',teams:{faction1:{team_id:'t1',[key]:[{player_id:'me'}]},faction2:{team_id:'t2'}},results:{winner:'faction1',score:{faction1:2,faction2:1}}};
    assert.equal(api.parseFaceitMatch(m,'me','ow2').result,'win');
    assert.equal(api.parseFaceitMatch(m,'other','ow2').result,null);
    assert.equal(api.parseFaceitMatch({...m,status:'READY'},'me','ow2').status,'scheduled');
  }
});
test('start.gg attributes by player id and global team, excludes negative DQ scores', () => {
  const api = load('@/lib/player-data-sync');
  const result = api.parseStartggSet({id:1,winnerId:10,slots:[{entrant:{id:10,team:{globalTeam:{id:99}},participants:[{player:{id:5}}]},standing:{stats:{score:{value:2}}}},{entrant:{id:11},standing:{stats:{score:{value:-1}}}}]},5);
  assert.equal(result.teamExternalId,'99'); assert.equal(result.result,'win'); assert.equal(result.scoreAgainst,null);
});
test('Challonge attributes the second side correctly and skips unrelated matches', async () => {
  const api = loader({ fetch: async url => ({status:200,json:async()=> url.includes('participants') ? {data:[{id:'a',attributes:{username:'other'}},{id:'b',attributes:{username:'me'}}]} : {data:[{id:'m',attributes:{player1_id:'a',player2_id:'b',winner_id:'b',scores_csv:'1-3',state:'complete'}},{id:'other',attributes:{player1_id:'a',player2_id:'c'}}]}}) })('@/lib/player-data-sync');
  const matches = await api.challongeTournamentMatches('fixture',{id:'t',name:'Cup'},'me');
  assert.equal(matches.length,1); assert.equal(matches[0].result,'win'); assert.equal(matches[0].scoreFor,3);
});
test('FACEIT failed history pages retain cursor instead of marking the import complete', async () => {
  const api = loader({fetch:async url => ({status:url.includes('/history') ? 503 : 200,json:async()=>url.includes('/teams')?{items:[]}:{games:{ow2:{}}}})})('@/lib/player-data-sync');
  const result = await api.runProviderSync({row:{provider:'faceit',externalId:'me',backfillCursor:null,backfillDone:false},faceitApiKey:'fixture',rosterDue:async()=>[]});
  assert.equal(result.status,'error'); assert.equal(result.cursor,null); assert.equal(result.backfillDone,false);
});

function actionFixture() {
  const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  for (const file of readdirSync(resolve(root, 'drizzle')).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8'));
  sqlite.exec('PRAGMA foreign_keys=OFF');
  const client = { prepare(sql) {
    let values = [];
    const query = {
      bind(...args) { values = args; return query; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async raw() { const stmt = sqlite.prepare(sql); stmt.setReturnArrays(true); return stmt.all(...values); },
      async run() { return sqlite.prepare(sql).run(...values); },
    };
    return query;
  }, async batch(queries) { return Promise.all(queries.map(q => q.all())); } };
  const db = drizzle(client);
  const state = { role: 'manager', session: { user: {id:'member'} }, revision:0 };
  const modules = {
    'next/cache': { revalidatePath() {} },
    '@/lib/db': { getDb: () => db },
    '@/lib/session': { getSessionCached: async () => state.session },
    '@/lib/teams': {getTeamMembership:async()=> state.role ? {role:state.role} : null},
    '@/lib/player-data': {getExternalTeamsForUser:async()=>[{id:'faceit:one'}]},
    '@/lib/team-statistics': {teamStatistics:async()=>({matches:[{matchKey:'faceit:match',status:'scheduled',reportedTime:{revision:state.revision}}]})},
  };
  const load = loader({modules});
  return { actions:load('@/app/statistics/actions'), times:load('@/lib/match-times'), state, sqlite, db, modules };
}
test('provider team links enforce role, membership proof, and one Commons team per external identity', async () => {
  const f = actionFixture();
  f.state.role = 'player';
  assert.ok((await f.actions.updateStatisticsTeamLink('team','faceit:one')).error);
  f.state.role = 'manager';
  assert.ok((await f.actions.updateStatisticsTeamLink('team','faceit:unowned')).error);
  assert.equal((await f.actions.updateStatisticsTeamLink('team','faceit:one')).success,true);
  assert.ok((await f.actions.updateStatisticsTeamLink('other','faceit:one')).error);
  await f.actions.updateStatisticsTeamLink('other','faceit:one',true);
  assert.equal(f.sqlite.prepare('select count(*) as n from team_provider_links').get().n,1);
  await f.actions.updateStatisticsTeamLink('team','faceit:one',true);
  assert.equal(f.sqlite.prepare('select count(*) as n from team_provider_links').get().n,0);
  f.sqlite.close();
});
test('shared time reports reject unrelated matches and concurrent stale edits; retain revision history', async () => {
  const f = actionFixture();
  const now = Date.now();
  assert.ok((await f.actions.reportStatisticsMatchTime('team','other',now,'https://example.com/match',0)).error);
  assert.ok((await f.actions.reportStatisticsMatchTime('team','faceit:match',now,'javascript:alert(1)',0)).error);
  const results = await Promise.all([1,2].map(()=>f.actions.reportStatisticsMatchTime('team','faceit:match',now,'https://example.com/match',0)));
  assert.equal(results.filter(r=>r.success).length,1);
  assert.equal(results.filter(r=>r.error).length,1);
  f.state.revision=1;
  assert.equal((await f.actions.reportStatisticsMatchTime('team','faceit:match',now+60000,'https://example.com/new',1)).success,true);
  assert.equal(f.sqlite.prepare('select count(*) as n from match_time_reports').get().n,2);
  const matches = await f.times.applyMatchTimes([{matchKey:'faceit:match',status:'scheduled',startedAt:now},{matchKey:'faceit:match',status:'finished',startedAt:now}]);
  assert.equal(matches[0].reportedTime.revision,2);
  assert.equal(matches[0].reportedTime.conflictsWithProvider,true);
  assert.equal(matches[0].startedAt,now);
  assert.equal(matches[1].reportedTime,undefined);
  f.sqlite.close();
});

test('announced phases identify formats before matches exist and mixed events preserve each stage', () => {
  const events = [{id:'event',name:'Cup',phases:[{id:'pools',name:'Pools',bracketType:'ROUND_ROBIN'},{id:'final',name:'Playoffs',bracketType:'DOUBLE_ELIMINATION'}],matches:[]}];
  const stages = fmt.externalFormatStages(events);
  assert.equal(stages.length,2);
  assert.equal(stages[0].format,'round_robin');
  assert.equal(stages[1].format,'double_elim');
  assert.equal(fmt.resolveExternalFormat(events),null);
  assert.equal(fmt.resolveExternalFormat([{...events[0],phases:[events[0].phases[0]]}]),'round_robin');
});

test('external team history keeps over 300 distinct matches, newest duplicate, and provider isolation', async () => {
  const f = actionFixture();
  for (const file of readdirSync(resolve(root, 'drizzle-ow')).filter(f => f.endsWith('.sql')).sort()) f.sqlite.exec(readFileSync(resolve(root, 'drizzle-ow', file), 'utf8'));
  f.sqlite.exec("INSERT INTO pd_teams (id,provider,external_team_id,name,created_at,updated_at) VALUES ('faceit:one','faceit','one','Team',0,0)");
  f.sqlite.exec("INSERT INTO pd_team_links(id,user_id,team_id,provider,created_at) VALUES ('link','member','faceit:one','faceit',0)");
  const insert = f.sqlite.prepare('INSERT INTO pd_matches(id,user_id,provider,external_match_id,team_external_id,status,result,started_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?)');
  for (let i=0;i<350;i++) {
    insert.run('old'+i,'member','faceit',String(i),'one','scheduled',null,i,1);
    insert.run('new'+i,'teammate','faceit',String(i),'one','finished','win',i,2);
    insert.run('foreign'+i,'member','startgg',String(i),'one','finished','loss',i,3);
  }
  const modules = {...f.modules,
    '@opennextjs/cloudflare': {}, '@/lib/account-links': {}, '@/lib/auth': {},
    '@/lib/ow-db': { getOwDb: () => f.db }, '@/lib/ow-stats-shared': {},
    '@/lib/platform-identities': {}, '@/lib/player-data-sync': {},
  };
  delete modules['@/lib/player-data'];
  const api = loader({modules})('@/lib/player-data');
  const detail = await api.getExternalTeamDetail('member','faceit:one');
  assert.equal(detail.matches.length,350);
  assert.ok(detail.matches.every(m=>m.provider==='faceit' && m.result==='win'));
  assert.equal(await api.getExternalTeamDetail('stranger','faceit:one'),null);
  f.sqlite.close();
});

test('start.gg backfill advances only across successful pages and reports history errors even with a readable team list', async () => {
  let fail = false;
  const pages = [];
  const api = loader({fetch:async(url,init)=> {
    const body = JSON.parse(init.body);
    if (url.includes('/api/-/gql')) return {status:200,json:async()=>({data:{user:{teams:{nodes:[]}}}})};
    pages.push(body.variables.page);
    if (fail) return {status:503,json:async()=>({})};
    return {status:200,json:async()=>({data:{player:{sets:{pageInfo:{totalPages:6},nodes:[{id:body.variables.page,completedAt:1}]}}}})};
  }})('@/lib/player-data-sync');
  const args = {row:{provider:'startgg',externalId:'user',meta:JSON.stringify({startggPlayerId:5}),backfillDone:false,backfillCursor:null},startggApiKey:'fixture',rosterDue:async()=>[]};
  const first = await api.runProviderSync(args);
  assert.equal(first.matches.length,4); assert.equal(first.backfillDone,false); assert.equal(JSON.parse(first.cursor).page,5);
  fail = true;
  const second = await api.runProviderSync({...args,row:{...args.row,backfillCursor:first.cursor}});
  assert.equal(second.status,'error'); assert.equal(second.backfillDone,false);
  assert.deepEqual(pages,[1,2,3,4,5]);
});
test('Challonge refreshes results while an already-seen tournament remains underway', async () => {
  let matchReads=0;
  const api = loader({fetch:async(url)=>({status:200,json:async()=> {
    if (url.includes('/participants.json')) return {data:[{id:'a',attributes:{username:'me'}},{id:'b',attributes:{username:'other'}}]};
    if (url.includes('/matches.json')) { matchReads++; return {data:[{id:'m',attributes:{player1_id:'a',player2_id:'b',winner_id:'a',scores_csv:'3-1',state:'complete'}}]}; }
    return {data:[{id:'cup',attributes:{name:'Cup',state:'underway'}}]};
  }})})('@/lib/player-data-sync');
  const result = await api.runProviderSync({row:{provider:'challonge',externalId:'me',handle:'me',backfillDone:true,backfillCursor:JSON.stringify({page:1,seen:{cup:'underway'}})},challongeToken:'fixture',rosterDue:async()=>[]});
  assert.equal(result.status,'ok'); assert.equal(matchReads,1); assert.equal(result.matches[0].result,'win');
});
