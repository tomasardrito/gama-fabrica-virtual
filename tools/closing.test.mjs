import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleFilmActors} from '../film-actors.js';
const story={windows:{opening:[0,25],problem:[25,100],solution:[100,220],production:[220,450],results:[450,565],closing:[565,600],exit:[565,590],credits:[595,600]},speeches:[],walks:[]};
test('all six actors leave visibly before credits using presentation windows',()=>{
 const first=sampleFilmActors(565,null,{story});
 assert.equal(Object.keys(first).length,6);
 for(const a of Object.values(first)){assert.equal(a.exitPhase,'seated');assert.equal(a.visible,true);}
 for(const t of [590,595,599.999,600])for(const a of Object.values(sampleFilmActors(t,null,{story}))){assert.equal(a.exitPhase,'exited');assert.equal(a.visible,false);assert.ok(a.position[1]>=16);}
 for(let t=565;t<595;t+=.05){const actors=Object.values(sampleFilmActors(t,null,{story}));for(const a of actors)assert.equal(a.visible,a.exitPhase!=='exited');for(let i=0;i<actors.length;i++)for(let j=0;j<i;j++)assert.ok(Math.hypot(...actors[i].position.map((v,k)=>v-actors[j].position[k]))>=.8-1e-6,`spacing ${t} ${i}/${j}`);}
});

test('exit remains continuous at boundaries and passes the room doorway',()=>{
 for(const name of Object.keys(sampleFilmActors(565,null,{story}))){
  let crossed=false,previous=sampleFilmActors(565,null,{story})[name];
  for(let t=565.01;t<=595;t+=.01){const actor=sampleFilmActors(t,null,{story})[name];assert.ok(Math.hypot(...actor.position.map((v,i)=>v-previous.position[i]))<.15,`${name}: discontinuous at ${t}`);if(!crossed&&previous.position[0]<-9.5&&actor.position[0]>=-9.5){assert.ok(actor.position[1]>=5.1&&actor.position[1]<=7.3);crossed=true;}previous=actor;}
  assert.ok(crossed,name);
 }
});

test('cinematic closes after the exit window and goes dark before credits',async()=>{
 const {cinematicState}=await import('../factory-cinematic.js');
 assert.equal(cinematicState(589.99,{windows:story.windows}).active,false);
 assert.equal(cinematicState(595,{windows:story.windows}).day,0);
});
