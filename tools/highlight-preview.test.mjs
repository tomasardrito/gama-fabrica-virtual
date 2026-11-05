import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPreviewHighlights} from '../film-highlights.js';
import {createTimeMap} from '../film-time-map.js';
import {encodeGraph,decodeGraph} from '../film-prepared.js';
import {restoreSchedule} from '../film-prepared.js';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {FactoryFilm} from '../factory-film.js';
import {sampleDbrHandling} from '../dbr-handling.js';

test('one continuous clock preserves event order through slow and fast shots',()=>{
 const clock=createTimeMap([{id:'aerial',from:135,to:180,duration:5},{id:'delivery',from:180,to:180.2,duration:12},{id:'aerial-2',from:180.2,to:400,duration:8}]);
 assert.equal(clock.duration,25);
 assert.equal(clock.sample(5).sourceTime,180);
 assert.equal(clock.sample(11).sourceTime,180.1);
 assert.equal(clock.sample(17).sourceTime,180.2);
 assert.equal(clock.sample(-1).sourceTime,135);
 assert.equal(clock.sample(100).sourceTime,400);
 let previous=135;
 for(let t=0;t<=25;t+=.01){const now=clock.sample(t).sourceTime;assert.ok(now>=previous);previous=now;}
 assert.throws(()=>createTimeMap([{from:1,to:2,duration:3},{from:3,to:4,duration:3}]),/continuous/);
 assert.throws(()=>createTimeMap([{from:2,to:1,duration:3}]),/positive/);
});

test('prepared preview uses the actual route, native loaded duration and unchanged industry',async()=>{
 const root=new URL('../',import.meta.url),operationalManifest=JSON.parse(await readFile(new URL('dados/preview-manifest.json',root))),bytes=await readFile(new URL('dados/preview-agenda.json.gz',root));
 const hash=data=>createHash('sha256').update(data).digest('hex');
 assert.equal(hash(bytes),operationalManifest.assetHash);
 for(const [name,expected]of Object.entries(operationalManifest.sources))assert.equal(hash(await readFile(new URL(name,root))),expected,`Stale source: ${name}`);
 const film=new FactoryFilm({preparedSchedule:restoreSchedule(JSON.parse(gunzipSync(bytes)))}),manifest=selectPreviewHighlights(film.schedule),clock=createTimeMap(manifest.segments);
 const selected=film.schedule.internalTransportPlan.missions.find(m=>m.transfer.id===manifest.mission.id),jack=clock.segments.find(s=>s.id==='jack');
 assert.equal(jack.duration,selected.request.loaded);assert.equal(jack.from,selected.pickupStart);assert.equal(jack.to,selected.transfer.end);
 assert.equal(film.schedule.internalTransportPlan.missions.length,535);assert.equal(clock.duration,90);
 const points=[];
 for(let i=0;i<=30;i++){
  const t=clock.sample(jack.start+jack.duration*i/30).sourceTime,h=sampleDbrHandling(film.seek(t));
  const load=h.loads.get(selected.transfer.lotId),carrier=h.carriers.find(c=>c.id===selected.carrier.id);
  assert.equal(load.carrierId,carrier.id);assert.deepEqual(load.position,carrier.position);points.push(load.position);
 }
 assert.deepEqual(points[0],selected.transfer.fromPosition);assert.deepEqual(points.at(-1),selected.transfer.toPosition);
 let minimum=Infinity;
 for(let t=0;t<=600;t+=.5){const s=film.engine.seek(t);assert.equal(s.backlog,0);minimum=Math.min(minimum,s.buffer.units);}
 assert.ok(minimum>=1250);assert.equal(film.seek(600).shipped,44825);assert.equal(film.seek(600).duration,600);
 assert.equal(film.plan.story.speeches.length,30);assert.ok(film.schedule.trips.every(t=>t.pallets>0));
});

test('prepared graph preserves aliases, cycles, Maps, Sets and frame metadata',()=>{
 const frames=[{t:0,point:[1,2]},{t:2,point:[3,4]}];frames.duration=2;
 const value={frames,alias:frames,map:new Map(),set:new Set([frames]),missing:undefined,min:-Infinity,max:Infinity,zero:-0};
 value.map.set('owner',value);value.map.set(frames,'frames');
 const restored=decodeGraph(JSON.parse(JSON.stringify(encodeGraph(value))));
 assert.deepEqual(restored.frames,frames);assert.equal(restored.alias,restored.frames);
 assert.equal(restored.map.get('owner'),restored);assert.equal(restored.map.get(restored.frames),'frames');
 assert.ok(restored.set.has(restored.frames));assert.equal(restored.min,-Infinity);assert.equal(restored.max,Infinity);
 assert.ok(Object.hasOwn(restored,'missing'));assert.equal(restored.missing,undefined);assert.equal(restored.zero,-0);
 assert.throws(()=>encodeGraph({run(){}}),/function/);
});
