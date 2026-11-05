import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {restoreSchedule} from '../film-prepared.js';
const preparedSchedule=restoreSchedule(JSON.parse(gunzipSync(fs.readFileSync(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
import test from 'node:test';
import assert from 'node:assert/strict';
import {FactoryFilm} from '../factory-film.js';
import {sampleDbrHandling} from '../dbr-handling.js';
import {FILM_TIMING as T,STORY_WINDOWS} from '../film-story.js';
import * as THREE from '../vendor/three.module.js';
import {selectCameraEvent,physicalSector,cameraFlowBoundaries} from '../film-camera.js';
const film=new FactoryFilm({preparedSchedule}), E=1e-5;

test('W2 weekly coverage includes the complete visible flow without legacy time quotas',()=>{
 const all=new Set();for(let w=0;w<8;w++){
  const lo=film.plan.clock.inverse(135+w*46.875),hi=film.plan.clock.inverse(135+(w+1)*46.875),seen=new Set();
  for(const c of film.plan.cues.filter(c=>c.t<hi&&c.t+c.duration>lo)){for(const id of c.visibleSectors||[c.sector]){seen.add(id);all.add(id);}}
  assert.ok(seen.size>=5,`S${w+1}: ${[...seen]}`);
 }
 for(const id of ['torno','us1','us2','m2','insp','components'])assert.ok(all.has(id),id);
 assert.ok(film.plan.cues.some(c=>c.transportId));
});

test('every speech holds the actual speaker, including during maintenance',()=>{
 for(const speech of film.plan.story.speeches)for(let t=speech.start+.01;t<speech.end;t+=.2){
  const s=film.seekPresentation(t);assert.equal(s.film.shot.speaker,speech.speaker,speech.id);
  // Ato 1 keeps one fixed composition of the meeting room (speaker shown by the ring).
  // The plano-sequência stays on the tracked pallet while its speeches play.
  if(['plano-sequencia','sequencia-quebra'].includes(s.film.shot.type)||s.film.shot.visualId)continue;
  if(s.film.shot.type==='geral-sala'){assert.ok(Math.hypot(...s.film.actors[speech.speaker].position.map((v,i)=>v-s.film.shot.position[i]))<s.film.shot.span/2,speech.id);continue;}
  if(!s.film.shot.tripId)assert.deepEqual(s.film.shot.position,s.film.actors[speech.speaker].position,speech.id);
 }
});

test('tracked shots point at the physical load and never leave during a followed transfer',()=>{
 let followed=0;
 for(const c of film.plan.cues.filter(c=>c.target==='tracked')){
  followed++;
  for(let t=c.t+.001;t<c.t+c.duration;t+=.1){
   const s=film.seekPresentation(t),load=sampleDbrHandling(s).loads.get(film.plan.trackedLotId);
   assert.ok(load);assert.deepEqual(s.film.shot.position,load.position);
  }
  const end=c.t+c.duration,next=film.plan.cues.find(x=>Math.abs(x.t-end)<E);
  if(next?.target!=='tracked')assert.ok(film.plan.clock.sample(end).sourceTime>=film.plan.selection.mission.transfer.end-E);
 }
 assert.ok(followed>0);
});

test('truck timing supplied by logistics survives the film adapter',()=>{
 const f=new FactoryFilm({preparedSchedule}),original=f.engine.snapshot.bind(f.engine);
 f.engine.snapshot=()=>({...original(),trips:[{id:'timed',lotIds:[],departAt:510,rearOpenSeconds:2.3,departureSeconds:4.2,exitAt:519}]});
 const s=f.seek(518);assert.equal(s.trips[0].rearOpenSeconds,2.3);assert.equal(s.trips[0].departureSeconds,4.2);assert.equal(s.animationTime,518);
});

test('camera rig eases once per shot and applies height and projection',async()=>{
 const {createFilmCameraRig}=await import('../camera-rig.js');
 const camera=new THREE.OrthographicCamera(-25,25,25,-25,.1,200),rig=createFilmCameraRig({camera});
 const a={id:'a',position:[0,0],span:40,orbit:0,cameraHeight:35,transitionSeconds:1.2};
 rig.direct(a);rig.update({elapsed:0,dt:0,width:1000,height:500});
 assert.equal(camera.position.y,35);
 const b={...a,id:'b',position:[12,0],span:20,cameraHeight:5};
 rig.direct(b);rig.update({elapsed:1,dt:.1,width:1000,height:500});
 rig.direct(b);rig.update({elapsed:1.6,dt:.1,width:1000,height:500});
 assert.ok(Math.abs(camera.position.y-20)<E);assert.ok(Math.abs(camera.position.x-6)<E);
 rig.direct(b);rig.update({elapsed:2.2,dt:.1,width:1000,height:500});
 assert.ok(Math.abs(camera.position.y-5)<E);assert.ok(Math.abs(camera.right-10)<E);assert.ok(Math.abs(camera.top-5)<E);
 rig.reset();rig.direct(a);rig.update({elapsed:0,dt:0,width:1456,height:829});assert.equal(camera.position.y,35);
});


test('W2 cue sheet covers 600 seconds and preserves uninterrupted highlighted cycles',()=>{
 let end=0;for(const c of film.plan.cues){assert.ok(Math.abs(c.t-end)<E);end=c.t+c.duration;assert.ok(c.transitionSeconds>=1&&c.transitionSeconds<=1.5);}assert.equal(end,600);
 const m=film.plan.selection.mission,c=film.plan.cues.find(c=>c.transportId===m.transfer.id);
 assert.ok(c.t<=film.plan.clock.inverse(m.pickupStart));assert.ok(c.t+c.duration>=film.plan.clock.inverse(m.transfer.end));
 const truck=film.plan.selection.truck,takes=film.plan.cues.filter(c=>c.tripId===truck.id);
 assert.ok(takes[0].t<=film.plan.clock.inverse(truck.arrivalAt));assert.ok(takes.at(-1).t+takes.at(-1).duration>=film.plan.clock.inverse(truck.exitAt));
 for(let i=1;i<takes.length;i++)assert.ok(Math.abs(takes[i].t-(takes[i-1].t+takes[i-1].duration))<E,'truck follow interrupted');
});

test('priority selection is ordered, expires stale events and consumes each event once',()=>{
 const events=[{id:'collect',t:10,expiresAt:20,priority:1},{id:'replenish',t:10,expiresAt:20,priority:2},
  {id:'yellow',t:10,expiresAt:20,priority:3},{id:'break',t:10,expiresAt:20,priority:4}];
 const used=new Set();for(const id of ['break','yellow','replenish','collect']){
  assert.equal(selectCameraEvent(events,11,used)?.id,id);used.add(id);
 }
 assert.equal(selectCameraEvent(events,11,used),null);assert.equal(selectCameraEvent(events,20),null);
 assert.equal(physicalSector({stage:'transport',from:'m1',to:'m2'}),'internal-transport');
 assert.equal(physicalSector({stage:'truck'}),'dispatch');
 const seen=new Set();for(const c of film.plan.cues.filter(c=>c.eventId)){
  assert.ok(!seen.has(c.eventId));seen.add(c.eventId);
 }
});

test('camera transitions are frame-rate independent and follow moving shot positions without restarting',async()=>{
 const {createFilmCameraRig}=await import('../camera-rig.js');
 function run(step){
  const camera=new THREE.OrthographicCamera(-25,25,25,-25,.1,200),rig=createFilmCameraRig({camera});
  rig.direct({id:'initial',position:[0,0],span:40});rig.update({elapsed:0,width:1000,height:500});
  for(let i=0;i<=Math.round(1.2/step);i++){
   const elapsed=step*i;rig.direct({id:'moving',position:[10+elapsed,0],span:20,cameraHeight:10});
   rig.update({elapsed,dt:step,width:1000,height:500});
  }
  return camera.position.toArray();
 }
 const a=run(1/30),b=run(1/60);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<E));
});


test('W2 demonstration keeps the industrial clock stopped and publishes prepared source time',()=>{
 const [start,end]=STORY_WINDOWS.demonstration;
 for(const t of [start-.01,start,start+6,end-.01,end]){const s=film.seekPresentation(t),active=t>=start&&t<end;assert.equal(Boolean(s.film.demonstration),active);if(active){assert.equal(s.dbr.workHours,0);assert.equal(s.shipped,0);assert.ok(s.film.demonstration.sourceTime>=79&&s.film.demonstration.sourceTime<94.6);assert.equal(s.film.shot.span,32);}}
});
