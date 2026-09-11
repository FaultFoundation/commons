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
test('Experimental Series page excludes LeagueOS',async()=>{
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8')).filter(t=>t.organizer==='NECC');
 const entries=await enrich(rows.map(t=>({...t,status:'completed'})));
 const wrapper=({children})=>React.createElement('div',null,children);
 mocks.set('@/lib/session',{getSessionCached:async()=>({user:{id:'test'}})});
 mocks.set('@/lib/tournament-entries',{loadTournamentEntries:async()=>entries});
 mocks.set('@/components/dashboard/DashboardShell',{DashboardShell:wrapper});
 mocks.set('@/components/dashboard/bubbles/Bubble',{Bubble:wrapper});
 mocks.set('@/components/dashboard/tournaments/TournamentList',{TournamentCards:()=>null});
 try {
  const page=await load('@/app/series/page').default();
  const html=renderToStaticMarkup(page);
  assert.equal((html.match(/class="ff-serieslist__row"/g)??[]).length,0);
  assert.equal((html.match(/>Concluded</g)??[]).length,0);
 } finally {mocks.clear();}
});
test('all concluded NECC seasons render separately with valid profile links',async()=>{
 const {SeriesList}=load('@/components/dashboard/series/SeriesList');
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8')).filter(t=>t.organizer==='NECC');
 const tournaments=await enrich(rows.map(t=>({...t,status:'completed'})));
 const html=renderToStaticMarkup(React.createElement(SeriesList,{tournaments}));
 assert.equal((html.match(/class="ff-serieslist__row"/g)??[]).length,12);
 assert.equal((html.match(/>Concluded</g)??[]).length,12);
 assert.doesNotMatch(html,/>Upcoming</);
 assert.doesNotMatch(html,/318 tournaments/);
 assert.match(html,/68 tournaments/);
 assert.match(html,/NECC · Spring 2026/);
 assert.match(html,/NECC · Fall 2025/);
 for(const id of new Set(tournaments.map(t=>t.discovery.seriesId).filter(Boolean))) assert.ok(html.includes(encodeURIComponent(id)),id);
});
test('active leagues sort ahead of concluded groups and inferred singletons stay hidden',()=>{
 const {SeriesList}=load('@/components/dashboard/series/SeriesList');
 const t=(id,name,status)=>({id,name,status,startsAt:null,endsAt:null,discovery:{seriesId:id,seriesName:name}});
 const html=renderToStaticMarkup(React.createElement(SeriesList,{tournaments:[
  t('series:competition:old','A concluded league 2025','cancelled'),
  t('series:competition:new','Z active league 2026','active'),
  t('series:competition:startgg','start.gg archive 2025','completed'),
  t('series:competition:faceit','FACEIT archive 2025','completed'),
  t('series:competition:challonge','Challonge archive 2025','completed'),
  t('series:tournament:solo','Inferred singleton','completed'),
 ]}));
 assert.ok(html.indexOf('Z active league')<html.indexOf('A concluded league'));
 assert.match(html,/>Concluded</);
 assert.equal((html.match(/class="ff-serieslist__row"/g)??[]).length,5);
 assert.doesNotMatch(html,/Inferred singleton/);
});
test('start.gg series cards use competition names when the owner name is missing',async()=>{
 const {SeriesList}=load('@/components/dashboard/series/SeriesList');
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/provider-parents-3610.json'),'utf8')).filter(t=>t.organizerUrl?.endsWith('/8763a415'));
 const tournaments=await enrich(rows.map(t=>({...t,status:'completed'})));
 const html=renderToStaticMarkup(React.createElement(SeriesList,{tournaments}));
 assert.match(html,/Wednesday my Dudes/);
 assert.doesNotMatch(html,/>start.gg organizer/);
 assert.ok(tournaments.every(t=>t.discovery.providerParentId==='series:startgg:owner:8763a415'));
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
