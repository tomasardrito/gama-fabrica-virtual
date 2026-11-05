import {readFile,writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {DbrSimulation} from '../dbr-simulation.js';
import {reconcileFixedRoutes} from '../dbr-presentation.js';
import {prepareSchedule,restoreSchedule,encodeGraph,PREPARED_ABI} from '../film-prepared.js';
import {prepareDemonstration} from '../film-demo-plan.js';
import {sampleDbrHandling} from '../dbr-handling.js';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const reuse=process.argv.includes('--reuse')||process.argv.includes('--demo-only');
const argument=name=>{const i=process.argv.indexOf(name);if(i<0)return null;if(!process.argv[i+1])throw new Error(`Missing ${name} path`);return process.argv[i+1];};
const candidatePath=argument('--validated-candidate')??(!reuse&&!process.argv.includes('--compile')?new URL('dados/preview-agenda.json.gz',root):null);
async function fingerprints(roots){
 const names=new Set();
 async function visit(name){
  if(names.has(name))return;names.add(name);
  const code=await readFile(new URL(name,root),'utf8');
  for(const m of code.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+\.js)['"]/g))await visit(new URL(m[1],new URL(name,root)).href.slice(root.href.length));
 }
 for(const r of roots)await visit(r);
 names.add('dados/PCPIII-Case-GAMA-completo.xlsx');
 return Object.fromEntries(await Promise.all([...names].sort().map(async n=>[n,hash(await readFile(new URL(n,root)))])));
}
const sources=await fingerprints(['dbr-simulation.js','dbr-handling.js','film-prepared.js']);
const asset=new URL('dados/preview-agenda.json.gz',root);
let schedule;
if(reuse){
 const manifest=JSON.parse(await readFile(new URL('dados/preview-manifest.json',root)));
 assert.equal(manifest.abi,PREPARED_ABI,'Cannot reuse incompatible agenda');
 assert.deepEqual(manifest.sources,sources,'Cannot reuse stale agenda');
 const bytes=await readFile(asset);assert.equal(hash(bytes),manifest.assetHash);
 schedule=restoreSchedule(JSON.parse(gunzipSync(bytes)));
}else{
 console.log('Auditing and preparing operational agenda');
 if(candidatePath){
  const candidate=restoreSchedule(JSON.parse(gunzipSync(await readFile(candidatePath))));
  schedule=reconcileFixedRoutes(candidate,candidate.internalTransportPlan,candidate.internalAllocation.policy);

 }else{
  try{schedule=new DbrSimulation({onOperationalCandidate:({schedule,plan,policy})=>writeFileSync('/tmp/gama-a2-operation-candidate.json.gz',gzipSync(JSON.stringify(prepareSchedule({...schedule,internalTransportPlan:plan,candidatePolicy:policy})),{level:6}))}).schedule;}catch(error){if(error.cases)await writeFile('/tmp/gama-a2-unallocated.json',JSON.stringify(error.cases,null,2));throw error;}
 }
  const byId=rows=>rows.sort((a,b)=>a[0].localeCompare(b[0]));
  const data={
    timeline:byId(schedule.timeline.map(e=>[e.id,e.lotId,e.kind,e.station,e.quantity,e.startHours,e.endHours])),
    lots:byId(schedule.lots.map(l=>[l.id,l.product,l.week,l.quantity,l.dueHours,l.releasedHours,l.inspectionHours,l.shippedHours])),
    buffer:schedule.bufferLedger,
    collections:byId(schedule.trips.map(t=>[t.id,t.week,t.scheduledHours,t.departHours,[...t.lotIds].sort()]))
  };
  const expected={
    timeline:'e7619954fd78eed8d3a9cef3802aa9bae03c34ec2215dd8db2d0a72dfc5ab36a',
    lots:'09b951eb6c518956bfc27db08c9368f1b9dbd4a7a50a5b0b24034fbc28255fe6',
    buffer:'ade774bcf14b3111ae55a58be49691e7e1fdb22da32130fcb588c2c5af4ee20b',
    collections:'cd5d50036c3dc32e59c770a387ecd6dc7579820303095703fed4cb55dfab1fb6'
  };
  assert.equal(schedule.complete,true);
  for(const [key,value]of Object.entries(data))assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'),expected[key],key);
 const bytes=gzipSync(JSON.stringify(prepareSchedule(schedule)),{level:6});
 const restored=restoreSchedule(JSON.parse(gunzipSync(bytes)));
 const original=new DbrSimulation({preparedSchedule:schedule}),copy=new DbrSimulation({preparedSchedule:restored});
 const points=new Set(Array.from({length:1201},(_,i)=>i*.5));
 for(const e of schedule.timeline)for(const t of [e.start,e.end,e.pickupStart,e.loadedEnd])if(Number.isFinite(t))for(const d of [-1e-7,0,1e-7])if(t+d>=0&&t+d<=600)points.add(t+d);
 for(const t of [...points].sort((a,b)=>a-b)){
  const a=original.seek(t),b=copy.seek(t);for(const key of ['elapsed','duration','shipped','completed','backlog','buffer','products','upstream','dbr'])assert.deepEqual(b[key],a[key],`Snapshot ${key} parity ${t}`);
  const x=sampleDbrHandling(a),y=sampleDbrHandling(b);assert.deepEqual(y,x,`Handling parity ${t}`);
  const physical=[...x.bufferPallets.values()].reduce((n,p)=>n+p.quantity,0);
  assert.ok(Math.abs(physical-a.buffer.units)<1e-5,`Physical buffer at ${t}: ${physical}/${a.buffer.units}`);
  assert.equal(a.backlog,0);assert.ok(a.buffer.units>=1250);
 }
 assert.equal(original.seek(600).shipped,44825);
 await writeFile(asset,bytes);
 await writeFile(new URL('dados/preview-manifest.json',root),JSON.stringify({version:2,abi:PREPARED_ABI,kind:'operation',sources,assetHash:hash(bytes),checks:{points:points.size,missions:535,shipped:44825,duration:600,audit:schedule.internalAllocation.audit.complete}},null,2)+'\n');
 console.log(`Operational parity passed at ${points.size} points`);
}
const demonstration=prepareDemonstration(schedule),demoBytes=gzipSync(JSON.stringify(encodeGraph(demonstration)),{level:6});
await writeFile(new URL('dados/demo-agenda.json.gz',root),demoBytes);
await writeFile(new URL('dados/demo-manifest.json',root),JSON.stringify({version:2,abi:PREPARED_ABI,kind:'demonstration',sources:await fingerprints(['film-demo-plan.js']),assetHash:hash(demoBytes)},null,2)+'\n');
console.log('Prepared demonstration; no editorial selection is stored in operational assets');
