import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {restoreSchedule} from '../film-prepared.js';
import {FactoryFilm} from '../factory-film.js';
import {sampleDbrHandling} from '../dbr-handling.js';
import {LOGISTICS_LAYOUT} from '../logistics-layout.js';
import {STORY_WINDOWS,FILM_STORY} from '../film-story.js';
import {DBR_LAYOUT,dbrWorkStand} from '../dbr-layout.js';
import {sampleFilmActors} from '../film-actors.js';
import * as cinematic from '../factory-cinematic.js';

const schedule=restoreSchedule(JSON.parse(gunzipSync(fs.readFileSync(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
const film=new FactoryFilm({preparedSchedule:schedule});

test('each complete speech stays in one balloon for its entire reading time',()=>{
 for(const speech of film.plan.story.speeches)for(let t=speech.start+.01;t<speech.end;t+=.1){
  const shown=film.seekPresentation(t).film.speech;
  assert.equal(shown?.id,speech.id);
  assert.equal(shown.text,speech.text,`${speech.id} at ${t}`);
 }
});

test('speech reading time does not nearly freeze ordinary production highlights',()=>{
 for(const id of ['F13','F14','F15','F16','F17','F18','F19','F21','F22','F24']){
  const speech=film.plan.story.speeches.find(s=>s.id===id);
  const a=film.plan.clock.sample(speech.start+1).sourceTime;
  const b=film.plan.clock.sample(speech.start+2).sourceTime;
  assert.ok(b-a>=.5,`${id}: only ${b-a} operation seconds per screen second`);
 }
});

test('the educational pallet jack uses its prepared natural duration',()=>{
 const [start,end]=STORY_WINDOWS.demonstration;
 assert.ok(Math.abs(end-start-15.6)<1e-8);
 const a=film.seekPresentation(start+1).film.demonstration;
 const b=film.seekPresentation(start+2).film.demonstration;
 assert.ok(Math.abs(b.sourceTime-a.sourceTime-1)<1e-8);
});

test('all five forklifts stay at their actual parking spaces during the first meeting',()=>{
 for(let t=25;t<STORY_WINDOWS.problem[1];t+=.5){
  const snapshot=film.seekPresentation(t);
  assert.equal(snapshot.dbr.workHours,0);
  for(const [i,pose]of sampleDbrHandling(snapshot).fleet.entries()){
   assert.ok(Math.hypot(...pose.position.map((v,k)=>v-LOGISTICS_LAYOUT.fleet[i].park[k]))<1e-6,`${pose.id} moving during the meeting at ${t}`);
  }
 }
});

test('ordinary workers leave at walking speed before the lights close',()=>{
 for(const [id,stand]of [['us2',[2,-5.9]],['m2:2',[8.22,8.4]],['insp:1',[14.2,8.4]]]){
  let previous=null,walked=0,first=null,last=null;
  for(let t=STORY_WINDOWS.exit[0]-30;t<=STORY_WINDOWS.credits[0];t+=.05){
   const pose=cinematic.sampleFactoryWorkerExit(id,stand,t,{windows:STORY_WINDOWS});
   if(pose?.walking){first??=t;last=t;}
   if(pose&&previous){const d=Math.hypot(...pose.position.map((v,k)=>v-previous.position[k]));assert.ok(d/.05<=1.65,`${id} runs at ${d/.05} m/s`);walked+=d;}
   if(pose)previous=pose;
  }
  assert.ok(last-first>15,`${id}: exit compressed into ${last-first} seconds`);
  assert.ok(walked>20);
  assert.equal(cinematic.sampleFactoryWorkerExit(id,stand,STORY_WINDOWS.exit[1],{windows:STORY_WINDOWS}).visible,false);
 }
});

test('worker departure stays clear of the unchanged meeting group',()=>{
 const stands=Object.entries(DBR_LAYOUT).flatMap(([stage,rows])=>rows.map((_,i)=>({id:`${stage}:${i}`,position:dbrWorkStand(stage,i)}))).filter(p=>!['lap:0','m1:0'].includes(p.id)).concat({id:'buffer:0',position:[1.7,0]});
 for(let t=STORY_WINDOWS.exit[0]-30;t<STORY_WINDOWS.exit[1];t+=.05){
  const people=stands.map(p=>({id:p.id,...(cinematic.sampleFactoryWorkerExit(p.id,p.position,t,{windows:STORY_WINDOWS})||{position:p.position,visible:true})})).concat(Object.entries(sampleFilmActors(t,null,{story:FILM_STORY})).map(([id,p])=>({id,...p}))).filter(p=>p.visible!==false);
  for(let i=0;i<people.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(...people[i].position.map((x,k)=>x-people[j].position[k]))>=.8,`${people[i].id}/${people[j].id} at ${t}`);
 }
});
