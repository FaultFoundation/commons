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
function load(name, parent=root) {
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
