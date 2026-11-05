import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('operational timing is independent of editorial direction',async()=>{
 const {OPERATION_TIMING}=await import('../dbr-timing.js');
 assert.equal(OPERATION_TIMING.productionStart,135);
 assert.equal(OPERATION_TIMING.productionEnd,510);
 assert.equal(OPERATION_TIMING.weekSeconds,46.875);
 for(const name of ['dbr-simulation.js','dbr-handling.js'])assert.ok(!(await readFile(new URL('../'+name,import.meta.url),'utf8')).includes('./film-story.js'));
});

test('buffer arrivals physically coincide with the industrial anchor',async()=>{
 const {gunzipSync}=await import('node:zlib');
 const {restoreSchedule}=await import('../film-prepared.js');
 const {DbrSimulation}=await import('../dbr-simulation.js');
 const {sampleDbrHandling}=await import('../dbr-handling.js');
 const schedule=restoreSchedule(JSON.parse(gunzipSync(await readFile(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
 const engine=new DbrSimulation({preparedSchedule:schedule});
 const points=new Set(Array.from({length:1201},(_,i)=>i*.5));
 for(const lot of schedule.lots)for(const at of [lot.bufferEnteredAt,lot.bufferReleasedAt])if(Number.isFinite(at))for(const d of [-1e-7,0,1e-7])if(at+d>=0&&at+d<=600)points.add(at+d);
 for(const time of points){
  const snapshot=engine.seek(time),handling=sampleDbrHandling(snapshot);
  assert.ok(Math.abs([...handling.bufferPallets.values()].reduce((n,p)=>n+p.quantity,0)-snapshot.buffer.units)<1e-5,`Physical buffer at ${time}`);
 }
 for(const m of schedule.internalTransportPlan.missions.filter(m=>m.transfer.to==='buffer')){
  const lot=schedule.lots.find(l=>l.id===m.transfer.lotId);
  assert.ok(Math.abs(m.transfer.end-lot.bufferEnteredAt)<1e-8,m.transfer.id);
  assert.deepEqual(sampleDbrHandling(engine.seek(m.transfer.end)).loads.get(lot.id).position,m.transfer.toPosition);
 }
});

test('prepared loader rejects incompatible manifests without planning',async()=>{
 const {loadPreparedFilm}=await import('../film-prepared.js');
 const old=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({version:1,sources:{}});
  await assert.rejects(loadPreparedFilm(new URL('http://prepared.test/')),/incompatível/);
  globalThis.fetch=async()=>Response.json({version:2,abi:'gama-operation-w2-1',kind:'operation',sources:{}});
  const {loadPreparedPreview}=await import('../film-prepared.js');
  await assert.rejects(loadPreparedPreview(new URL('http://prepared.test/')),/incompleto/);
 }finally{globalThis.fetch=old;}
});

test('prepared graph rejects incomplete mission identities and missing audit',async()=>{
 const {validatePreparedSchedule}=await import('../film-prepared.js');
 assert.throws(()=>validatePreparedSchedule({complete:true}),/Incomplete/);
 const {restoreSchedule}=await import('../film-prepared.js'),{gunzipSync}=await import('node:zlib');
 const schedule=restoreSchedule(JSON.parse(gunzipSync(await readFile(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
 schedule.internalTransportPlan.operatorReservations[0].end+=.01;
 assert.throws(()=>validatePreparedSchedule(schedule),/Mismatched/);
});

test('operation and demonstration assets are independently hashed and load without route compilation',async()=>{
 const {loadPreparedFilm}=await import('../film-prepared.js');
 const {createHash}=await import('node:crypto');
 const root=new URL('../',import.meta.url),old=globalThis.fetch;
 try{
  globalThis.fetch=async url=>{
   const path=new URL(url).pathname.slice(1);
   try{return new Response(await readFile(new URL(path,root)));}catch{return new Response('',{status:404});}
  };
  const loaded=await loadPreparedFilm(new URL('http://prepared.test/'));
  assert.equal(loaded.schedule.internalTransportPlan.missions.length,535);
  assert.equal(loaded.demonstration.plan.missions[0].transfer.lotId,'DEMO-PALLET');
  assert.ok(!loaded.manifest.sources['film-story.js']);assert.ok(!loaded.manifest.sources['film-dialogue.js']);
  const manifest=loaded.manifest;
  globalThis.fetch=async url=>new URL(url).pathname.endsWith('preview-manifest.json')?Response.json({...manifest,assetHash:'0'.repeat(64)}):new Response(await readFile(new URL(new URL(url).pathname.slice(1),root)));
  const {loadPreparedPreview}=await import('../film-prepared.js');
  await assert.rejects(loadPreparedPreview(new URL('http://prepared.test/')),/incompleta/);
  globalThis.fetch=async url=>new URL(url).pathname.endsWith('preview-manifest.json')?Response.json({...manifest,sources:{...manifest.sources,'dbr-simulation.js':'0'.repeat(64)}}):new Response(await readFile(new URL(new URL(url).pathname.slice(1),root)));
  await assert.rejects(loadPreparedPreview(new URL('http://prepared.test/')),/desatualizada/);
  assert.equal(createHash('sha256').update(await readFile(new URL('dados/preview-agenda.json.gz',root))).digest('hex'),manifest.assetHash);
 }finally{globalThis.fetch=old;}
});

test('loaded paths, connectors and bay geometry preserve the approved baseline fingerprint',async()=>{
 const {gunzipSync}=await import('node:zlib'),{createHash}=await import('node:crypto'),{restoreSchedule}=await import('../film-prepared.js');
 const s=restoreSchedule(JSON.parse(gunzipSync(await readFile(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
 const rows=[...s.timeline.filter(e=>e.kind==='transfer'),...s.componentTransfers].map(e=>({id:e.id,route:e.route,fromPosition:e.fromPosition,toPosition:e.toPosition})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),'0f5b5b2dc8eb223c06d0c870171198f6848159e09cbdab332a12cd38c9a61bd6');
 const connectors=[...s.timeline.filter(e=>e.kind==='transfer'),...s.componentTransfers].map(e=>({id:e.id,approachRoute:e.approachRoute,returnRoute:e.returnRoute})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.equal(createHash('sha256').update(JSON.stringify(connectors)).digest('hex'),'47163ab8679490eb0c72e6e5a5dc5d558cca4d1c5226df7638b3188054100ffa');
});

test('Node loads the same verified prepared asset through a file URL',async()=>{
 const {loadPreparedPreview}=await import('../film-prepared.js');
 const {schedule}=await loadPreparedPreview(new URL('../',import.meta.url));
 assert.equal(schedule.internalTransportPlan.missions.length,535);
});

test('legacy audit constructors can share a validated prepared schedule',async()=>{
 const {installPreparedSchedule,DbrSimulation}=await import('../dbr-simulation.js');
 const {restoreSchedule}=await import('../film-prepared.js'),{gunzipSync}=await import('node:zlib');
 assert.throws(()=>installPreparedSchedule({}),/Incomplete/);
 const schedule=restoreSchedule(JSON.parse(gunzipSync(await readFile(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
 installPreparedSchedule(schedule);assert.equal(new DbrSimulation().schedule,schedule);
});


test('graph codec retains reference identity, metadata and numeric sentinels',async()=>{
 const {encodeGraph,decodeGraph}=await import('../film-prepared.js');
 const frames=[{at:0},{at:1}];frames.duration=3;
 const source={frames,alias:frames,map:new Map(),set:new Set([frames]),positive:Infinity,negative:-Infinity,zero:-0};source.map.set(frames,source);
 const copy=decodeGraph(JSON.parse(JSON.stringify(encodeGraph(source))));
 assert.equal(copy.frames,copy.alias);assert.equal(copy.frames.duration,3);assert.equal(copy.map.get(copy.frames),copy);assert.ok(copy.set.has(copy.frames));
 assert.equal(copy.positive,Infinity);assert.equal(copy.negative,-Infinity);assert.ok(Object.is(copy.zero,-0));
});
