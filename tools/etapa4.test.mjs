import test from 'node:test';
import assert from 'node:assert/strict';
import {DbrSimulation} from './prepared-test-helpers.mjs';
import {sampleDbrHandling} from '../dbr-handling.js';
import {sampleTruckVisit} from '../mps-scene.js';
const sim=new DbrSimulation();
test('five persistent forklifts with five distinct parking places',()=>{
 const fleet=sampleDbrHandling(sim.seek(0)).fleet;
 assert.equal(fleet.length,5);assert.ok(fleet.every(v=>v.visible));
 assert.equal(new Set(fleet.map(v=>v.position.join())).size,5);
});
test('both docks have explicit visits and immutable industrial departures',()=>{
 assert.equal(new Set(sim.schedule.trips.map(t=>t.dockIndex)).size,2);
 for(const trip of sim.schedule.trips){assert.ok(trip.arrivalAt<trip.loadStart);assert.ok(trip.exitAt>trip.departAt);assert.equal(trip.departAt,trip.scheduledAt);}
});
test('truck poses expose rotated collision boxes and cargo transform',()=>{
 const trip=sim.schedule.trips[0],pose=sampleTruckVisit([trip],trip.loadStart);
 assert.ok(Number.isFinite(pose.yaw));assert.equal(pose.corners.length,4);
});
test('logistics metrics count only external missions with declared period',()=>{
 const metrics=sim.seek(600).dbr.logistics;
 assert.equal(metrics.fleetSize,5);assert.equal(metrics.availableHours,5*8*80*.8);
 assert.equal(metrics.busyHours,metrics.missions*.2);
 assert.equal(metrics.perVehicle.reduce((n,v)=>n+v.missions,0),metrics.missions);
});

test('truck oriented boxes never overlap across arrival, reversing and departure',async()=>{
 const {boxesOverlap}=await import('../logistics-layout.js');
 for(let t=0;t<=600;t+=.05){const visits=sim.schedule.trips.map(tr=>sampleTruckVisit([tr],t)).filter(v=>v.visible);for(let i=0;i<visits.length;i++)for(let j=i+1;j<visits.length;j++)assert.ok(!boxesOverlap(visits[i].corners,visits[j].corners),`${t}: ${visits[i].trip.id}/${visits[j].trip.id}`);}
});
test('forklifts return to assigned parking when idle and at film end',()=>{
 const fleet=sampleDbrHandling(sim.seek(600)).fleet;
 for(const [i,v] of fleet.entries())assert.deepEqual(v.position,sampleDbrHandling(sim.seek(0)).fleet[i].position);
});

// TABS R2 (172e403) explicitly replaces the universal two-second rule.
// Keep a loaded visibility floor and verify the complete reserved trajectory.
test('R2 accelerated external moves retain positive visible phases and continuous cycle boundaries',async()=>{
 const {compileDbrHandling}=await import('../dbr-handling.js');const plan=compileDbrHandling(sim.schedule),pose=(t,i)=>plan.sample({elapsed:t,logisticsOnly:true},t).fleet[i];
 for(const e of sim.schedule.timeline.filter(e=>e.transportMode==='forklift')){
  assert.ok(e.end-e.start>=.6-1e-7,e.id);assert.ok(e.approachStart<e.start&&e.returnEnd>e.end,e.id);assert.equal(e.compression.policy,'TABS-R2');
  for(const t of [e.approachStart,e.start,e.end,e.returnEnd]){const a=pose(t-1e-7,e.vehicleIndex),b=pose(t+1e-7,e.vehicleIndex);assert.ok(a.visible&&b.visible);assert.ok(Math.hypot(a.position[0]-b.position[0],a.position[1]-b.position[1])<.001,`${e.id} position at ${t}`);assert.ok(Math.hypot(a.direction[0]-b.direction[0],a.direction[1]-b.direction[1])<.001,`${e.id} direction at ${t}`);}
 }
});
test('physical forklift boxes never overlap, including parked bodies',async()=>{
 const {LOGISTICS_LAYOUT,boxCorners,boxesOverlap}=await import('../logistics-layout.js');const {compileDbrHandling}=await import('../dbr-handling.js');const plan=compileDbrHandling(sim.schedule);
 for(let tick=0;tick<=600*60;tick++){const t=tick/60,fleet=plan.sample({elapsed:t,logisticsOnly:true},t).fleet;for(let i=0;i<fleet.length;i++)for(let j=i+1;j<fleet.length;j++){
  const box=v=>boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),LOGISTICS_LAYOUT.forkliftBounds);
  assert.ok(!boxesOverlap(box(fleet[i]),box(fleet[j])),`${t}: ${fleet[i].id}/${fleet[j].id}`);
 }}
});
test('cargo transformation rotates with its owning truck',async()=>{
 const {cargoWorldPosition}=await import('../logistics-motion.js');const {truckSlot,LOGISTICS_LAYOUT}=await import('../logistics-layout.js');
 const trip=sim.schedule.trips[0],point=truckSlot(trip.dockIndex,0),dock=LOGISTICS_LAYOUT.docks[trip.dockIndex];
 const parked=cargoWorldPosition(point,trip,{position:[...dock.position.slice(0,1),0,dock.position[1]],yaw:dock.yaw});
 assert.ok(Math.hypot(...parked.map((v,i)=>v-point[i]))<1e-8);
 const turned=cargoWorldPosition(point,trip,{position:[0,0,0],yaw:0});assert.ok(Math.abs(turned[0]+1.05)<1e-8);assert.ok(Math.abs(turned[1]+.625)<1e-8);
});

test('partial D trial flows through the A1 handling adapter without changing quantities',async()=>{
 const {compileInternalTrial}=await import('../dbr-presentation.js');
 const snapshot=sim.seek(139),before=JSON.stringify(sim.schedule),trial=compileInternalTrial(sim.schedule);
 assert.equal(trial.scope,'prototype-m1-m2');assert.equal(trial.complete,false);
 const e=trial.plan.transfers[0],t=(e.start+e.end)/2;
 const view=sampleDbrHandling({...sim.seek(t),internalTransportTrial:trial},t);
 const load=view.loads.get(e.lotId);assert.equal(load.partLocation,'trolley');assert.equal(load.quantity,500);assert.equal(load.onCart,false);
 assert.equal(view.carriers.length,1);assert.equal(view.operators.get('m1:1').carrierId,'jack-m1');
 assert.equal(JSON.stringify(sim.schedule),before);
});

test('component cycles cover the BOM of every planned lot exactly once and reserve both drops and return',async()=>{
 const {MPS_PARAMETERS}=await import('../mps-simulation.js');
 const plan=sim.schedule.componentPlan;assert.equal(plan.missions.length,107);
 for(const m of plan.missions){const lot=sim.schedule.lots.find(l=>l.id===m.lotId);assert.deepEqual(m.components,MPS_PARAMETERS.bom[lot.product].map(q=>q*lot.quantity));assert.ok(m.m1At<=lot.timeline.find(e=>e.station==='m1').start);assert.ok(m.m2At<=lot.timeline.find(e=>e.station==='m2').start);assert.ok(m.start>=25);assert.equal(m.end-m.start,8);}
 for(const a of plan.missions)for(const b of plan.missions)if(a!==b&&a.vehicleIndex===b.vehicleIndex)assert.ok(a.end<=b.start||b.end<=a.start);
 for(const m of plan.missions){const kitCycle=sim.schedule.logisticsCycles.find(c=>c.id===m.id);for(const e of sim.schedule.logisticsCycles.filter(e=>e.kind!=='kit'&&e.vehicleIndex===m.vehicleIndex))assert.ok(kitCycle.end<=e.start+1e-7||kitCycle.start>=e.end-1e-7,`${m.id}/${e.id}`);}
});

test('simultaneous stock pickups use distinct reserved bays',()=>{
 const events=sim.schedule.timeline.filter(e=>e.from==='stock'&&e.to==='lap');
 for(const a of events)for(const b of events)if(a!==b&&a.start<b.end&&b.start<a.end)assert.notDeepEqual(a.fromPosition,b.fromPosition,`${a.id}/${b.id}`);
});

test('empty approaches and returns avoid the published factory obstacle volumes',async()=>{
 const {compileDbrHandling}=await import('../dbr-handling.js');
 const {INTERNAL_LAYOUT}=await import('../internal-layout.js');
 const {LOGISTICS_LAYOUT,boxCorners,boxesOverlap}=await import('../logistics-layout.js');
 const plan=compileDbrHandling(sim.schedule);
 for(let tick=0;tick<=600*60;tick++){
  const t=tick/60,fleet=plan.sample({elapsed:t,logisticsOnly:true},t).fleet;
  for(const v of fleet){const box=boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),LOGISTICS_LAYOUT.forkliftBounds);
   for(const o of INTERNAL_LAYOUT.obstacles)assert.ok(!boxesOverlap(box,boxCorners([0,0],0,o)),`${t}: ${v.id} ${v.event?.id||v.priorEvent?.id} / ${o.id}`);
  }
 }
});

test('dispatch reserves a distinct physical bay through pickup clearance',()=>{
 const inbound=sim.schedule.timeline.filter(e=>e.to==='dispatch');
 const outgoing=id=>sim.schedule.timeline.find(e=>e.lotId===id&&e.to==='truck');
 for(const a of inbound)for(const b of inbound)if(a!==b&&a.start<outgoing(b.lotId).end+.3&&b.start<outgoing(a.lotId).end+.3)assert.notDeepEqual(a.toPosition,b.toPosition,`${a.id}/${b.id}`);
});

test('dispatch access does not run through neighbouring staged pallets',async()=>{
 const {compileDbrHandling}=await import('../dbr-handling.js');const {boxCorners,boxesOverlap}=await import('../logistics-layout.js');const plan=compileDbrHandling(sim.schedule);
 const slots=sim.schedule.timeline.filter(e=>e.to==='dispatch').map(e=>({start:e.end,end:sim.schedule.timeline.find(x=>x.lotId===e.lotId&&x.to==='truck').start,position:e.toPosition,id:e.lotId}));
 for(let tick=0;tick<=600*60;tick++){const t=tick/60,occupied=slots.filter(s=>t>=s.start&&t<s.end);if(!occupied.length)continue;const fleet=plan.sample({elapsed:t,logisticsOnly:true},t).fleet;
  for(const v of fleet){const body=boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),{min:[-.6,.6],max:[.6,1.8]});for(const s of occupied)assert.ok(!boxesOverlap(body,boxCorners(s.position,0,{min:[-.55,-.55],max:[.55,.55]})),`${t}: ${v.id} / ${s.id}`);}
 }
});

test('all ten truck pallets fit inside the trailer without crossing rear doors',async()=>{
 const {truckSlot,LOGISTICS_LAYOUT,localToWorld}=await import('../logistics-layout.js');
 for(let dock=0;dock<2;dock++)for(let slot=0;slot<10;slot++){
  const d=LOGISTICS_LAYOUT.docks[dock],p=truckSlot(dock,slot),local=localToWorld(p.map((v,i)=>v-d.position[i]),[0,0],-d.yaw);
  assert.ok(local[0]-.55>=-1.65&&local[0]+.55<=4.2,`slot ${slot}: trailer length`);
  assert.ok(Math.abs(local[1])+.6<=1.225+1e-8,`slot ${slot}: trailer width`);
 }
});

test('D coordination reports complete cycle budgets and immutable chain deficits',async()=>{
 const {coordinateInternalWindows}=await import('../dbr-presentation.js');const before=JSON.stringify(sim.schedule),review=coordinateInternalWindows(sim.schedule);
 assert.equal(review.complete,false);assert.equal(review.requirements.length,535);
 const short=review.chains.find(c=>c.lotId==='DBR-029'&&c.side==='upstream');assert.ok(short.budget<1.9);assert.ok(short.deficit>16);assert.equal(short.candidate,null);
 for(const r of review.requirements){assert.ok(r.before>0&&r.loaded>0&&r.after>0);assert.ok(Number.isFinite(r.available));assert.equal(r.total,r.before+r.loaded+r.after);}
 assert.equal(JSON.stringify(sim.schedule),before);
});

test('each of the 535 D requests is measured at its assigned bay, including access and return',async()=>{
 const {coordinateInternalWindows}=await import('../dbr-presentation.js');const {INTERNAL_LAYOUT}=await import('../internal-layout.js');const {measureInternalCycle}=await import('../internal-motion.js');const r=coordinateInternalWindows(sim.schedule);
 assert.ok(new Set(r.requirements.filter(x=>x.from==='m1').map(x=>x.loaded.toFixed(6))).size>1,'different bay distances cannot reuse one pilot timing');
 const homes=new Map();for(const x of r.requirements){
  if(homes.has(x.carrierId))assert.deepEqual(x.measurementInput.carrier.position,homes.get(x.carrierId),'one carrier cannot have several independent homes');else homes.set(x.carrierId,x.measurementInput.carrier.position);
  assert.deepEqual(x.route[0],INTERNAL_LAYOUT.bays[x.from][x.fromSlot]);assert.deepEqual(x.route.at(-1),INTERNAL_LAYOUT.bays[x.to][x.toSlot]);
  const measured=measureInternalCycle(x.measurementInput);assert.equal(measured.total,x.total);
  assert.ok(x.proposal.reserveStart<=x.proposal.start-x.before+1e-7);assert.ok(x.proposal.reserveEnd>=x.proposal.end+x.after-1e-7);
 }
 assert.ok(r.conflicts.some(c=>c.type==='operator-process'));assert.ok(r.conflicts.some(c=>c.type==='operator-reservation'));
});

test('D joint review exposes swept-space rejection of expanded bay assignments',async()=>{
 const {coordinateInternalWindows,validateInternalWindowSpaces}=await import('../dbr-presentation.js');const review=coordinateInternalWindows(sim.schedule),before=JSON.stringify(review);const space=validateInternalWindowSpaces(review);
 assert.equal(space.results.length,535);assert.ok(space.results.some(r=>!r.clear));assert.ok(space.results.some(r=>r.clear));assert.equal(space.complete,false);assert.equal(JSON.stringify(review),before);
});

test('the partial D integration exposes conflicts with external traffic',async()=>{
 const {compileInternalTrial}=await import('../dbr-presentation.js');const {reviewInternalTrialTraffic}=await import('../dbr-handling.js');const trial=compileInternalTrial(sim.schedule),before=JSON.stringify(sim.schedule),review=reviewInternalTrialTraffic(sim.schedule,trial);
 assert.equal(review.complete,false);assert.equal(review.collisionFree,false);assert.ok(review.conflicts.some(c=>c.body==='operator'));assert.equal(JSON.stringify(sim.schedule),before);
});

test('R2 empty travel shares available gaps with the neighbouring complete cycle',()=>{
 const cycles=sim.schedule.logisticsCycles;
 for(let i=0;i<5;i++){const list=cycles.filter(c=>c.vehicleIndex===i).sort((a,b)=>a.start-b.start);for(let j=1;j<list.length;j++)assert.ok(list[j-1].end<=list[j].start+1e-7);}
 for(const e of sim.schedule.timeline.filter(e=>e.transportMode==='forklift'))assert.ok(Math.abs(e.returnDuration-(e.returnEnd-e.returnStart))<1e-7);
});

test('every compressed external reservation declares its timing constraint',()=>{
 for(const e of sim.schedule.timeline.filter(e=>e.transportMode==='forklift'&&e.end-e.start<2-1e-7)){
  assert.ok(e.end-e.start>=.6-1e-7,e.id);assert.ok(e.presentationExceptions?.length,e.id);
  assert.ok(e.presentationExceptions.every(x=>['anchored-chain','daily-collection','shared-resource'].includes(x.class)));
 }
});

test('the Act 2 demonstration uses D R2 phases without industrial loads or clock changes',async()=>{
 const {compileInternalDemonstration,sampleDemonstrationTime}=await import('../dbr-presentation.js');const {sampleInternalTransport}=await import('../internal-motion.js');const before=JSON.stringify(sim.schedule),demo=compileInternalDemonstration(sim.schedule);
 assert.equal(demo.duration,30);assert.equal(demo.notIndustrialSchedule,true);assert.equal(demo.trial.plan.demonstration.industrialEffect,false);assert.equal(demo.lotId,'DEMO-PALLET');assert.equal(demo.trial.plan.transfers[0].quantity,undefined);
 let last=-Infinity;for(let tick=0;tick<=1800;tick++){const mapped=sampleDemonstrationTime(demo,tick/60);assert.ok(mapped.sourceTime>=last);last=mapped.sourceTime;}
 const m=demo.trial.plan.missions[0],duringReturn=sampleInternalTransport(demo.trial.plan,(m.transfer.end+m.end)/2);assert.deepEqual(duringReturn.loads.get('DEMO-PALLET').position,m.transfer.toPosition);
 assert.equal(JSON.stringify(sim.schedule),before);
});

test('R2 reserves every external full cycle including empty approach and return',()=>{
 const cycles=sim.schedule.logisticsCycles;assert.ok(cycles);assert.equal(cycles.length,409+107);
 for(const c of cycles){assert.ok(c.start<c.loadedStart&&c.loadedEnd<c.end,`${c.id}: missing empty phase`);assert.ok(c.loadedStart<c.loadedEnd);}
 for(let i=0;i<5;i++){const list=cycles.filter(c=>c.vehicleIndex===i).sort((a,b)=>a.start-b.start);for(let j=1;j<list.length;j++)assert.ok(list[j-1].end<=list[j].start+1e-7,`${list[j-1].id}/${list[j].id}`);}
});

test('external compressed routes allocate continuous turns instead of instantaneous yaw jumps',async()=>{
 const {compileForkliftRoute,sampleForkliftRoute}=await import('../logistics-motion.js');const motion=compileForkliftRoute([[0,0],[0,4],[6,4]],{reverseFirst:true,finalDirection:[-1,0]});assert.ok(motion.segments.some(s=>s.kind==='turn'));
 let prior=sampleForkliftRoute(motion,0);for(let i=1;i<=10000;i++){const p=sampleForkliftRoute(motion,i/10000);assert.ok(Math.hypot(p.position[0]-prior.position[0],p.position[1]-prior.position[1])<.01);assert.ok(Math.hypot(p.direction[0]-prior.direction[0],p.direction[1]-prior.direction[1])<.01);prior=p;}
 assert.deepEqual(prior.position,[6,4]);assert.deepEqual(prior.direction,[-1,0]);
});

test('swept external motion detects an obstacle skipped between display frames',async()=>{
 const {compileForkliftRoute,sweepForkliftRoute}=await import('../logistics-motion.js');const {boxesOverlap,boxCorners}=await import('../logistics-layout.js');
 const motion=compileForkliftRoute([[-5,0],[5,0]]),sweeps=sweepForkliftRoute(motion,0,.01),obstacle=boxCorners([0,0],0,{min:[-.1,-.1],max:[.1,.1]});assert.ok(sweeps.some(s=>boxesOverlap(s.polygon,obstacle)));
});

test('external full-cycle swept volumes clear static factory obstacles between frames',async()=>{
 const {externalCycleSweeps}=await import('../logistics-motion.js');const {INTERNAL_LAYOUT}=await import('../internal-layout.js');const {boxesOverlap,boxCorners}=await import('../logistics-layout.js');
 for(const sweep of externalCycleSweeps(sim.schedule))for(const o of INTERNAL_LAYOUT.obstacles)assert.ok(!boxesOverlap(sweep.polygon,boxCorners([0,0],0,o)),`${sweep.id} ${sweep.phase} ${sweep.start}: ${o.id}`);
});

test('R2 A1 adapter keeps the real loaded window and exports complete candidate reservations',async()=>{
 const {compileInternalProductionTrial,coordinateInternalProduction}=await import('../dbr-presentation.js');const before=JSON.stringify(sim.schedule),trial=compileInternalProductionTrial(sim.schedule,{id:'DBR-E9',includeExternal:false}),raw=sim.schedule.timeline.find(e=>e.id==='DBR-E9'),m=trial.plan.missions[0];
 assert.equal(trial.complete,false);assert.equal(trial.proposedWindow,false);assert.ok(m.pickupStart>=raw.start-1e-7&&m.transfer.end<=raw.end+1e-7);assert.ok(m.start<m.pickupStart&&m.end>m.transfer.end);assert.ok(m.presentation.compressionFactor>1);
 const t=(m.pickupStart+m.transfer.end)/2,view=sampleDbrHandling({...sim.seek(t),internalTransportTrial:trial},t);assert.equal(view.loads.get(raw.lotId).quantity,500);assert.equal(view.loads.get(raw.lotId).partLocation,'trolley');assert.equal(view.carriers.length,5);
 const review=coordinateInternalProduction(sim.schedule);assert.equal(review.candidates.length,535);assert.equal(review.complete,false);assert.ok(review.conflicts.length);assert.ok(review.externalSweeps.length);assert.ok(review.candidates.every(c=>c.pickupStart>=c.start-1e-7&&c.loadedEnd<=c.end+1e-7&&c.pickupStart>c.reserveStart&&c.reserveEnd>c.loadedEnd));assert.equal(JSON.stringify(sim.schedule),before);
});

test('R2 external traffic audit includes between-frame intersections and parked reservations',async()=>{
 const {externalTrafficConflicts}=await import('../logistics-motion.js');
 const p=[[-1,-1],[1,-1],[1,1],[-1,1]],conflicts=externalTrafficConflicts([{id:'fast',vehicleIndex:0,start:.001,end:.009,polygon:p},{id:'parked',vehicleIndex:1,start:0,end:600,polygon:p}]);
 assert.equal(conflicts.length,1);assert.deepEqual(conflicts[0].ids,['parked','fast']);assert.equal(conflicts[0].start,.001);assert.equal(conflicts[0].end,.009);
});

test('corridor waiting holds the forklift without shortening its empty travel',async()=>{
 const {compileDbrHandling}=await import('../dbr-handling.js'),{compileForkliftCycleMotion}=await import('../logistics-motion.js');const e={...sim.schedule.timeline.find(e=>e.transportMode==='forklift')};
 e.start=100;e.end=102;e.approachStart=97.8;e.approachEnd=99.8;e.returnStart=102.4;e.returnEnd=104.4;delete e.approachMotion;delete e.returnMotion;delete e.loadedMotion;
 const s={...sim.schedule,timeline:[e],componentTransfers:[]},plan=compileDbrHandling(s),motion=compileForkliftCycleMotion(e);
 assert.deepEqual(plan.sample({elapsed:102.2,logisticsOnly:true},102.2).fleet[e.vehicleIndex].position,e.toPosition);
 assert.deepEqual(plan.sample({elapsed:99.9,logisticsOnly:true},99.9).fleet[e.vehicleIndex].position,e.fromPosition);
 assert.ok(motion.approach.referenceSeconds>0&&motion.returning.referenceSeconds>0);assert.equal(e.approachEnd-e.approachStart,2);assert.equal(e.returnEnd-e.returnStart,2);
});

test('D1 revised bays are shared by internal and external endpoints without changing industrial timestamps',async()=>{
 const {prepareInternalPresentation}=await import('../dbr-presentation.js'),{INTERNAL_LAYOUT}=await import('../internal-layout.js');const before=JSON.stringify(sim.schedule),candidate=prepareInternalPresentation(sim.schedule);
 for(const [stage,points]of Object.entries(INTERNAL_LAYOUT.bays))assert.deepEqual(candidate.handlingBays[stage],points,stage);assert.equal(JSON.stringify(sim.schedule),before);assert.deepEqual(candidate.timeline.map(e=>[e.id,e.startHours,e.endHours]),sim.schedule.timeline.map(e=>[e.id,e.startHours,e.endHours]));
 for(const e of candidate.timeline.filter(e=>e.kind==='transfer'))for(const side of ['from','to'])if(INTERNAL_LAYOUT.bays[e[side]])assert.ok(INTERNAL_LAYOUT.bays[e[side]].some(p=>p.every((x,i)=>x===e[`${side}Position`][i])),`${e.id} ${side}`);
});

test('yard arrivals wait in the marked lane and reserve maneuvering against departures',()=>{
 const trips=sim.schedule.trips;
 for(const tr of trips){assert.ok(tr.arrivalAt<tr.queueAt&&tr.queueAt<=tr.maneuverStart&&tr.maneuverStart<tr.reverseAt&&tr.reverseAt<tr.dockAt);const waiting=sampleTruckVisit([tr],(tr.queueAt+tr.maneuverStart)/2);assert.equal(waiting.phase,'waiting');assert.deepEqual(waiting.position.slice(0,1),[30]);assert.equal(waiting.position[2],40);assert.equal(tr.departAt,tr.scheduledAt);
  for(const other of trips){if(tr!==other)assert.ok(tr.dockAt<=other.maneuverStart||other.dockAt<=tr.maneuverStart);assert.ok(tr.dockAt<=other.departAt||other.exitAt<=tr.maneuverStart);}
 }
});

test('A1 consumes all 535 revised effective cycles including opening wait and relief operator',async()=>{
 const {coordinateInternalProduction}=await import('../dbr-presentation.js'),review=coordinateInternalProduction(sim.schedule);assert.equal(review.candidates.filter(c=>c.individualClear).length,535);
 const first=review.candidates.find(c=>c.id==='DBR-E1');assert.ok(Math.abs(first.reserveStart-135)<1e-7);assert.ok(first.pickupStart>135);assert.equal(first.end,sim.schedule.timeline.find(e=>e.id===first.id).end);
 for(const id of ['DBR-E900','DBR-E919']){const c=review.candidates.find(c=>c.id===id);assert.ok(['buffer:0','lap:1'].includes(c.operatorId));for(const p of sim.schedule.timeline.filter(e=>e.kind==='process'&&`${e.station}:${e.machineIndex??0}`===c.operatorId))assert.ok(c.reserveEnd<=p.start+1e-7||p.end<=c.reserveStart+1e-7);}
});

test('joint allocation reserves compiler-effective complete cycles and reports every unassigned move',async()=>{
 const {allocateInternalProduction}=await import('../dbr-presentation.js');const before=JSON.stringify(sim.schedule),result=allocateInternalProduction(sim.schedule,{ids:['DBR-E1','DBR-E5','DBR-E7','DBR-E9'],includeExternal:false});
 assert.equal(result.assignments.length+result.unresolved.length,4);assert.ok(result.assignments.length>0);assert.equal(result.complete,false);
 for(const a of result.assignments){const raw=sim.schedule.timeline.find(e=>e.id===a.id);assert.ok(a.pickupStart>=raw.start-1e-7&&a.loadedEnd<=raw.end+1e-7);assert.ok(a.pickupStart>a.start&&a.loadedEnd>a.pickupStart&&a.end>a.loadedEnd);assert.ok(a.loadedEnd-a.pickupStart>=.1-1e-7);}
 for(const a of result.assignments)for(const b of result.assignments)if(a!==b&&(a.operatorId===b.operatorId||a.carrierId===b.carrierId||a.lotId===b.lotId))assert.ok(a.end<=b.start+1e-7||b.end<=a.start+1e-7);assert.equal(JSON.stringify(sim.schedule),before);
});

test('corridor reservation waits for an occupied crossing without reducing motion duration',async()=>{
 const {compileForkliftRoute,reserveMotionWindow}=await import('../logistics-motion.js');const {boxCorners}=await import('../logistics-layout.js');
 const motion=compileForkliftRoute([[-5,0],[5,0]]),blocked=[{id:'crossing',start:0,end:1,polygon:boxCorners([0,0],0,{min:[-10,-.5],max:[10,.5]})}],r=reserveMotionWindow(motion,1,{start:0,end:3},blocked);
 assert.ok(r.start>=1);assert.equal(r.end-r.start,1);assert.deepEqual(r.blockers,['crossing']);assert.equal(reserveMotionWindow(motion,1,{start:0,end:1},blocked).start,null);
});

test('nearby external jobs connect through real corridors instead of compulsory parking detours',async()=>{
 const {compileForkliftCycleMotion,compileExternalCycles}=await import('../logistics-motion.js'),candidate=JSON.parse(JSON.stringify(sim.schedule));compileExternalCycles(candidate,{connectNearby:true});let connected=0;
 for(let i=0;i<5;i++){const list=candidate.timeline.filter(e=>e.transportMode==='forklift'&&e.vehicleIndex===i).sort((a,b)=>a.start-b.start);for(const e of list)if(e.connectorNext){const next=[...candidate.timeline,...candidate.componentTransfers].find(x=>x.id===e.connectorNext),a=compileForkliftCycleMotion(e),b=compileForkliftCycleMotion(next);assert.deepEqual(a.returning.end,b.approach.start);assert.deepEqual(a.returning.endDirection,b.approach.startDirection);assert.ok(next.start-e.end<=20);connected++;}}
 assert.ok(connected>100);const last=sampleDbrHandling(sim.seek(600));for(const [i,v]of last.fleet.entries())assert.deepEqual(v.position,sampleDbrHandling(sim.seek(0)).fleet[i].position);
});

test('trucks never occupy a forklift corridor outside the assigned rear loading visit',async()=>{
 const {compileDbrHandling}=await import('../dbr-handling.js'),{boxCorners,boxesOverlap,LOGISTICS_LAYOUT}=await import('../logistics-layout.js'),plan=compileDbrHandling(sim.schedule);
 for(let tick=0;tick<=36000;tick++){
  const t=tick/60,visits=sim.schedule.trips.map(tr=>sampleTruckVisit([tr],t)).filter(v=>v.visible);if(!visits.length)continue;
  for(const fork of plan.sample({elapsed:t,logisticsOnly:true},t).fleet)for(const truck of visits){
   const event=fork.event||fork.priorEvent,ownRear=event?.to==='truck'&&truck.trip.lotIds.includes(event.lotId)&&t>=event.start&&t<=event.returnEnd&&t<truck.trip.departAt;
   if(!ownRear)assert.ok(!boxesOverlap(boxCorners(fork.position,Math.atan2(-fork.direction[0],-fork.direction[1]),LOGISTICS_LAYOUT.forkliftBounds),truck.corners),`${t}: ${fork.id}/${truck.trip.id} ${event?.id}`);
  }
 }
});

test('D joint motor diagnosis separates timed sweeps from whole-corridor rejection',async()=>{
 const {diagnoseInternalJointContract}=await import('./logistics.browser.mjs'),r=await diagnoseInternalJointContract(sim.schedule);
 assert.equal(r.scope,'isolated-motor-contract');assert.equal(r.timedSweepPairs,0);assert.equal(r.windows.length,2);assert.ok(r.jointAccepted||r.error.includes('reserved corridor'));assert.equal(r.industrialEffect,false);
});

test('the operational schedule resolves the opening crossing with complete corridor reservations',()=>{
 const plan=sim.schedule.logisticsCorridorPlan;assert.equal(plan.complete,true);assert.equal(plan.unresolved.length,0);assert.ok(plan.changes.some(c=>c.ids.includes('DBR-E18')));
 for(const c of plan.changes){assert.ok(c.travelSeconds>=0&&c.waitSeconds>=-1e-7);assert.ok(Math.abs(c.travelSeconds+c.waitSeconds-(c.end-c.start))<1e-6);}
});

test('stock support approaches separate adjacent lap bays before turning',async()=>{
 const {compileDbrHandling}=await import('../dbr-handling.js'),{boxCorners,boxesOverlap,LOGISTICS_LAYOUT}=await import('../logistics-layout.js'),plan=compileDbrHandling(sim.schedule);
 for(let tick=138*120;tick<=141.5*120;tick++){const t=tick/120,fleet=plan.sample({elapsed:t,logisticsOnly:true},t).fleet,boxes=[fleet[0],fleet[4]].map(v=>boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),LOGISTICS_LAYOUT.forkliftBounds));assert.ok(!boxesOverlap(...boxes),`${t}: opening stock/support crossing`);}
});

test('allocation-free polygon checks preserve the previous SAT decisions',async()=>{
 const {boxCorners,boxesOverlap}=await import('../logistics-layout.js');
 const reference=(a,b)=>{for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],axis=[q[1]-p[1],p[0]-q[0]],x=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),y=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);if(Math.max(...x)<=Math.min(...y)+1e-7||Math.max(...y)<=Math.min(...x)+1e-7)return false;}return true;};
 const bounds={min:[-.6,-.7],max:[.6,1.8]};
 for(let i=0;i<1000;i++){const a=boxCorners([Math.sin(i)*3,Math.cos(i*.7)*2],i*.03,bounds),b=boxCorners([Math.cos(i*.9)*3,Math.sin(i*.5)*2],i*.07,bounds);assert.equal(boxesOverlap(a,b),reference(a,b));}
});

test('stock cycle shortcuts free waiting time without increasing the previous travel rate',async()=>{
 const {compileForkliftCycleMotion}=await import('../logistics-motion.js');let count=0;
 for(const e of sim.schedule.timeline.filter(e=>e.safeIntervalConnection)){
  const next=[...sim.schedule.timeline,...sim.schedule.componentTransfers].find(x=>x.id===e.connectorNext),a=compileForkliftCycleMotion(e),b=compileForkliftCycleMotion(next),timing=e.safeIntervalConnection,maxRate=Math.max(timing.referenceRate.return,timing.referenceRate.approach);
  for(const motion of [a.returning,b.approach])for(const segment of motion.segments.filter(s=>s.kind==='move'&&s.length>0))assert.ok(segment.length/(segment.end-segment.start)<=3.2*maxRate+1e-5,`${e.id}: accelerated connector`);
  assert.ok(timing.waitSeconds>=-1e-7);count++;
 }
 assert.ok(count>0);
 const internal=sim.schedule.timeline.filter(e=>['conveyor','trolley'].includes(e.transportMode));assert.equal(internal.length,535);assert.equal(new Set(internal.map(e=>e.id)).size,535);
 for(const link of ['lap>rosq','rosq>buffer','buffer>m1','m1>m2','m2>insp'])assert.equal(internal.filter(e=>`${e.from}>${e.to}`===link).length,107);
});

test('internal allocation reserves empty phases outside the loaded window without moving its anchors',async()=>{
 const {allocateInternalProduction}=await import('../dbr-presentation.js');
 const result=allocateInternalProduction(sim.schedule,{ids:['DBR-E9','DBR-E60'],includeExternal:false});
 assert.equal(result.policy.loadedWithinOriginalWindow,true);
 assert.equal(result.assignments.length,2);
 for(const a of result.assignments){assert.ok(a.pickupStart>=a.originalStart-1e-7);assert.ok(a.loadedEnd<=a.originalEnd+1e-7);assert.ok(a.start>=135&&a.end<=510);}
});

test('connected empty trips wait at a service bay rather than a shared corridor midpoint',async()=>{
 const {compileExternalCycles}=await import('../logistics-motion.js');const candidate=JSON.parse(JSON.stringify(sim.schedule));
 compileExternalCycles(candidate,{connectNearby:true});
 const events=[...candidate.timeline,...candidate.componentTransfers];
 for(const previous of events.filter(e=>e.connectorNext)){
  const next=events.find(e=>e.id===previous.connectorNext);
  assert.ok(Math.abs(previous.returnEnd-next.approachStart)<1e-7,previous.id);
  assert.ok(previous.returnStart>=previous.end-1e-7);
 }
});

test('safe-interval routing waits along a fixed-speed path and retains between-frame collisions',async()=>{
 const {reserveForkliftPath,compileForkliftRoute,sampleForkliftRoute,sweepForkliftRoute}=await import('../logistics-motion.js');
 const {boxCorners,boxesOverlap}=await import('../logistics-layout.js');
 const motion=compileForkliftRoute([[0,0],[5,0],[10,0]]),obstacle={id:'crossing',start:1,end:2,polygon:boxCorners([10,0],0,{min:[-1,-1],max:[1,1]})};
 const result=reserveForkliftPath(motion,2,{start:0,end:4},[obstacle]);assert.ok(result);assert.equal(result.travelSeconds,2);
 assert.deepEqual(sampleForkliftRoute(result.motion,0).position,[0,0]);assert.deepEqual(sampleForkliftRoute(result.motion,1).position,[10,0]);
 for(const s of sweepForkliftRoute(result.motion,0,4))if(s.start<obstacle.end&&s.end>obstacle.start)assert.ok(!boxesOverlap(s.polygon,obstacle.polygon));
 assert.equal(reserveForkliftPath(motion,2,{start:0,end:2},[obstacle]),null);
});

test('direct service paths retain the published travel rate while reserving crossings',async()=>{
 const {compileForkliftCycleMotion}=await import('../logistics-motion.js');
 const s=sim.schedule;
 for(const e of s.timeline.filter(e=>e.loadedRouting)){const m=compileForkliftCycleMotion(e);assert.ok(e.loadedRouting.travelSeconds<=e.end-e.start);assert.ok(m.loaded.segments.some(s=>s.waiting));for(const segment of m.loaded.segments.filter(s=>s.kind==='move'&&s.length>0))assert.ok(segment.length/(segment.end-segment.start)<=e.loadedRouting.referenceRate*3.2+1e-6);}
 assert.ok(s.timeline.some(e=>e.loadedRouting));
});

test('assembly transport uses existing edge-post operators without crossing occupied work stands',async()=>{
 const {allocateInternalProduction}=await import('../dbr-presentation.js');
 const result=allocateInternalProduction(sim.schedule,{ids:['DBR-E909','DBR-E912'],includeExternal:false});
 assert.equal(result.assignments.length,2);
 assert.equal(result.assignments.find(a=>a.id==='DBR-E909').operatorId,'m1:0');
 assert.equal(result.assignments.find(a=>a.id==='DBR-E912').operatorId,'m2:2');
 for(const a of result.assignments)for(const p of sim.schedule.timeline.filter(e=>e.kind==='process'&&`${e.station}:${e.machineIndex??0}`===a.operatorId))assert.ok(a.end<=p.start+1e-7||p.end<=a.start+1e-7);
});

test('SAT retains real overlaps when a swept hull has nearly collinear tiny edges',async()=>{
 const {boxesOverlap}=await import('../logistics-layout.js');
 const waiting=[[-22.600000001,-2.2428571438571465],[-21.400000001,-2.242857143857147],[-21.399999999,-2.242857143857147],[-21.399999999,.25714285814285687],[-22.599999999,.257142858142857],[-22.600000001,.257142858142857]],moving=[[-22.600000001,-4.857142858142857],[-21.399999999,-4.857142858142857],[-21.399999999,-1.4857142847142886],[-22.600000001,-1.4857142847142886]];
 assert.ok(boxesOverlap(waiting,moving));assert.ok(boxesOverlap(moving,waiting));
 const shifted=moving.map(([x,z])=>[x+4,z]);assert.equal(boxesOverlap(waiting,shifted),false);
});

test('truck loading turns clear a full dispatch row and reverse along the same access',async()=>{
 const {dbrRoute,DBR_BAYS,DBR_PARKS}=await import('../dbr-layout.js');const {compileForkliftCycleMotion,sweepForkliftRoute}=await import('../logistics-motion.js');const {truckSlot,boxCorners,boxesOverlap}=await import('../logistics-layout.js');
 for(const source of DBR_BAYS.dispatch)for(let dock=0;dock<2;dock++)for(let slot=0;slot<10;slot++){
  const to=truckSlot(dock,slot),e={from:'dispatch',to:'truck',vehicleIndex:1,fromPosition:source,toPosition:to,route:dbrRoute('dispatch','truck',source,to,1)};
  const motion=compileForkliftCycleMotion(e);
  for(const phase of ['loaded','returning'])for(const sweep of sweepForkliftRoute(motion[phase],0,1,{min:[-.6,.6],max:[.6,1.8]}))for(const bay of DBR_BAYS.dispatch.filter(p=>p!==source))assert.ok(!boxesOverlap(sweep.polygon,boxCorners(bay,0,{min:[-.55,-.55],max:[.55,.55]})),`${phase}: ${source} → dock ${dock}/${slot} touches ${bay}`);
 }
});

test('external fallback selects an existing idle forklift without moving an appointment',async()=>{
 const {reassignExternalAppointment}=await import('../logistics-motion.js');
 const e={id:'replenish',transportMode:'forklift',vehicleIndex:4,vehicleId:'forklift-5',from:'torno',to:'us1',fromPosition:[-13.5,-4.3],toPosition:[-9.2,-4.1],start:40,end:42,startHours:123,endHours:123.2};
 const schedule={timeline:[e,{id:'next',transportMode:'forklift',vehicleIndex:4,start:42.1,end:44},{id:'busy',transportMode:'forklift',vehicleIndex:2,start:38,end:43}],componentPlan:{missions:[]}};
 const result=reassignExternalAppointment(schedule,e.id);
 assert.ok(result);assert.equal(e.vehicleIndex,0);assert.equal(e.vehicleId,'forklift-1');assert.deepEqual([e.start,e.end,e.startHours,e.endHours],[40,42,123,123.2]);assert.equal(result.from,'forklift-5');
});

test('compacted joint reservations cover every source interval and body envelope',async()=>{
 const {coalesceReservations}=await import('../logistics-motion.js');
 const raw=Array.from({length:20},(_,i)=>({id:'move',body:0,start:i*.01,end:(i+1)*.01,min:[i*.01,-.3],max:[i*.01+.6,.3]}));
 const compact=coalesceReservations(raw);assert.ok(compact.length<raw.length);
 for(const a of raw)assert.ok(compact.some(b=>b.start<=a.start&&b.end>=a.end&&b.min.every((v,i)=>v<=a.min[i])&&b.max.every((v,i)=>v>=a.max[i])));
});

test('recompiling external cycles resets kit approach and return budgets',async()=>{
 const {compileExternalCycles}=await import('../logistics-motion.js');const s=JSON.parse(JSON.stringify(sim.schedule)),first=s.componentTransfers.find(e=>e.from==='components'),last=s.componentTransfers.find(e=>e.kitId===first.kitId&&e.to==='component-m2'),kit=s.componentPlan.missions.find(m=>m.id===first.kitId);
 first.approachStart=25;last.returnEnd=600;compileExternalCycles(s);
 assert.equal(first.approachStart,kit.start);assert.equal(last.returnEnd,kit.end);
});

test('an occupied buffer bay is released before its next inbound allocation',async()=>{
 const {orderInternalTransfers}=await import('../dbr-presentation.js');
 const jobs=[{id:'incoming',lotId:'new',from:'rosq',to:'buffer',fromPosition:[0,0],toPosition:[1,1],start:10,end:11,endHours:20},{id:'outgoing',lotId:'old',from:'buffer',to:'m1',fromPosition:[1,1],toPosition:[2,2],start:10.2,end:11.2,startHours:19}];
 assert.deepEqual(orderInternalTransfers(jobs).map(e=>e.id),['outgoing','incoming']);
});

test('the operational adapter samples trolley loads on the floor and keeps five carriers',async()=>{
 const {allocateInternalProduction}=await import('../dbr-presentation.js'),{compileDbrHandling}=await import('../dbr-handling.js');const allocation=allocateInternalProduction(sim.schedule,{ids:['DBR-E1'],includeExternal:false});assert.equal(allocation.assignments.length,1);const plan=allocation.plan,m=plan.missions[0],t=(m.pickupStart+m.transfer.end)/2,source=sim.seek(t),snapshot={...source,handlingBays:sim.schedule.handlingBays,internalTransportPlan:plan,timeline:source.timeline.map(e=>e.id===m.transfer.id?{...e,...m.transfer,transportMode:'trolley',vehicleId:null,vehicleIndex:null}:e)};
 const view=compileDbrHandling(snapshot).sample(snapshot,t),load=view.loads.get(m.transfer.lotId);assert.equal(load.partLocation,'trolley');assert.equal(load.quantity,source.buffer.pallets.find(p=>p.id===m.transfer.lotId)?.quantity??500);assert.equal(load.vehicleId,null);assert.equal(view.carriers.length,5);assert.ok(load.palletY<.3);assert.equal(view.operators.get(m.operator.id).phase,m.segments.find(s=>s.start<=t&&s.end>=t)?.phase);
});

test('buffer bays hold each arrival until its outgoing pallet clears',async()=>{
 const {internalBayOccupancy}=await import('../dbr-presentation.js'),occupancy=internalBayOccupancy(sim.schedule,sim.schedule.internalTransportPlan).filter(x=>x.stage==='buffer');
 for(let i=0;i<occupancy.length;i++)for(const b of occupancy.slice(i+1)){const a=occupancy[i];if(a.position.every((v,k)=>v===b.position[k]))assert.ok(a.end<=b.start+1e-7||b.end<=a.start+1e-7,`${a.id}/${b.id}`);}
});

test('temporal reservation index retains long waits and both sides of bucket boundaries',async()=>{
 const {createTemporalIndex}=await import('../logistics-motion.js'),items=[{id:'park',start:0,end:600},{id:'cross',start:2.99,end:3.01},{id:'later',start:5,end:6}],index=createTemporalIndex(items);
 for(const [start,end]of [[0,1],[2.999,3],[3,3.001],[4,5],[5,6],[599,600]])assert.deepEqual(index.between(start,end).map(x=>x.id).sort(),items.filter(x=>x.start<end&&x.end>start).map(x=>x.id).sort());
 index.add([{id:'new',start:3,end:4}]);assert.ok(index.between(3,3.1).some(x=>x.id==='new'));
});

test('truck loading counterweight clears a forklift finishing the adjacent dispatch drop',async()=>{
 const {dbrRoute}=await import('../dbr-layout.js'),{compileForkliftRoute,sweepForkliftRoute}=await import('../logistics-motion.js'),{boxCorners,boxesOverlap,LOGISTICS_LAYOUT}=await import('../logistics-layout.js');
 const route=dbrRoute('dispatch','truck',[-1.8,20.5],[6.375,28.95],1),motion=compileForkliftRoute(route),parked=boxCorners([3.8,20.5],Math.PI,LOGISTICS_LAYOUT.forkliftBounds);
 for(const sweep of sweepForkliftRoute(motion,0,1))assert.ok(!boxesOverlap(sweep.polygon,parked),'sub-frame dispatch/loading crossing');
});

test('joint validation rejects an absent internal mission set instead of certifying the external fleet alone',async()=>{
 const {auditJointCirculation}=await import('../dbr-presentation.js'),audit=auditJointCirculation(sim.schedule,{missions:[],carriers:[]});assert.equal(audit.complete,false);assert.equal(audit.missing.length,535);
});

// Pallet pockets allow forks underneath, but never the counterweight/chassis.
test('chassis envelopes retain their own dimensions at stationary pickup and delivery',async()=>{
 const {externalCycleSweeps}=await import('../logistics-motion.js'),bounds={min:[-.6,.6],max:[.6,1.8]},full=externalCycleSweeps(sim.schedule),chassis=externalCycleSweeps(sim.schedule,{bounds});
 assert.equal(chassis.length,full.length);assert.notDeepEqual(chassis.find(x=>x.phase==='idle').polygon,full.find(x=>x.phase==='idle').polygon);
});

test('all 535 operational cycles preserve their anchors and exclusive resources through return',()=>{
 const s=sim.schedule,a=s.internalAllocation,missions=s.internalTransportPlan.missions;
 assert.equal(s.complete,true);assert.equal(a.complete,true);assert.equal(a.assignments.length,535);assert.equal(new Set(a.assignments.map(x=>x.id)).size,535);assert.equal(missions.length,535);assert.equal(a.audit.complete,true);
 for(const m of missions){const e=s.timeline.find(e=>e.id===m.transfer.id);assert.ok(m.start<m.pickupStart&&m.transfer.end<m.end);assert.ok(m.pickupStart>=e.start-1e-7&&m.transfer.end<=e.end+1e-7);assert.ok(m.transfer.end-m.pickupStart>=.1-1e-7);assert.equal(e.startHours,m.transfer.startHours);assert.equal(e.endHours,m.transfer.endHours);
  for(const n of missions)if(n!==m&&(n.operator.id===m.operator.id||n.carrier.id===m.carrier.id||n.transfer.lotId===m.transfer.lotId))assert.ok(m.end<=n.start+1e-7||n.end<=m.start+1e-7,`${m.transfer.id}/${n.transfer.id}`);
  for(const p of s.timeline.filter(p=>p.kind==='process'&&`${p.station}:${p.machineIndex??0}`===m.operator.id))assert.ok(m.end<=p.start+1e-7||p.end<=m.start+1e-7,`${m.transfer.id}/${p.id}`);
 }
 assert.deepEqual([...new Set(missions.map(m=>m.operator.id))].sort(),['buffer:0','lap:1','m1:0','m2:2','rosq:2']);
 for(const key of ['missing','duplicates','conflicts','bayConflicts','staticConflicts','palletConflicts'])assert.deepEqual(a.audit[key],[]);
});

test('truck slots follow effective loading order so earlier pallets cannot obstruct the return',async()=>{
 const {truckSlot}=await import('../logistics-layout.js');
 for(const trip of sim.schedule.trips){const moves=sim.schedule.timeline.filter(e=>e.to==='truck'&&trip.lotIds.includes(e.lotId)).sort((a,b)=>a.start-b.start);for(const [i,e]of moves.entries())assert.deepEqual(e.toPosition,truckSlot(trip.dockIndex,i),`${trip.id}/${e.id}`);}
});

test('upstream station walks reserve the same moving bodies sampled by the adapter',async()=>{
 const {upstreamOperatorReservations}=await import('../dbr-presentation.js'),{compileDbrHandling}=await import('../dbr-handling.js'),{boxCorners,boxesOverlap}=await import('../logistics-layout.js'),reservations=upstreamOperatorReservations(sim.schedule),handling=compileDbrHandling(sim.schedule);
 assert.ok(reservations.length>0);
 for(const r of reservations){const t=(r.start+r.end)/2,view=handling.sample(sim.seek(t),t),pose=view.operators.get(r.operatorId);assert.ok(boxesOverlap(boxCorners(pose.position,0,{min:[-.3,-.3],max:[.3,.3]}),r.polygon),`${r.id} ${t}`);}
});

test('all component kits and replenishment legs remain accounted for after circulation planning',()=>{
 const s=sim.schedule,missions=s.componentPlan.missions;
 assert.equal(s.componentPlan.complete,true);assert.equal(missions.length,107);assert.equal(missions.reduce((n,m)=>n+m.sets,0),44825);assert.equal(s.componentTransfers.length,214);
 for(const m of missions){const legs=s.componentTransfers.filter(e=>e.kitId===m.id);assert.equal(legs.length,2);assert.equal(legs[0].to,'component-m1');assert.equal(legs[1].to,'component-m2');assert.equal(legs[0].end,legs[1].start);assert.deepEqual(legs[0].components,m.components);assert.deepEqual(legs[1].components,m.components);assert.ok(s.logisticsCycles.some(c=>c.id===m.id));}
 for(const job of s.bodySupply.jobs){const legs=s.timeline.filter(e=>e.lotId===job.id&&e.kind==='transfer');assert.deepEqual(legs.map(e=>`${e.from}>${e.to}`),['raw>torno','torno>us1','us1>us2','us2>stock']);assert.ok(legs.every(e=>s.logisticsCycles.some(c=>c.id===e.id)));}
});

test('C1 owns the demonstration rig once while A1 retains the other production carriers',async()=>{
 const {productionCarrierPoses}=await import('../mps-scene.js'),carriers=[{id:'jack-lap'},{id:'jack-m1'}];assert.deepEqual(productionCarrierPoses({carriers}),carriers);assert.deepEqual(productionCarrierPoses({carriers,demonstration:{carrierId:'jack-lap'}}),[carriers[1]]);
});
