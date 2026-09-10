import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..'), require=createRequire(import.meta.url), modules=new Map();
function load(id) {
 if(id==='react') return {cache:f=>f};
 if(id==='@/db/schema') return {};
 if(id==='@/lib/db') return {getDb:()=>({select:()=>({from:()=>({})}),batch:async()=>[[],[],[]]})};
 if(!id.startsWith('@/')) return require(id);
 if(modules.has(id))return modules.get(id);
 const exports={};modules.set(id,exports);
 const code=ts.transpileModule(readFileSync(resolve(root,id.slice(2)+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,require:load,console,URL,Date});return exports;
}
// Pass a read-only D1 JSON query result or the checked-in public fixture.
const input=process.argv[2];
const raw=input?JSON.parse(readFileSync(input,'utf8')):[...JSON.parse(readFileSync(resolve(root,'scripts/fixtures/leagueos-series-1100.json'),'utf8')),...JSON.parse(readFileSync(resolve(root,'scripts/fixtures/provider-parents-3610.json'),'utf8'))];
const rows=(raw[0]?.results??raw).map(t=>({...t,sourceTournamentId:t.sourceTournamentId??t.source_tournament_id,organizerUrl:t.organizerUrl??t.organizer_url,startsAt:t.startsAt??t.start_at??null,featured:false}));
const entries=await load('@/lib/discovery').enrichDiscovery(rows);
const groups=new Map();
for(const t of entries)if(t.discovery.seriesId){const group=groups.get(t.discovery.seriesId)??{id:t.discovery.seriesId,name:t.discovery.seriesName,parent:t.discovery.providerParentId,organizer:t.organizer,count:0,games:new Set(),titles:[]};group.count++;group.games.add(t.game);group.titles.push(t.name);groups.set(group.id,group);}
const report={total:entries.length,bySource:Object.fromEntries([...new Set(entries.map(t=>t.source))].map(source=>{const rs=entries.filter(t=>t.source===source);return[source,{total:rs.length,withParent:rs.filter(t=>t.discovery.providerParentId).length,withSeries:rs.filter(t=>t.discovery.seriesId).length,series:new Set(rs.map(t=>t.discovery.seriesId).filter(Boolean)).size}]})),groups:[...groups.values()].map(g=>({...g,games:[...g.games]})),unassigned:entries.filter(t=>!t.discovery.seriesId).map(t=>({id:t.id,name:t.name,organizer:t.organizer,parent:t.discovery.providerParentId}))};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,bySource:report.bySource,necc:report.groups.filter(g=>g.organizer==='NECC').map(({name,count,games})=>({name,count,games}))},null,2));
