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
test('Series page passes LeagueOS imports into its grouped list',async()=>{
 const {leagueosSeries}=load('@/lib/discovery-shared');
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8'));
 const entries=rows.map(t=>{
  const parent=leagueosSeries(t);
  return {...t,status:'completed',discovery:{seriesId:parent.id,seriesName:parent.name}};
 });
 const wrapper=({children})=>React.createElement('div',null,children);
 mocks.set('@/lib/session',{getSessionCached:async()=>({user:{id:'test'}})});
 mocks.set('@/lib/tournament-entries',{loadTournamentEntries:async()=>entries});
 mocks.set('@/components/dashboard/DashboardShell',{DashboardShell:wrapper});
 mocks.set('@/components/dashboard/bubbles/Bubble',{Bubble:wrapper});
 mocks.set('@/components/dashboard/tournaments/TournamentList',{TournamentCards:()=>null});
 try {
  const page=await load('@/app/series/page').default();
  const html=renderToStaticMarkup(page);
  assert.equal((html.match(/class="ff-serieslist__row"/g)??[]).length,58);
  assert.equal((html.match(/>Concluded</g)??[]).length,58);
 } finally {mocks.clear();}
});
test('the entire imported corpus remains browsable when every league is concluded',()=>{
 const {leagueosSeries}=load('@/lib/discovery-shared');
 const {SeriesList}=load('@/components/dashboard/series/SeriesList');
 const rows=JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8'));
 const tournaments=rows.map(t=>{
  const parent=leagueosSeries(t);
  return {...t,status:'completed',discovery:{seriesId:parent.id,seriesName:parent.name}};
 });
 const html=renderToStaticMarkup(React.createElement(SeriesList,{tournaments}));
 assert.equal((html.match(/class="ff-serieslist__row"/g)??[]).length,58);
 assert.equal((html.match(/>Concluded</g)??[]).length,58);
 assert.doesNotMatch(html,/>Upcoming</);
 assert.match(html,/318 tournaments/);
 const parents=new Set(tournaments.map(t=>t.discovery.seriesId));
 for(const id of parents) assert.ok(html.includes(encodeURIComponent(id)),id);
});
test('active leagues sort ahead of concluded groups and inferred singletons stay hidden',()=>{
 const {SeriesList}=load('@/components/dashboard/series/SeriesList');
 const t=(id,name,status)=>({id,name,status,startsAt:null,endsAt:null,discovery:{seriesId:id,seriesName:name}});
 const html=renderToStaticMarkup(React.createElement(SeriesList,{tournaments:[
  t('series:leagueos:old','A concluded league','cancelled'),
  t('series:leagueos:new','Z active league','active'),
  t('series:startgg:owner:example','start.gg owner archive','completed'),
  t('series:faceit:organizer:example','FACEIT organizer archive','completed'),
  t('series:challonge:community:example','Challonge community archive','completed'),
  t('series:tournament:solo','Inferred singleton','completed'),
 ]}));
 assert.ok(html.indexOf('Z active league')<html.indexOf('A concluded league'));
 assert.match(html,/>Concluded</);
 assert.equal((html.match(/class="ff-serieslist__row"/g)??[]).length,5);
 assert.doesNotMatch(html,/Inferred singleton/);
});
test('LeagueOS parent renders as one league with a profile link',()=>{
 const {leagueosSeries}=load('@/lib/discovery-shared');
 const {SeriesList}=load('@/components/dashboard/series/SeriesList');
 const tournaments=['OW','VAL'].map((game,i)=>{
  const t={id:`leagueos:necc:event${i}`,source:'leagueos',sourceTournamentId:`necc:event${i}`,name:`Spring 2026 - ${game} | Division I`,game:i?'VALORANT':'Overwatch',organizer:'NECC',startsAt:1770000000000,endsAt:null,featured:false,status:'active'};
  const series=leagueosSeries(t);
  return {...t,discovery:{seriesId:series.id,seriesName:series.name}};
 });
 const html=renderToStaticMarkup(React.createElement(SeriesList,{tournaments}));
 assert.match(html,/NECC/);
 assert.match(html,/1 leagues &amp; series/);
 assert.match(html,/series%3Aleagueos%3Anecc/);
 assert.match(html,/Overwatch/);
 assert.match(html,/VALORANT/);
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
test('LeagueOS provider uses supplied logo and stays off general surfaces',()=>{
 const {sourceKey,SourceLogo}=load('@/components/brand/SourceLogo');
 assert.equal(sourceKey('leagueos'),'leagueos');
 const html=renderToStaticMarkup(React.createElement(SourceLogo,{source:'leagueos'}));
 assert.match(html,/\/brand\/sources\/leagueos.svg/);assert.match(html,/aria-label="LeagueOS"/);
 const {withoutDiscordSourced}=load('@/lib/tournaments-shared');
 assert.equal(withoutDiscordSourced([{source:'leagueos'},{source:'discord'},{source:'faceit'}]).map(t=>t.source).join(','),'faceit');
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
