import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleFilmActors as sampleActors} from '../film-actors.js';
import {FILM_STORY} from '../film-story.js';
import {createWorkerRig} from '../worker-rig.js';

const officeNames=['Carlos','Ricardo','Marcos','Rafael'];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const sampleFilmActors=(t,speech=null,options={})=>sampleActors(t,speech,{story:FILM_STORY,...options});
test('meeting participants sit apart and all six have seats for results',()=>{
 const [r0]=FILM_STORY.windows.results,[e0]=FILM_STORY.windows.exit;
 for(const t of [25,45,58,r0+15,r0+35,e0-1]){
  const actors=sampleFilmActors(t),names=t<FILM_STORY.windows.solution[0]?officeNames:Object.keys(actors);
  for(const name of names)assert.equal(actors[name].seated,1,`${name} seated at ${t}`);
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++)assert.ok(distance(actors[names[i]].position,actors[names[j]].position)>=.8,`${names[i]}/${names[j]} at ${t}`);
 }
});
test('F06 stands up, withdraws chairs and exits through the door continuously',()=>{
 const f=FILM_STORY.speeches.find(s=>s.id==='F06');
 const departure=FILM_STORY.walks[0].start;
 for(const name of ['Rafael','Ricardo']){
  assert.equal(sampleFilmActors(f.start-.01)[name].seated,1);
  assert.equal(sampleFilmActors(departure-.1)[name].seated,0);
  assert.ok(sampleFilmActors(f.start+2)[name].chairPull>0);
  let prev=sampleFilmActors(f.start)[name].position,crossed=false;
  // The tour starts with a camera cut (the long stretch is not shown).
  for(let t=f.start+.02;t<departure;t+=.02){const p=sampleFilmActors(t)[name].position;
   assert.ok(distance(p,prev)<.35,`${name} jumps at ${t}`);
   if(prev[0]<-9.5&&p[0]>=-9.5){assert.ok(p[1]>=5.1&&p[1]<=7.3);crossed=true;}
   prev=p;
  }
  assert.ok(crossed,`${name} used the door`);
 }
});
test('tour retains separation and results return is continuous',()=>{
 for(const [from,to] of [FILM_STORY.windows.solution,[FILM_STORY.windows.results[0],500]]){
  let previous=sampleFilmActors(from);
  for(let t=from+.05;t<to;t+=.05){const a=sampleFilmActors(t);
   assert.ok(distance(a.Rafael.position,a.Ricardo.position)>=.8,`tour separation at ${t}`);
   const cut=FILM_STORY.walks.some(w=>w.start>t-.05-1e-9&&w.start<=t+1e-9);
   if(!cut)for(const name of Object.keys(a))assert.ok(distance(a[name].position,previous[name].position)<3,`${name} jumps at ${t}`);
   previous=a;
  }
 }
});
test('a speaking operator stands at his post; otherwise the mission position rules',()=>{
 const pose={position:[4,9],direction:[1,0],walking:true,distance:2,phase:'push',handsLocal:[[-.2,.9,-.4],[.2,.9,-.4]]};
 const handling={operators:new Map([['lap:0',pose]])};
 const speaking=sampleFilmActors(300,{id:'F17',speaker:'André'},{handling}).André;
 assert.notDeepEqual(speaking.position,pose.position);assert.equal(speaking.walking,false);assert.equal(speaking.speaking,true);
 const working=sampleFilmActors(300,{id:'F16',speaker:'Marcos'},{handling}).André;
 assert.deepEqual(working.position,pose.position);assert.equal(working.walking,true);
});
test('worker supports seated legs while preserving walking and grip API',()=>{
 const rig=createWorkerRig();rig.pose({seated:1,position:[1,2],direction:[0,-1]});
 assert.equal(rig.getPose().seated,1);
 assert.equal(rig.getGripPositions().length,2);
 // Pose is reversible; no retained sitting offset.
 rig.pose({walking:true,gait:1});assert.equal(rig.getPose().seated,0);
 assert.equal(rig.getPose().walking,true);
});
test('all cast members keep 0.8 m clearance through exits, tour and return',()=>{
 for(let t=25;t<=600;t+=.05){const actors=Object.values(sampleFilmActors(t));
  for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++)assert.ok(distance(actors[i].position,actors[j].position)>=.8,`${actors[i].name}/${actors[j].name} at ${t}`);
 }
});
test('carrier missions retain the supplied gait and handle grip in the worker rig',async()=>{
 const {workerMissionPose}=await import('../worker-rig.js');
 const operator={carrierId:'jack-m1',position:[3,10.2],direction:[1,0],walking:true,gait:4.2,bend:.12,handsLocal:[[-.18,1.05,-.5],[.18,1.05,-.5]]};
 const pose=workerMissionPose(operator),rig=createWorkerRig();rig.pose(pose);
 assert.deepEqual(rig.getPose().position,operator.position);assert.equal(rig.getPose().walking,true);assert.equal(rig.getPose().gait,4.2);assert.deepEqual(pose.handsLocal,operator.handsLocal);assert.equal(workerMissionPose({position:[0,0]}),null);
});
test('act-two demonstration changes presentation only and reuses the existing operator',async()=>{
 const {FactoryFilm}=await import('../factory-film.js'),{sampleDbrHandling}=await import('../dbr-handling.js');
 const {withFilmDemonstration}=await import('../film-actors.js');
 const s=new FactoryFilm().seekPresentation(FILM_STORY.windows.demonstration[0]+3),base=sampleDbrHandling(s),before=JSON.stringify(s),original=base.operators.get('lap:1');
 const visual={loads:new Map([['DEMO-PALLET',{position:[13,-1],partPosition:[13,.39,-1],palletY:.14,yaw:.5,partLocation:'trolley',onCart:false}]]),operators:new Map([['lap:1',{...original,position:[13,-2.5],walking:true,carrierId:'jack-lap',phase:'push'}]]),carriers:[{id:'jack-lap',position:[13,-1],phase:'push'}]};
 const out=withFilmDemonstration(s,base,visual);
 assert.notEqual(out,base);assert.equal(out.loads.size,base.loads.size+1);assert.equal(base.loads.has('DEMO-PALLET'),false);
 assert.equal(out.operators.get('lap:0'),base.operators.get('lap:0'));assert.equal(out.operators.size,base.operators.size);
 assert.deepEqual(base.operators.get('lap:1'),original);assert.equal(out.loads.get('DEMO-PALLET').quantity,undefined);
 assert.equal(out.loads.get('DEMO-PALLET').demonstration,true);assert.equal(out.loads.get('DEMO-PALLET').palletYaw,.5);
 assert.equal(JSON.stringify(s),before);assert.equal(out.fleet,base.fleet);assert.equal(out.machineOccupants,base.machineOccupants);
});
test('demonstration boundaries dissolve props and reject industrial loads or unknown people',async()=>{
 const {FactoryFilm}=await import('../factory-film.js'),{sampleDbrHandling}=await import('../dbr-handling.js');
 const {withFilmDemonstration}=await import('../film-actors.js'),film=new FactoryFilm();
 const visual={loads:new Map([['DEMO-PALLET',{position:[0,0]}]]),operators:new Map(),carriers:[]};
 const [start,end]=FILM_STORY.windows.demonstration;
 for(const t of [start-.001,end,FILM_STORY.windows.production[0]]){const s=film.seekPresentation(t),base=sampleDbrHandling(s);assert.equal(withFilmDemonstration(s,base,visual),base);}
 for(const t of [start,end-.001]){const s=film.seekPresentation(t),out=withFilmDemonstration(s,sampleDbrHandling(s),visual);assert.ok(out.demonstration.opacity<.01);}
 const s=film.seekPresentation(start+3),base=sampleDbrHandling(s);
 assert.throws(()=>withFilmDemonstration(s,base,{...visual,loads:new Map([['DBR-004',{position:[0,0]}]])}),/demonstration pallet/i);
 assert.throws(()=>withFilmDemonstration(s,base,{...visual,loads:new Map([['DEMO-PALLET',{quantity:500,position:[0,0]}]])}),/quantity/i);
 assert.throws(()=>withFilmDemonstration(s,base,{...visual,operators:new Map([['extra:0',{position:[0,0]}]])}),/existing operator/i);
});
test('the tour leaves the demonstration operator home clear at F08 and on return',async()=>{
 const {dbrWorkStand}=await import('../dbr-layout.js'),home=dbrWorkStand('lap',1);
 const f08=FILM_STORY.speeches.find(s=>s.id==='F08');
 for(let t=f08.start;t<=Math.max(f08.end,FILM_STORY.windows.demonstration[1]);t+=.02)for(const name of ['Rafael','Ricardo'])assert.ok(distance(sampleFilmActors(t)[name].position,home)>=.8,`${name} blocks lap:1 at ${t}`);
});
test('the complete demonstration corridor is clear of conservative actor sweeps',async()=>{
 const {filmDemonstrationSweeps}=await import('../film-actors.js');
 const {ACT2_DEMONSTRATION:d}=await import('../film-camera.js');
 const {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles}=await import('../internal-layout.js');
 const {createInternalDemonstration,prepareInternalAccess,compileInternalTransport}=await import('../internal-motion.js');
 const input=prepareInternalAccess(internalPilotInput({from:'lap',to:'rosq'},{...INTERNAL_PILOTS[0],source:3})),layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(input.transfer)]};
 const plan=createInternalDemonstration({start:d.start,end:d.end,input,layout}),sweeps=filmDemonstrationSweeps(d);
 for(let t=FILM_STORY.windows.demonstration[0];t<=FILM_STORY.windows.demonstration[1];t+=.01)for(const [name,a]of Object.entries(sampleFilmActors(t))){const box=sweeps.find(s=>s.id===`actor:${name}`);for(let i=0;i<2;i++){assert.ok(a.position[i]-.6>=box.min[i]-1e-8);assert.ok(a.position[i]+.6<=box.max[i]+1e-8);}}
 assert.doesNotThrow(()=>compileInternalTransport({transfers:plan.transfers,carriers:plan.carriers,operators:[plan.missions[0].operator],layout,presentation:{mode:'demonstration'},externalSweeps:sweeps}));
});
test('the renderer adapts a prepared demonstration without planning',async()=>{
 const {createAct2Demonstration}=await import('../scene.js');
 assert.equal(createAct2Demonstration(),null);
 assert.throws(()=>createAct2Demonstration({plan:{missions:[]}}),/Invalid prepared/);
 const plan={missions:[{id:'prepared-demo'}]},model=createAct2Demonstration({plan,sourceBay:3,sourceStart:79,sourceEnd:94.6});
 assert.equal(model.plan,plan);assert.equal(model.sourceBay,3);assert.equal(typeof model.sample,'function');assert.equal(typeof model.createCart,'function');
});
test('demonstration staging reports its free D1 bay without changing B1 timing or industry',async()=>{
 const {FactoryFilm}=await import('../factory-film.js'),{sampleDbrHandling}=await import('../dbr-handling.js'),{withFilmDemonstration}=await import('../film-actors.js');
 const s=new FactoryFilm().seekPresentation(FILM_STORY.windows.demonstration[0]+3),original=structuredClone(s.film.demonstration),base=sampleDbrHandling(s),visual={loads:new Map(),operators:new Map(),carriers:[]};
 const out=withFilmDemonstration(s,base,visual,{sourceBay:3});
 assert.equal(out.demonstration.sourceBay,3);assert.equal(out.demonstration.requestedSourceBay,4);
 for(const key of ['start','end','operatorId','carrierId','destinationBay'])assert.equal(out.demonstration[key],original[key]);
 assert.deepEqual(s.film.demonstration,original);assert.equal(s.dbr.workHours,0);assert.equal(s.completed,0);assert.equal(s.shipped,0);
});
test('the full act-two tour clears all five parked production carriers',async()=>{
 const {INTERNAL_LAYOUT}=await import('../internal-layout.js'),{createInternalCart}=await import('../internal-cart.js'),{Box3}=await import('../vendor/three.module.js');
 const cart=createInternalCart(),parks=INTERNAL_LAYOUT.parking.map(p=>{cart.update({...p,deckHeight:.05});cart.group.updateMatrixWorld(true);return {id:p.id,box:new Box3().setFromObject(cart.group)};});
 try{for(let t=FILM_STORY.windows.solution[0];t<FILM_STORY.windows.solution[1];t+=.025)for(const name of ['Rafael','Ricardo']){
  const actor=sampleFilmActors(t)[name],[x,z]=actor.position,r=actor.walking?.4:.65;
  for(const p of parks){if(p.id==='jack-lap'&&t>=FILM_STORY.windows.demonstration[0]&&t<FILM_STORY.windows.demonstration[1])continue;
   assert.ok(x+r<=p.box.min.x||x-r>=p.box.max.x||z+r<=p.box.min.z||z-r>=p.box.max.z,`${name} crosses ${p.id} at ${t.toFixed(3)}`);
  }
 }}finally{cart.destroy();}
});
