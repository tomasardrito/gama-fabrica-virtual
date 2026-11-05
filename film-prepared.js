import {DbrBodySupply} from './dbr-upstream.js';

// Reference graph, rather than a JSON tree: routes and events share objects.
// Array properties such as frames.duration are needed by the original sampler.
export function encodeGraph(value){
 const nodes=[],seen=new Map();
 function encode(v,path='root'){
  if(v===undefined)return ['undefined'];
  if(Object.is(v,-0))return ['number','-0'];
  if(typeof v==='number'&&!Number.isFinite(v))return ['number',String(v)];
  if(typeof v==='function')throw new Error(`Cannot prepare function at ${path}`);
  if(v===null||typeof v!=='object')return v;
  if(seen.has(v))return ['ref',seen.get(v)];
  const id=nodes.length;seen.set(v,id);nodes.push(null);
  const type=v instanceof Map?'map':v instanceof Set?'set':Array.isArray(v)?'array':'object';
  const entries=type==='map'?[...v].map(([k,x])=>[encode(k,path),encode(x,path)]):type==='set'?[...v].map(x=>encode(x,path)):Object.entries(v).map(([k,x])=>[k,encode(x,`${path}.${k}`)]);
  nodes[id]={type,entries};return ['ref',id];
 }
 const root=encode(value);return {version:1,root,nodes};
}
export function decodeGraph(graph){
 if(graph.version!==1||!Array.isArray(graph.nodes))throw new Error('Unsupported prepared graph');
 const nodes=graph.nodes.map(n=>n.type==='map'?new Map():n.type==='set'?new Set():n.type==='array'?[]:{});
 function decode(v){
  if(!Array.isArray(v))return v;
  if(v[0]==='ref'){if(!nodes[v[1]])throw new Error('Invalid prepared reference');return nodes[v[1]];}
  if(v[0]==='undefined')return undefined;
  if(v[0]==='number')return Number(v[1]);
  throw new Error('Invalid prepared value');
 }
 graph.nodes.forEach((n,i)=>{for(const entry of n.entries){
  if(n.type==='map')nodes[i].set(decode(entry[0]),decode(entry[1]));
  else if(n.type==='set')nodes[i].add(decode(entry));
  else Object.defineProperty(nodes[i],entry[0],{value:decode(entry[1]),writable:true,enumerable:true,configurable:true});
 }});
 return decode(graph.root);
}
export function prepareSchedule(schedule){
 const {moveJob,toScreen,...bodySupply}=schedule.bodySupply;
 return encodeGraph({...schedule,bodySupply});
}
export function restoreSchedule(graph){
 const schedule=decodeGraph(graph);
 schedule.bodySupply=Object.assign(new DbrBodySupply(),schedule.bodySupply);
 validatePreparedSchedule(schedule);
 return schedule;
}
export const PREPARED_ABI='gama-operation-w2-1';
export function validatePreparedSchedule(schedule){
 const plan=schedule?.internalTransportPlan,audit=schedule?.internalAllocation?.audit;
 if(!schedule?.complete||!schedule.internalAllocation?.complete||!audit?.complete||plan?.missions?.length!==535)throw new Error('Incomplete prepared schedule');
 const ids=new Set();
 for(const m of plan.missions){
  if(ids.has(m.transfer.id)||!m.carrier?.id||!m.operator?.id||!Number.isFinite(m.start)||!Number.isFinite(m.end)||m.start>m.pickupStart||m.pickupStart>m.transfer.end||m.transfer.end>m.end)throw new Error('Invalid prepared mission/reservation');
  const a=schedule.internalAllocation.assignments?.find(a=>a.id===m.transfer.id),r=plan.operatorReservations?.find(r=>r.transferId===m.transfer.id);
  if(!a||!r||a.start!==m.start||a.end!==m.end||a.loadedEnd!==m.transfer.end||r.start!==m.start||r.end!==m.end||r.operatorId!==m.operator.id||r.carrierId!==m.carrier.id)throw new Error('Mismatched prepared reservations/audit');
  if(!m.segments?.length||Math.abs(m.segments[0].start-m.start)>1e-7||Math.abs(m.segments.at(-1).end-m.end)>1e-7)throw new Error('Incomplete prepared cycle');
  ids.add(m.transfer.id);
 }
 const expected=schedule.timeline.filter(e=>['lap>rosq','rosq>buffer','buffer>m1','m1>m2','m2>insp'].includes(`${e.from}>${e.to}`));
 if(expected.length!==535||expected.some(e=>!ids.has(e.id)))throw new Error('Incomplete prepared transfer coverage');
 if(new Set(plan.carriers.map(c=>c.id)).size!==5||plan.carriers.length!==5||schedule.trips.length!==38||schedule.trips.some(t=>!t.pallets))throw new Error('Incomplete prepared fleet/collections');
 return schedule;
}
const hex=buffer=>[...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
async function preparedResource(url,options){
 if(url.protocol==='file:'&&typeof process!=='undefined'&&process.versions?.node){
  const {readFile}=await import('node:fs/promises');
  try{return new Response(await readFile(url));}catch{return new Response('',{status:404});}
 }
 return fetch(url,options);
}
async function loadAsset(base,kind){
 const path=kind==='operation'?'preview':'demo';
 const response=await preparedResource(new URL(`dados/${path}-manifest.json`,base),{cache:'no-store'});
 if(!response.ok)throw new Error('Agenda ainda não preparada.');
 const manifest=await response.json();
 if(manifest.version!==2||manifest.abi!==PREPARED_ABI||manifest.kind!==kind)throw new Error('Formato de agenda incompatível.');
 const required=kind==='operation'?['conveyor-traffic.js','dbr-conveyors.js','dbr-layout.js','dbr-upstream.js','film-excel.js','internal-layout.js','logistics-layout.js','logistics-metrics.js','logistics-motion.js','mps-simulation.js','transport-routes.js','truck-rear.js','vendor/three.core.js','vendor/three.module.js','dbr-simulation.js','dbr-handling.js','dbr-timing.js','dbr-presentation.js','internal-motion.js','film-prepared.js','dados/PCPIII-Case-GAMA-completo.xlsx']:['film-demo-plan.js','film-actors.js','internal-motion.js'];
 if(!manifest.sources||required.some(p=>!manifest.sources[p]))throw new Error('Manifesto incompleto.');
 await Promise.all(Object.entries(manifest.sources).map(async([path,expected])=>{
  const r=await preparedResource(new URL(path,base),{cache:'no-store'});
  if(!r.ok||hex(await crypto.subtle.digest('SHA-256',await r.arrayBuffer()))!==expected)throw new Error(`Agenda desatualizada: ${path}`);
 }));
 const r=await preparedResource(new URL(`dados/${path}-agenda.json.gz`,base));
 if(!r.ok)throw new Error('Não foi possível carregar a agenda.');
 const compressed=await r.arrayBuffer();
 if(hex(await crypto.subtle.digest('SHA-256',compressed))!==manifest.assetHash)throw new Error('Agenda incompleta.');
 const json=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
 return {manifest,value:kind==='operation'?restoreSchedule(json):decodeGraph(json)};
}
export async function loadPreparedPreview(base=new URL('.',import.meta.url)){
 const {manifest,value:schedule}=await loadAsset(base,'operation');return {manifest,schedule};
}
export async function loadPreparedFilm(base=new URL('.',import.meta.url)){
 const [{manifest,schedule},{value:demonstration}]=await Promise.all([loadPreparedPreview(base),loadAsset(base,'demonstration')]);
 if(demonstration?.plan?.missions?.length!==1||demonstration.plan.missions[0].transfer.lotId!=='DEMO-PALLET'||demonstration.sourceStart!==79||demonstration.sourceEnd!==94.6)throw new Error('Demonstração incompleta.');
 return {manifest,schedule,demonstration};
}
