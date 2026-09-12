import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require=createRequire(import.meta.url), root=resolve(import.meta.dirname,'..');
const cache=new Map();
const mocks=new Map();
async function enrich(rows) {
 mocks.set('@/lib/db',{getDb:()=>({select:()=>({from:()=>({})}),batch:async()=>[[],[],[]]})});
 mocks.set('@/db/schema',{});
 try {return await load('@/lib/discovery').enrichDiscovery(rows);} finally {mocks.delete('@/lib/db');mocks.delete('@/db/schema');}
}
test('Series page includes LeagueOS',async()=>{
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8')).filter(t=>t.organizer==='NECC');
 const entries=await enrich(rows.map(t=>({...t,status:'completed'})));
 const wrapper=({children})=>React.createElement('div',null,children);
 mocks.set('@/lib/session',{getSessionCached:async()=>({user:{id:'test'}})});
 mocks.set('@/lib/tournament-entries',{loadTournamentEntries:async()=>entries});
 mocks.set('@/components/dashboard/SetupBanner',{SetupBanner:()=>null});
 mocks.set('@/components/dashboard/bubbles/Bubble',{Bubble:wrapper});
 mocks.set('@/components/dashboard/tournaments/TournamentList',{...load('@/components/dashboard/tournaments/TournamentList'),TournamentCards:()=>null});
 mocks.set('@/components/dashboard/series/SeriesList',{SeriesList:({tournaments})=>{ assert.equal(tournaments.length,entries.length); return null; }});
 try {
  const page=await load('@/app/(dashboard)/series/page').default();
  const html=renderToStaticMarkup(page);
  assert.equal((html.match(/class="ff-tcard ff-scard"/g)??[]).length,0);
  assert.equal((html.match(/>Concluded</g)??[]).length,0);
 } finally {mocks.clear();cache.clear();}
});
test('NECC has one league card while season identities remain available',async()=>{
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8')).filter(t=>t.organizer==='NECC');
 const tournaments=await enrich(rows.map(t=>({...t,status:'completed'})));
 const html=renderSeries(tournaments);
 assert.equal((html.match(/class="ff-tcard ff-scard"/g)??[]).length,1);
 assert.match(html,/318 tournaments/);
 assert.match(html,/>Concluded</);
 assert.ok(html.includes(encodeURIComponent(tournaments[0].discovery.providerParentId)));
 assert.equal(new Set(tournaments.map(t=>t.discovery.seriesId).filter(Boolean)).size,12);
});
test('screenshot leagues group across roster sizes, tiers and seasons without merging provider identities',async()=>{
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8'))
  .filter(t=>['Esports Ohio','Indiana Esports Network'].includes(t.organizer));
 const tournaments=await enrich(rows.map(t=>({...t,status:'registration'})));
 const html=renderSeries(tournaments);
 assert.equal((html.match(/class="ff-tcard ff-scard"/g)??[]).length,2);
 assert.match(html,/>Esports Ohio</);assert.match(html,/>Indiana Esports Network</);
 assert.doesNotMatch(html,/ff-tcard__title[^>]*>[^<]*(?:Varsity|Club|2v2|3v3)/);
 const {leagueosSections,leagueosGroup}=load('@/lib/leagueos-groups');
 const ohio=leagueosSections(tournaments.filter(t=>t.organizer==='Esports Ohio'));
 const sponsored=ohio.find(s=>s.name==='2026–2027 · Sponsored Season');
 assert.equal(sponsored.tournaments.length,7);
 assert.ok(sponsored.tournaments.some(t=>t.name.includes('(2v2)')));
 assert.ok(sponsored.tournaments.some(t=>t.name.includes('(3v3)')));
 const indiana=leagueosSections(tournaments.filter(t=>t.organizer==='Indiana Esports Network'));
 const ihsen=indiana.find(s=>s.name==='2026–2027 · IHSEN');
 assert.equal(ihsen.tournaments.length,10);
 assert.ok(ihsen.tournaments.some(t=>t.name.includes('Club')));
 assert.ok(ihsen.tournaments.some(t=>t.name.includes('Varsity')));
 assert.ok(indiana.some(s=>s.name==='Fall 2026 · IMSEN'));
 assert.equal(ohio.reduce((n,s)=>n+s.tournaments.length,0)+indiana.reduce((n,s)=>n+s.tournaments.length,0),tournaments.length);
 const a=tournaments[0];
 const {matchesDiscovery,EMPTY_FILTERS}=load('@/lib/discovery-shared');
 assert.equal(matchesDiscovery(a,{...EMPTY_FILTERS,following:true},[leagueosGroup(a).id],Date.now()),true);
 assert.notEqual(leagueosGroup(a).id,leagueosGroup({...a,discovery:{...a.discovery,providerParentId:'series:leagueos:another'}}).id);
 const {LeagueCompetitions}=load('@/components/dashboard/series/LeagueCompetitions');
 const detail=renderToStaticMarkup(React.createElement(LeagueCompetitions,{tournaments:ihsen.tournaments}));
 assert.match(detail,/<summary>/);assert.match(detail,/IHSEN/);
 assert.match(detail,/Varsity/);assert.match(detail,/Club/);
});
test('active leagues sort ahead of concluded groups and inferred singletons stay hidden',()=>{
 const t=(id,name,status)=>({id,name,status,startsAt:null,endsAt:null,discovery:{seriesId:id,seriesName:name}});
 const html=renderSeries([
  t('series:competition:old','A concluded league 2025','cancelled'),
  t('series:competition:new','Z active league 2026','active'),
  t('series:competition:startgg','start.gg archive 2025','completed'),
  t('series:competition:faceit','FACEIT archive 2025','completed'),
  t('series:competition:challonge','Challonge archive 2025','completed'),
  t('series:tournament:solo','Inferred singleton','completed'),
 ]);
 assert.ok(html.indexOf('Z active league')<html.indexOf('A concluded league'));
 assert.match(html,/>Concluded</);
 assert.equal((html.match(/class="ff-tcard ff-scard"/g)??[]).length,5);
 assert.doesNotMatch(html,/Inferred singleton/);
});
test('start.gg series cards use competition names when the owner name is missing',async()=>{
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/provider-parents-3610.json'),'utf8')).filter(t=>t.organizerUrl?.endsWith('/8763a415'));
 const tournaments=await enrich(rows.map(t=>({...t,status:'completed'})));
 const html=renderSeries(tournaments);
 assert.match(html,/Wednesday my Dudes/);
 assert.doesNotMatch(html,/>start.gg organizer/);
 assert.ok(tournaments.every(t=>t.discovery.providerParentId==='series:startgg:owner:8763a415'));
});
function renderSeries(tournaments, view = 'all', games = []) {
 const modulePath=resolve(root,'components/dashboard/series/SeriesList.tsx');
 cache.delete(modulePath);
 mocks.set('@/lib/view-state',{usePersistentState:(key,fallback)=>[
  key==='tournaments:list'?{...fallback,view,games}:fallback,()=>{},true
 ]});
 try {
  const {SeriesList}=load('@/components/dashboard/series/SeriesList');
  return renderToStaticMarkup(React.createElement(SeriesList,{tournaments}));
 } finally {mocks.delete('@/lib/view-state');cache.delete(modulePath);}
}
test('All, Active and Concluded partition series across providers and preserve full membership',()=>{
 const now=Date.now();
 const event=(id,series,status,source,game='Overwatch',endsAt=null)=>({id,name:series,status,source,game,endsAt,
  discovery:{seriesId:'series:competition:'+series,seriesName:series}});
 const rows=[
  event('a','Archive 2025','completed','startgg'),
  event('b','Cancelled 2025','cancelled','faceit'),
  event('c','Ended 2025','registration','leagueos','Overwatch',now-86400000),
  event('d','Mixed 2026','completed','leagueos'),
  event('e','Mixed 2026','active','leagueos','VALORANT'),
  event('f','Upcoming 2027','registration','startgg','Overwatch',now+86400000),
 ];
 const count=html=>(html.match(/class="ff-tcard ff-scard"/g)??[]).length;
 assert.equal(count(renderSeries(rows,'all')),5);
 const active=renderSeries(rows,'active');
 assert.equal(count(active),2);
 assert.match(active,/Mixed 2026/);assert.match(active,/Upcoming 2027/);
 assert.doesNotMatch(active,/Archive 2025|Cancelled 2025|Ended 2025/);
 const concluded=renderSeries(rows,'concluded');
 assert.equal(count(concluded),3);
 assert.doesNotMatch(concluded,/Mixed 2026|Upcoming 2027/);
 assert.match(concluded,/All.*?\(5\)/);assert.match(concluded,/Active.*?\(2\)/);assert.match(concluded,/Concluded.*?\(3\)/);
 const filtered=renderSeries(rows,'concluded',['Overwatch']);
 assert.doesNotMatch(filtered,/Mixed 2026/);
 assert.match(renderSeries(rows,'active',['Overwatch']),/1 of 2 concluded/);
});
function load(name, parent=root) {
 if(mocks.has(name)) return mocks.get(name);
 if(name==='next/navigation') return {useRouter:()=>({refresh(){}}),usePathname:()=>'/series/',useSearchParams:()=>new URLSearchParams()};
 if(!name.startsWith('@/') && !name.startsWith('.')) return require(name);
 const base=name.startsWith('@/') ? resolve(root,name.slice(2)) : resolve(parent,name);
 const path=['.ts','.tsx'].map(ext=>base+ext).find(existsSync);
 if(!path) throw new Error(`Missing test module: ${base}`);
 if(cache.has(path)) return cache.get(path).exports;
 const module={exports:{}};cache.set(path,module);
 const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 runInNewContext(code,{module,exports:module.exports,require:n=>load(n,dirname(path)),console,URL,URLSearchParams,Date,Intl,setTimeout,clearTimeout});
 return module.exports;
}
test('LeagueOS provider uses supplied logo and appears on general surfaces',()=>{
 const {sourceKey,SourceLogo}=load('@/components/brand/SourceLogo');
 assert.equal(sourceKey('leagueos'),'leagueos');
 const html=renderToStaticMarkup(React.createElement(SourceLogo,{source:'leagueos'}));
 assert.match(html,/\/brand\/sources\/leagueos.svg/);assert.match(html,/aria-label="LeagueOS"/);
 const {withoutDiscordSourced}=load('@/lib/tournaments-shared');
 assert.equal(withoutDiscordSourced([{source:'leagueos'},{source:'discord'},{source:'faceit'}]).map(t=>t.source).join(','),'leagueos,faceit');
});
test('LeagueOS overview keeps stage positions out of the overall podium and mounts refresh',()=>{
 const {ExternalTournamentView}=load('@/components/dashboard/tournaments/ExternalTournamentView');
 const tournament={id:'leagueos:league:event',source:'leagueos',name:'NECC Spring',game:'Overwatch',status:'completed',startAt:new Date(100000),endAt:new Date(200000),numAttendees:2,bannerUrl:null,url:'https://necc.leagueos.gg/schedule/overwatch/event/standings',description:'About the event',contact:null,contactType:null,streamUrl:null,registrationClosesAt:null,prizePool:null,videoUrl:null,organizer:'NECC',organizerUrl:'https://necc.leagueos.gg',links:[],images:[],aboutLayout:[],events:[{id:'stage',name:'Division 1',state:'completed',numEntrants:2,matches:[],standings:[{entrantName:'School',entrantLogoUrl:null,entrantSchool:null,isTeam:true,placement:1}]}]};
 const html=renderToStaticMarkup(React.createElement(ExternalTournamentView,{tournament,shareUrl:'https://example.test',shareMessage:'NECC'}));
 assert.match(html,/View on LeagueOS/);assert.match(html,/Updating…/);assert.match(html,/About the event/);
 assert.doesNotMatch(html,/aria-label="Top finishers"/);
});
test('LeagueOS artwork repairs cached league URLs and preserves other artwork',()=>{
 const {normalizeTournamentArtwork,TournamentBannerImage}=load('@/components/dashboard/tournaments/TournamentBannerImage');
 const old='https://images.leagueos.gg/leagues/9j5dg7arx9duozny51fhx1p9r/6514260f75e117fcf6f5b429';
 const fixed=old.replace('/leagues/','/league/');
 assert.equal(normalizeTournamentArtwork(old),fixed);
 for(const url of [fixed,'https://images.leagueos.gg/seasons/event/banner','https://example.com/leagues/a/b']) assert.equal(normalizeTournamentArtwork(url),url);
 assert.match(renderToStaticMarkup(React.createElement(TournamentBannerImage,{url:old})),/src="https:\/\/images.leagueos.gg\/league\//);
 assert.equal(renderToStaticMarkup(React.createElement(TournamentBannerImage,{url:null})), '');
});
test('sparse LeagueOS round robin keeps its matrix without inventing pools',()=>{
 const fixture=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/wrmsec-preseason.json'),'utf8'));
 const {RoundRobinView}=load('@/components/dashboard/tournaments/RoundRobinView');
 const {StageTabs}=load('@/components/dashboard/tournaments/StageTabs');
 const {rrGroupsFromExternal}=load('@/lib/round-robin-shared');
 const events=fixture.events.map(e=>({...e,matches:e.matches.map(m=>({...m,scheduledAt:m.scheduledAt?new Date(m.scheduledAt):null}))}));
 const tabs=events.map(e=>({key:e.id,label:e.name,node:React.createElement(RoundRobinView,{groups:rrGroupsFromExternal([e])})}));
 const html=renderToStaticMarkup(React.createElement(StageTabs,{tabs}));
 for(const e of events) assert.ok(html.includes(e.name));
 assert.match(html,/Round Robin Matrix/);
 assert.match(html,/Truman Middle School \(black\)/);
 assert.doesNotMatch(html,/Complete Graph|Pool 1/);
 const many=renderToStaticMarkup(React.createElement(StageTabs,{tabs:Array.from({length:12},(_,i)=>({key:String(i),label:`Division ${i+1}`,node:null}))}));
 assert.match(many,/<select/);assert.equal((many.match(/<option/g)??[]).length,12);
});
test('external tournament host preserves all five WRMSEC stage names',()=>{
 const fixture=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/wrmsec-preseason.json'),'utf8'));
 const events=fixture.events.map(e=>({...e,matches:e.matches.map(m=>({...m,scheduledAt:m.scheduledAt?new Date(m.scheduledAt):null}))}));
 const modulePath=resolve(root,'components/dashboard/tournaments/ExternalTournamentView.tsx');
 cache.delete(modulePath);
 mocks.set('@/components/dashboard/tournaments/TournamentChrome',{TournamentChrome:({tabs})=>tabs.find(t=>t.id==='bracket').node});
 try {
  const {ExternalTournamentView}=load('@/components/dashboard/tournaments/ExternalTournamentView');
  const tournament={id:'wrmsec-preview',source:'leagueos',name:fixture.name,game:'Rocket League',status:'active',startAt:null,endAt:null,numAttendees:20,bannerUrl:null,url:'https://wrmsec.leagueos.gg',description:null,links:[],images:[],aboutLayout:[],events};
  const html=renderToStaticMarkup(React.createElement(ExternalTournamentView,{tournament,shareUrl:'https://example.test',shareMessage:fixture.name}));
  for (const e of events) assert.ok(html.includes(e.name),e.name);
  assert.equal((html.match(/role="tab"/g)??[]).length,5);
  assert.match(html,/Round Robin Matrix/);
  assert.doesNotMatch(html,/Pool 1/);
 } finally { mocks.clear();cache.delete(modulePath); }
});
test('SSBU retains 277 public matches, one playoff bracket and chronological stage order',()=>{
 const fixture=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/wrmsec-ssbu.json'),'utf8'));
 const events=fixture.events.map(e=>({...e,matches:e.matches.map(m=>({...m,scheduledAt:m.scheduledAt?new Date(m.scheduledAt):null}))}));
 assert.equal(events.reduce((n,e)=>n+e.matches.length,0),277);
 const playoffs=events.find(e=>e.name==='Playoff Bracket');
 assert.equal(playoffs.matches.filter(m=>m.round==='Third-place match').length,1);
 const {ExternalBracket}=load('@/components/dashboard/tournaments/ExternalBracket');
 const bracket=renderToStaticMarkup(React.createElement(ExternalBracket,{events:[playoffs],source:'leagueos'}));
 assert.doesNotMatch(bracket,/Pool 1|Pool 2/);assert.match(bracket,/Third-place match/);
 const modulePath=resolve(root,'components/dashboard/tournaments/ExternalTournamentView.tsx');
 const tournament={id:'ssbu-test',source:'leagueos',name:fixture.name,game:'Super Smash Bros. Ultimate',status:'completed',startAt:null,endAt:null,numAttendees:79,bannerUrl:null,url:'https://wrmsec.leagueos.gg',description:null,links:[],images:[],aboutLayout:[],events:[events[1],events[2],events[0]]};
 for(const tab of ['overview','bracket']) {
  cache.delete(modulePath);
  mocks.set('@/components/dashboard/tournaments/TournamentChrome',{TournamentChrome:({tabs})=>tabs.find(t=>t.id===tab).node,useTournamentTabs:()=>null});
  try {
   const {ExternalTournamentView}=load('@/components/dashboard/tournaments/ExternalTournamentView');
   const html=renderToStaticMarkup(React.createElement(ExternalTournamentView,{tournament,shareUrl:'https://example.test',shareMessage:fixture.name}));
   if(tab==='overview') {assert.match(html,/Playoff Bracket · Top standings/);assert.match(html,/Season · Top standings/);}
   if(tab==='overview') {
    for (const status of ['upcoming','registration','active','cancelled']) {
     const pending=renderToStaticMarkup(React.createElement(ExternalTournamentView,{tournament:{...tournament,status},shareUrl:'https://example.test',shareMessage:fixture.name}));
     assert.doesNotMatch(pending,/· Top standings/,status);
    }
   }
   if(tab==='bracket') {assert.ok(html.indexOf('>Preseason Week 2<')<html.indexOf('>Season<'));assert.ok(html.indexOf('>Season<')<html.indexOf('>Finals<'));}
  } finally { mocks.clear();cache.delete(modulePath); }
 }
});
test('Swiss metadata keeps the rounds view and visibly identifies Swiss',()=>{
 const modulePath=resolve(root,'components/dashboard/tournaments/ExternalTournamentView.tsx');cache.delete(modulePath);
 mocks.set('@/components/dashboard/tournaments/TournamentChrome',{TournamentChrome:({tabs})=>tabs.find(t=>t.id==='bracket').node});
 try {
  const {ExternalTournamentView}=load('@/components/dashboard/tournaments/ExternalTournamentView');
  const tournament={id:'swiss-test',source:'leagueos',name:'Swiss test',game:'Rocket League',status:'active',startAt:null,endAt:null,url:'https://example.test',links:[],images:[],aboutLayout:[],events:[{id:'swiss',name:'Season',standings:[],phases:[{id:'swiss',name:'Season',bracketType:'SWISS'}],matches:[{id:'m',phaseId:'swiss',bracketType:'SWISS',entrant1Name:'A',entrant2Name:'B',scheduledAt:null}]}]};
  const html=renderToStaticMarkup(React.createElement(ExternalTournamentView,{tournament,shareUrl:'https://example.test',shareMessage:'Swiss'}));
  assert.match(html,/Swiss · Rounds and Matches/);assert.doesNotMatch(html,/Round Robin Matrix/);
 } finally {mocks.clear();cache.delete(modulePath);}
});
