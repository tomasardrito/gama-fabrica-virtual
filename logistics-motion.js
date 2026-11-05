import {dbrRoute,routeLength,DBR_PARKS} from './dbr-layout.js';
import {MPS_PARAMETERS} from './mps-simulation.js';
const componentBom=MPS_PARAMETERS.bom;
import {LOGISTICS_LAYOUT,boxCorners,localToWorld,convexHull,boxesOverlap} from './logistics-layout.js';
import {sampleTruckRear} from './truck-rear.js';
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{const u=clamp(t);return u*u*(3-2*u);};
export function planTruckVisits(trips){
 const duration=4,free=[25,25],yard=trips.map(t=>({start:t.departAt,end:t.departAt+duration,kind:'exit',id:t.id}));
 for(const trip of trips){
  const candidates=[];
  for(let dockIndex=0;dockIndex<2;dockIndex++){
   let end=trip.loadStart-.4;
   for(const r of yard.slice().sort((a,b)=>b.end-a.end))if(end>r.start&&end-duration<r.end)end=r.start;
   if(end-duration>=free[dockIndex])candidates.push({dockIndex,end});
  }
  candidates.sort((a,b)=>b.end-a.end||free[a.dockIndex]-free[b.dockIndex]);
  if(!candidates.length)throw new Error(`No reserved yard approach: ${trip.id}`);
  const {dockIndex,end}=candidates[0],maneuverStart=end-duration;
  Object.assign(trip,{dockIndex,maneuverStart,turnAt:maneuverStart+1,reverseAt:maneuverStart+1.5,dockAt:end,exitAt:trip.departAt+duration,departureSeconds:duration,rearOpenSeconds:.4});
  yard.push({id:trip.id,kind:'approach',start:maneuverStart,end});free[dockIndex]=trip.exitAt;
 }
 let queueFree=25;
 for(const trip of [...trips].sort((a,b)=>a.maneuverStart-b.maneuverStart)){
  trip.queueAt=Math.max(queueFree,trip.maneuverStart-1);trip.arrivalAt=trip.queueAt-1;
  if(trip.queueAt>=trip.maneuverStart)throw new Error(`Waiting lane unavailable: ${trip.id}`);
  queueFree=trip.maneuverStart+1;
 }
 return trips;
}
export function sampleLogisticsTruck(trips,elapsed){
 const visits=(trips||[]).map(t=>Number.isFinite(t.maneuverStart)?t:{...t,dockIndex:t.dockIndex??0,arrivalAt:t.loadStart-6.4,queueAt:t.loadStart-5.4,maneuverStart:t.loadStart-4.4,turnAt:t.loadStart-3.4,reverseAt:t.loadStart-2.9,dockAt:t.loadStart-.4,exitAt:t.exitAt??t.departAt+4,departureSeconds:t.departureSeconds??4});
 const trip=visits.find(t=>elapsed>=t.arrivalAt&&elapsed<t.exitAt);
 if(!trip)return {visible:false,trip:null,phase:null,offset:0,position:[0,0,0],yaw:0,corners:[]};
 const dock=LOGISTICS_LAYOUT.docks[trip.dockIndex??0];let position=[...dock.position],yaw=dock.yaw,phase=sampleTruckRear(trip,elapsed).phase;
 if(elapsed<trip.queueAt){phase='arriving';yaw=0;const u=smooth((elapsed-trip.arrivalAt)/(trip.queueAt-trip.arrivalAt));position=[64+(30-64)*u,40];}
 else if(elapsed<trip.maneuverStart){phase='waiting';yaw=0;position=[...LOGISTICS_LAYOUT.waiting];}
 else if(elapsed<trip.turnAt){phase='maneuvering';yaw=0;const u=smooth((elapsed-trip.maneuverStart)/(trip.turnAt-trip.maneuverStart));position=[30+(dock.position[0]-30)*u,40];}
 else if(elapsed<trip.reverseAt){phase='turning';const u=smooth((elapsed-trip.turnAt)/(trip.reverseAt-trip.turnAt));position=[dock.position[0],40];yaw=dock.yaw*u;}
 else if(elapsed<trip.dockAt){phase='reversing';const u=smooth((elapsed-trip.reverseAt)/(trip.dockAt-trip.reverseAt));position=[dock.position[0],40+(dock.position[1]-40)*u];}
 else if(elapsed>=trip.departAt){phase='departing';const u=(elapsed-trip.departAt)/(trip.departureSeconds??4);position=[dock.position[0],dock.position[1]+(64-dock.position[1])*smooth(u)];}
 return {visible:true,trip,phase,offset:0,position:[position[0],-.01,position[1]],yaw,corners:boxCorners(position,yaw,LOGISTICS_LAYOUT.truckBounds)};
}
export function cargoWorldPosition(point,trip,visit){
 const dock=LOGISTICS_LAYOUT.docks[trip.dockIndex??0];
 const local=localToWorld([point[0]-dock.position[0],point[1]-dock.position[1]],[0,0],-dock.yaw);
 return localToWorld(local,[visit.position[0],visit.position[2]],visit.yaw);
}

// A kit is one identified set of BOM components for one production pallet.
// It visits both assembly service bays; component split by assembly operation
// is deliberately not invented. The eight BOM counts are booked only once.
export function compileComponentSupply(schedule){
 const bookings=LOGISTICS_LAYOUT.fleet.map((_,i)=>schedule.timeline.filter(e=>e.transportMode==='forklift'&&e.vehicleIndex===i).map(e=>({start:e.approachStart,end:e.returnEnd??e.end,id:e.id})));
 const jobs=schedule.lots.filter(l=>!l.protection&&l.m1StartHours!=null).map(l=>({lot:l,m1:l.timeline.find(e=>e.station==='m1'),m2:l.timeline.find(e=>e.station==='m2')})).sort((a,b)=>b.m1.start-a.m1.start);
 const missions=[];
 for(const {lot,m1,m2}of jobs){
  const deadline=Math.min(m1.start+4,m2.start+2),candidates=[];
  for(const vehicleIndex of [3,4,0,2,1]){
   let end=deadline;
   for(let retry=0;retry<1000;retry++){
    const previous=end;
    for(const b of bookings[vehicleIndex].slice().sort((a,b)=>b.end-a.end))if(end>b.start&&end-8<b.end)end=b.start;
    for(const m of missions)if(Math.abs(end-8-m.start)<2-1e-7)end=m.start+6;
    if(end===previous)break;
   }
   if(end-8>=25)candidates.push({vehicleIndex,start:end-8,end});
  }
  candidates.sort((a,b)=>b.end-a.end||a.vehicleIndex-b.vehicleIndex);
  if(!candidates.length)throw new Error(`No component cycle window: ${lot.id}`);
  const c=candidates[0],m={...c,id:`KIT-${lot.id}`,lotId:lot.id,week:lot.week,product:lot.product,sets:lot.quantity,components:componentBom[lot.product].map(q=>q*lot.quantity),vehicleId:LOGISTICS_LAYOUT.fleet[c.vehicleIndex].id,m1At:c.start+4,m2At:c.start+6};
  bookings[c.vehicleIndex].push(m);missions.push(m);
 }
 return {missions:missions.sort((a,b)=>a.start-b.start),complete:false,scope:'component-cycle-plan',assumption:'One kit per production pallet; BOM counts once, visits M1 and M2. Payload weight and component split by assembly operation are not specified by this presentation.'};
}

export function componentTransfers(plan,schedule){
 return plan.missions.flatMap(m=>{
  const lot=schedule.lots.find(l=>l.id===m.lotId),common={kind:'component-transfer',product:'Kits BOM',quantity:m.sets,components:m.components,week:m.week,vehicleIndex:m.vehicleIndex,vehicleId:m.vehicleId,kitId:m.id,lotId:m.id,batchId:m.id,transportMode:'forklift'};
  return [{...common,id:`${m.id}-M1`,from:'components',to:'component-m1',start:m.start+2,end:m.m1At,approachStart:m.start,startHours:Math.max(0,lot.m1StartHours-.2),endHours:lot.m1StartHours,fromPosition:[-11.5,1.3],toPosition:[-7.4,14.3]},
   {...common,id:`${m.id}-M2`,from:'component-m1',to:'component-m2',start:m.m1At,end:m.m2At,approachStart:m.m1At,startHours:Math.max(0,lot.m2StartHours-.2),endHours:lot.m2StartHours,fromPosition:[-7.4,14.3],toPosition:[1.4,14.3],forceReturn:true,returnEnd:m.end}].map(e=>({...e,route:dbrRoute(e.from,e.to,e.fromPosition,e.toPosition,e.vehicleIndex)}));
 });
}


// Complete screen-resource reservations under TABS R2. Adjacent external
// cycles split the real inter-job gap; kit cycles already include both visits
// and their approach/return. Nothing here changes an industrial timestamp.
export function compileExternalCycles(schedule,{connectNearby=false,connectStockCycles=false}={}){
 delete schedule.logisticsCorridorPlan;
 for(const e of schedule.componentTransfers){const kit=schedule.componentPlan.missions.find(m=>m.id===e.kitId);e.approachStart=e.from==='components'?kit.start:e.start;e.approachEnd=e.start;e.returnStart=e.end;e.returnEnd=e.to==='component-m2'?kit.end:e.end;}
 const external=schedule.timeline.filter(e=>e.transportMode==='forklift'),cycles=[];
 for(const e of [...external,...schedule.componentTransfers])for(const key of ['approachMotion','returnMotion','connectorNext','connectionTiming','corridorReservations','connectorMotion','loadedMotion','loadedRouting'])delete e[key];
 for(let vehicleIndex=0;vehicleIndex<LOGISTICS_LAYOUT.fleet.length;vehicleIndex++){
  const tasks=[...external.filter(e=>e.vehicleIndex===vehicleIndex).map(event=>({id:event.id,start:event.start,end:event.end,event})),...schedule.componentPlan.missions.filter(m=>m.vehicleIndex===vehicleIndex).map(kit=>({id:kit.id,start:kit.start,end:kit.end,kit}))].sort((a,b)=>a.start-b.start);
  for(let i=0;i<tasks.length;i++){
   const task=tasks[i],previous=tasks[i-1],next=tasks[i+1];
   if(previous&&previous.end>task.start+1e-7)throw new Error(`Overlapping logistics tasks: ${previous.id}/${task.id}`);
   if(task.kit){cycles.push({id:task.id,vehicleIndex,start:task.start,loadedStart:task.start+2,loadedEnd:task.end-2,end:task.end,kind:'kit'});continue;}
   const e=task.event,before=task.start-(previous?.end??25),after=(next?.start??600)-task.end;
   const approach=Math.min(2,before/(previous?.event?2:1)),returnSeconds=Math.min(2,after/(next?.event?2:1));
   if(!(approach>0&&returnSeconds>0))throw new Error(`No complete external cycle: ${e.id}`);
   e.approachStart=e.start-approach;e.approachEnd=e.start;e.returnStart=e.end;e.returnEnd=e.end+returnSeconds;e.returnDuration=returnSeconds;e.returnDelay=0;
   e.approachRoute=dbrRoute('parking',e.from,DBR_PARKS[vehicleIndex],e.fromPosition,vehicleIndex);
   e.returnRoute=externalReturnRoute(e);
   const motion=compileForkliftCycleMotion(e);
   e.compression={policy:'TABS-R2',approach:{seconds:approach,referenceSeconds:motion.approach.referenceSeconds},loaded:{seconds:e.end-e.start,referenceSeconds:motion.loaded.referenceSeconds+.4},return:{seconds:returnSeconds,referenceSeconds:motion.returning.referenceSeconds}};
   for(const phase of Object.values(e.compression))if(typeof phase==='object')phase.factor=phase.referenceSeconds/phase.seconds;
   cycles.push({id:e.id,vehicleIndex,start:e.approachStart,loadedStart:e.start,loadedEnd:e.end,end:e.returnEnd,kind:'external'});
  }
  const ends=task=>task.event?[task.event,task.event]:schedule.componentTransfers.filter(e=>e.kitId===task.id);
  for(let j=1;(connectNearby||connectStockCycles)&&j<tasks.length;j++){
   const previous=ends(tasks[j-1]).at(-1),next=ends(tasks[j])[0];
   if(next.start-previous.end>20)continue;
   if(!connectNearby&&!(previous.to==='lap'&&next.from==='stock'&&next.start-previous.end<=4+1e-7))continue;
   const a=compileForkliftCycleMotion(previous),b=compileForkliftCycleMotion(next),route=joinEmptyRoutes(previous,next);
   const motion=compileForkliftRoute(route,{reverseFirst:previous.to!=='component-m2',reverseUntil:route.reverseUntil,initialDirection:a.loaded.endDirection,finalDirection:b.loaded.startDirection});
   const pair=splitEmptyMotion(motion);if(!pair)continue;
   {
    // A shorter connection releases waiting time at no more than the ORIGINAL phase rate.
    // Collision retries may use that slack; they never accelerate this route.
    const oldReturn=previous.returnEnd-previous.end,oldApproach=next.start-next.approachStart;
    const returning=oldReturn*pair[0].referenceSeconds/a.returning.referenceSeconds,approaching=oldApproach*pair[1].referenceSeconds/b.approach.referenceSeconds;
    if(returning>oldReturn||approaching>oldApproach)continue;
    previous.returnStart=previous.end;previous.returnEnd=previous.end+returning;previous.returnDuration=returning;next.approachStart=previous.returnEnd;next.approachEnd=next.approachStart+approaching;
    if(previous.compression)previous.compression.return.seconds=returning;if(next.compression)next.compression.approach.seconds=approaching;
    previous.connectionTiming={policy:'preserve-reference-rate',originalReturnSeconds:oldReturn,originalApproachSeconds:oldApproach,returnRate:a.returning.referenceSeconds/oldReturn,approachRate:b.approach.referenceSeconds/oldApproach};
    cycles.find(c=>c.id===(previous.kitId||previous.id)).end=previous.returnEnd;cycles.find(c=>c.id===(next.kitId||next.id)).start=next.approachStart;
   }
   previous.returnMotion=pair[0];next.approachMotion=pair[1];previous.connectorNext=next.id;previous.connectorMotion=motion;
  }
  for(const task of tasks){const [first,...rest]=ends(task),last=rest.at(-1)||first,c=cycles.find(c=>c.id===task.id),m=compileForkliftCycleMotion(last);c.idlePosition=m.returning.end;c.idleDirection=m.returning.endDirection;
   for(const e of new Set([first,last]))if(e.compression){const x=compileForkliftCycleMotion(e);for(const [phase,profile]of [['approach',x.approach],['return',x.returning]]){e.compression[phase].referenceSeconds=profile.referenceSeconds;e.compression[phase].factor=profile.referenceSeconds/e.compression[phase].seconds;}}
  }
 }
 schedule.connectStockCycles=connectStockCycles;
 schedule.logisticsCycles=cycles.sort((a,b)=>a.start-b.start);return schedule.logisticsCycles;
}

// Splice existing service corridors at a real intersection. Keep the first
// clearance leg and final alignment leg; no diagonal shortcut across fixtures.
function joinEmptyRoutes(previous,next){
 if(previous.to==='lap'&&next.from==='stock'&&previous.vehicleIndex===0&&previous.fromPosition.every((x,i)=>Math.abs(x-next.fromPosition[i])<1e-7)){
  const route=[...previous.route].reverse();route.joinIndex=route.length-1;route.reverseUntil=route.length-1;return route;
 }
 if(previous.toPosition.every((x,i)=>Math.abs(x-next.fromPosition[i])<1e-7)){const route=[previous.toPosition];route.joinIndex=0;return route;}
 const i=previous.vehicleIndex,park=DBR_PARKS[i],a=externalReturnRoute(previous),b=next.approachRoute||dbrRoute('parking',next.from,park,next.fromPosition,i);
 const cross=(u,v)=>u[0]*v[1]-u[1]*v[0],sub=(u,v)=>u.map((x,i)=>x-v[i]),on=(p,a,b)=>Math.abs(cross(sub(p,a),sub(b,a)))<1e-7&&p.every((x,i)=>x>=Math.min(a[i],b[i])-1e-7&&x<=Math.max(a[i],b[i])+1e-7);
 let best=[...a,...b.slice(1)],length=routeLength(best);best.joinIndex=a.length-1;
 for(let j=2;j<a.length;j++)for(let k=1;k<b.length-1;k++){
  const p=a[j-1],q=b[k-1],r=sub(a[j],p),v=sub(b[k],q),den=cross(r,v),points=[];
  if(Math.abs(den)>1e-8){const t=cross(sub(q,p),v)/den,u=cross(sub(q,p),r)/den;if(t>=0&&t<=1&&u>=0&&u<=1)points.push(p.map((x,i)=>x+t*r[i]));}
  else for(const x of [p,a[j],q,b[k]])if(on(x,p,a[j])&&on(x,q,b[k]))points.push(x);
  for(const x of points){const route=[...a.slice(0,j),x,...b.slice(k)].filter((p,i,all)=>!i||Math.hypot(...sub(p,all[i-1]))>1e-7),n=routeLength(route);if(n<length){best=route;length=n;best.joinIndex=route.findIndex(p=>Math.hypot(...sub(p,x))<1e-7);}}
 }
 best.reverseUntil=previous.to==='truck'?previous.route.length:previous.to==='us2'?14:previous.to==='component-m2'?0:1;
 return best;
}
function splitEmptyMotion(motion){
 if(motion.segments.length===1&&motion.segments[0].waiting){const span=motion.referenceSeconds/2,s=motion.segments[0],part={...motion,referenceSeconds:span,segments:[{...s,start:0,end:span}]};return [{...part},{...part}];}
 const boundaries=motion.segments.slice(0,-1).map(s=>s.end);if(!boundaries.length)return null;
 const cut=boundaries.reduce((a,b)=>Math.abs(a-motion.referenceSeconds/2)<Math.abs(b-motion.referenceSeconds/2)?a:b),pose=sampleForkliftRoute(motion,cut/motion.referenceSeconds),before=motion.segments.filter(s=>s.end<=cut),after=motion.segments.filter(s=>s.start>=cut).map(s=>({...s,start:s.start-cut,end:s.end-cut,distance:s.distance-pose.distance}));
 return [{...motion,segments:before,referenceSeconds:cut,distance:pose.distance,end:pose.position,endDirection:pose.direction},{...motion,segments:after,referenceSeconds:motion.referenceSeconds-cut,distance:motion.distance-pose.distance,start:pose.position,startDirection:pose.direction}];
}

// Reference weights for EXTERNAL vehicle choreography, not industrial speeds.
// Turns have positive time; the whole profile is scaled to its reserved phase.
export function compileForkliftRoute(points,{reverseFirst=false,reverseLast=false,reverseUntil=0,initialDirection,finalDirection}={}){
 const route=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-8),segments=[];
 const heading=i=>{const a=route[i-1],b=route[i],n=Math.hypot(b[0]-a[0],b[1]-a[1]),sign=i<=reverseUntil||(i===1&&reverseFirst)||(i===route.length-1&&reverseLast)?-1:1;return [sign*(b[0]-a[0])/n,sign*(b[1]-a[1])/n];};
 let direction=initialDirection||((route.length>1)?heading(1):[-1,0]),at=0,distance=0;
 const firstDirection=[...direction];
 function turn(to,position){const a=Math.atan2(direction[0],direction[1]),b=Math.atan2(to[0],to[1]),delta=Math.atan2(Math.sin(b-a),Math.cos(b-a)),seconds=Math.abs(delta)/2.4;if(seconds>1e-8){segments.push({kind:'turn',start:at,end:at+seconds,position,angle:a,delta,distance});at+=seconds;}direction=[...to];}
 for(let i=1;i<route.length;i++){
  turn(heading(i),route[i-1]);const length=Math.hypot(route[i][0]-route[i-1][0],route[i][1]-route[i-1][1]),seconds=length/3.2;
  segments.push({kind:'move',start:at,end:at+seconds,from:route[i-1],to:route[i],direction:[...direction],distance,length});at+=seconds;distance+=length;
 }
 if(finalDirection)turn(finalDirection,route.at(-1));
 return {segments,referenceSeconds:at,distance,start:route[0],end:route.at(-1),startDirection:firstDirection,endDirection:direction};
}
export function sampleForkliftRoute(motion,fraction){
 const u=clamp(fraction);if(u<=0)return {position:[...motion.start],direction:[...motion.startDirection],distance:0};if(u>=1)return {position:[...motion.end],direction:[...motion.endDirection],distance:motion.distance};
 const t=u*motion.referenceSeconds,s=motion.segments.find(s=>t<s.end)||motion.segments.at(-1);if(!s)return {position:[...motion.end],direction:[...motion.endDirection],distance:0};
 const v=(t-s.start)/(s.end-s.start);
 if(s.kind==='turn'){const angle=s.angle+s.delta*smooth(v);return {position:[...s.position],direction:[Math.sin(angle),Math.cos(angle)],distance:s.distance};}
 return {position:s.from.map((x,i)=>x+(s.to[i]-x)*v),direction:[...s.direction],distance:s.distance+s.length*v};
}
function externalReturnRoute(event){
 if(event.to!=='truck')return dbrRoute(event.to,'parking',event.toPosition,DBR_PARKS[event.vehicleIndex],event.vehicleIndex);
 // Back out over the actual loading access; do not turn beneath the trailer
 // or cross the still occupied staging row on the way to the next job.
 return [...event.route].reverse().concat(dbrRoute('dispatch','parking',event.fromPosition,DBR_PARKS[event.vehicleIndex],event.vehicleIndex).slice(1));
}
export function compileForkliftCycleMotion(event){
 const park=DBR_PARKS[event.vehicleIndex],loaded=event.loadedMotion||compileForkliftRoute(event.route,{reverseFirst:!['component-m1','dispatch'].includes(event.from)&&!(event.from==='stock'&&event.vehicleIndex===0),reverseUntil:event.from==='us2'?15:0});
 return {loaded,approach:event.approachMotion||compileForkliftRoute(event.approachRoute||dbrRoute('parking',event.from,park,event.fromPosition,event.vehicleIndex),{initialDirection:LOGISTICS_LAYOUT.parkDirection,finalDirection:loaded.startDirection}),
  returning:event.returnMotion||compileForkliftRoute(event.returnRoute||externalReturnRoute(event),{reverseFirst:event.to!=='component-m2',reverseUntil:event.to==='truck'?event.route.length:event.to==='us2'?14:0,reverseLast:true,initialDirection:loaded.endDirection,finalDirection:LOGISTICS_LAYOUT.parkDirection})};
}


// Conservative swept polygons: exact for translation; angular subdivisions
// include the arc sagitta, so a fast turn cannot tunnel between sampled poses.
export function sweepForkliftRoute(motion,start,end,bounds=LOGISTICS_LAYOUT.forkliftBounds){
 const yaw=d=>Math.atan2(-d[0],-d[1]),radius=Math.max(...boxCorners([0,0],0,bounds).map(p=>Math.hypot(...p))),out=[];
 for(const segment of motion.segments){
  const divisions=segment.kind==='turn'?Math.max(1,Math.ceil(Math.abs(segment.delta)/.04)):Math.max(1,Math.ceil(segment.length/1));
  for(let i=0;i<divisions;i++){
   const a=segment.start+(segment.end-segment.start)*i/divisions,b=segment.start+(segment.end-segment.start)*(i+1)/divisions,
    p=sampleForkliftRoute(motion,a/motion.referenceSeconds),q=sampleForkliftRoute(motion,b/motion.referenceSeconds),
    angle=Math.abs(Math.atan2(Math.sin(yaw(q.direction)-yaw(p.direction)),Math.cos(yaw(q.direction)-yaw(p.direction)))),margin=radius*(1-Math.cos(angle/2))+1e-9;
   const points=[...boxCorners(p.position,yaw(p.direction),bounds),...boxCorners(q.position,yaw(q.direction),bounds)].flatMap(v=>[[-margin,-margin],[-margin,margin],[margin,-margin],[margin,margin]].map(d=>[v[0]+d[0],v[1]+d[1]]));
   out.push({start:start+(end-start)*a/motion.referenceSeconds,end:start+(end-start)*b/motion.referenceSeconds,polygon:convexHull(points),phase:segment.kind});
  }
 }
 return out;
}
function loadedForkliftSweeps(e,motion=compileForkliftCycleMotion(e).loaded,bounds=LOGISTICS_LAYOUT.forkliftBounds){
 const hold=Math.min(.2,(e.end-e.start)*.15),out=sweepForkliftRoute(motion,e.start+hold,e.end-hold,bounds).map(s=>({...s,id:e.id,vehicleIndex:e.vehicleIndex,phase:'loaded'}));
 for(const [start,end,point,direction]of[[e.start,e.start+hold,motion.start,motion.startDirection],[e.end-hold,e.end,motion.end,motion.endDirection]])out.push({id:e.id,vehicleIndex:e.vehicleIndex,phase:'handling',start,end,polygon:boxCorners(point,Math.atan2(-direction[0],-direction[1]),bounds)});
 return out;
}
export function externalCycleSweeps(schedule,{vehicleIndex:onlyVehicle,bounds=LOGISTICS_LAYOUT.forkliftBounds}={}){
 const out=[];
 function add(e,phase,motion,start,end){if(end<=start)return;for(const sweep of sweepForkliftRoute(motion,start,end,bounds))out.push({...sweep,id:e.id,vehicleIndex:e.vehicleIndex,phase});}
 function loaded(e,motion){out.push(...loadedForkliftSweeps(e,motion.loaded,bounds));}
 for(const e of [...schedule.timeline.filter(e=>e.transportMode==='forklift'),...schedule.componentTransfers].filter(e=>onlyVehicle===undefined||e.vehicleIndex===onlyVehicle)){
  const m=compileForkliftCycleMotion(e),first=e.from!=='component-m1',last=e.to!=='component-m1';
  if(first)add(e,'approach',m.approach,e.approachStart,e.approachEnd??e.start);
  loaded(e,m);
  if(last)add(e,'return',m.returning,e.returnStart??e.end,e.returnEnd);
  for(const [start,end,point,direction]of[[first?(e.approachEnd??e.start):e.start,e.start,e.fromPosition,m.loaded.startDirection],[e.end,last?(e.returnStart??e.end):e.end,e.toPosition,m.loaded.endDirection]])if(end>start)out.push({id:e.id,vehicleIndex:e.vehicleIndex,phase:'corridor-wait',start,end,polygon:boxCorners(point,Math.atan2(-direction[0],-direction[1]),bounds)});
 }
 for(let vehicleIndex=0;vehicleIndex<5;vehicleIndex++){
  if(onlyVehicle!==undefined&&vehicleIndex!==onlyVehicle)continue;let at=0,position=DBR_PARKS[vehicleIndex],direction=LOGISTICS_LAYOUT.parkDirection;
  for(const c of [...schedule.logisticsCycles.filter(c=>c.vehicleIndex===vehicleIndex),{start:600,end:600}]){
   if(c.start>at)out.push({start:at,end:c.start,id:`idle-${vehicleIndex}`,vehicleIndex,phase:'idle',polygon:boxCorners(position,Math.atan2(-direction[0],-direction[1]),bounds)});
   at=c.end;position=c.idlePosition||position;direction=c.idleDirection||direction;
  }
 }
 return out;
}

// Conservative conflicts, not claims of contact at a sampled instant. Every
// motion segment and parked interval participates, including sub-frame moves.
export function externalTrafficConflicts(sweeps){
 const sorted=[...sweeps].sort((a,b)=>a.start-b.start),groups=new Map();
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length&&sorted[j].start<sorted[i].end;j++){
  const a=sorted[i],b=sorted[j];if(a.vehicleIndex===b.vehicleIndex||!boxesOverlap(a.polygon,b.polygon))continue;
  const start=Math.max(a.start,b.start),end=Math.min(a.end,b.end);if(end<=start)continue;
  const key=[a.id,b.id].sort().join('/'),prior=groups.get(key);
  if(prior){prior.start=Math.min(prior.start,start);prior.end=Math.max(prior.end,end);prior.segmentPairs++;}else groups.set(key,{ids:[a.id,b.id],vehicles:[a.vehicleIndex,b.vehicleIndex],start,end,segmentPairs:1});
 }
 return [...groups.values()];
}


const polygonBounds=polygon=>({min:[0,1].map(i=>Math.min(...polygon.map(p=>p[i]))),max:[0,1].map(i=>Math.max(...polygon.map(p=>p[i])))});
const boundsIntersect=(a,b)=>a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1];
// Broad-phase spatial index only: every candidate still goes through the
// original AABB and polygon tests. Grid cells do not decide collision freedom.
function spatialReservationIndex(items){
 const cells=new Map(),size=4;
 const keys=b=>{const result=[];for(let x=Math.floor(b.min[0]/size);x<=Math.floor(b.max[0]/size);x++)for(let z=Math.floor(b.min[1]/size);z<=Math.floor(b.max[1]/size);z++)result.push(`${x}:${z}`);return result;};
 for(const b of items)for(const key of keys(b)){if(!cells.has(key))cells.set(key,[]);cells.get(key).push(b);}
 return bounds=>{const result=new Set();for(const key of keys(bounds))for(const b of cells.get(key)||[])result.add(b);return result;};
}
export function reserveMotionWindow(motion,duration,window,obstacles){
 const swept=sweepForkliftRoute(motion,0,duration),blocked=[],query=spatialReservationIndex(obstacles.map(s=>s.min?s:{...s,...polygonBounds(s.polygon)}));
 for(const a of swept){const bounds=polygonBounds(a.polygon);for(const b of query(bounds)){
  const start=b.start-a.end,end=b.end-a.start;if(end>window.start&&start<window.end-duration&&boundsIntersect(bounds,b)&&boxesOverlap(a.polygon,b.polygon))blocked.push({start,end,id:b.id});
 }}
 let start=window.start;const blockers=new Set();for(const b of blocked.sort((a,b)=>a.start-b.start))if(b.start<start+1e-8&&b.end>start-1e-8){start=b.end+1e-5;blockers.add(b.id);}
 return {start:start+duration<=window.end+1e-8?start:null,end:start+duration,blockers:[...blockers],duration};
}

function stockLoadedReference(a,b){
 const route=[a,[a[0],-10.7],[7.8,-10.7],[7.8,-4.5]];
 for(let i=1;i<=12;i++){const angle=i*Math.PI/24;route.push([7.8+1.7*(1-Math.cos(angle)),-4.5+1.7*Math.sin(angle)]);}
 return [...route,[b[0],-2.8],b];
}
export function reserveExternalCorridors(schedule,{passes=2,maxWait=8}={}){
 let sweeps=externalCycleSweeps(schedule).map(s=>({...s,...polygonBounds(s.polygon)}));const changes=[];
 const events=[...schedule.timeline.filter(e=>e.transportMode==='forklift'),...schedule.componentTransfers],tasks=schedule.logisticsCycles;
 const cycleOf=e=>tasks.find(c=>c.id===(e.kitId||e.id)),incoming=new Set(events.map(e=>e.connectorNext).filter(Boolean));
 for(let pass=0;pass<passes;pass++){
  let changed=0;
  for(const e of events.filter(e=>e.from==='insp'&&e.to==='dispatch'||e.from==='stock'&&e.to==='lap'&&e.vehicleIndex===0)){
   const lane=LOGISTICS_LAYOUT.eastLanes[[1,4].includes(e.vehicleIndex)?1:0],a=e.fromPosition,b=e.toPosition;
   // Reference paths are the published pre-shortcut service routes. The new
   // direct path spends the distance saved on waits, at the SAME travel rate.
   const reference=e.from==='insp'?[a,[a[0],11.1],[lane,11.1],[lane,11],[b[0],11],b]:stockLoadedReference(a,b);
   const original=compileForkliftRoute(reference,{reverseFirst:true}),motion=compileForkliftCycleMotion(e).loaded,hold=Math.min(.2,(e.end-e.start)*.15),span=e.end-e.start-2*hold,referenceRate=original.referenceSeconds/span,travelSeconds=motion.referenceSeconds/referenceRate;
   if(travelSeconds>span+1e-8)continue;
   const routed=reserveForkliftPath(motion,travelSeconds,{start:e.start+hold,end:e.end-hold},sweeps.filter(b=>b.vehicleIndex!==e.vehicleIndex));if(!routed)continue;
   e.loadedMotion=routed.motion;e.loadedRouting={referenceRoute:reference,referenceRate,travelSeconds,waitSeconds:routed.waitSeconds};changed++;changes.push({id:e.id,phase:'loaded-service',start:e.start,end:e.end});sweeps=[...sweeps.filter(s=>s.vehicleIndex!==e.vehicleIndex),...externalCycleSweeps(schedule,{vehicleIndex:e.vehicleIndex}).map(s=>({...s,...polygonBounds(s.polygon)}))];
  }
  for(const e of events.filter(e=>e.connectorNext)){
   const next=events.find(n=>n.id===e.connectorNext),i=e.vehicleIndex,motion=e.connectorMotion,r=e.returnEnd-e.returnStart,a=(next.approachEnd??next.start)-next.approachStart,duration=r+a;
   // Preserve each half's reference rate: concatenate their actual clocks.
   const left=e.returnMotion,right=next.approachMotion,segments=[...left.segments.map(x=>({...x,start:x.start*r/left.referenceSeconds,end:x.end*r/left.referenceSeconds})),...right.segments.map(x=>({...x,start:r+x.start*a/right.referenceSeconds,end:r+x.end*a/right.referenceSeconds,distance:left.distance+x.distance}))],travel={...motion,referenceSeconds:duration,segments};
   let lower=e.end,upper=next.start;const other=sweeps.filter(b=>b.vehicleIndex!==i&&b.start<upper&&b.end>lower);
   const source=boxCorners(travel.start,Math.atan2(-travel.startDirection[0],-travel.startDirection[1]),LOGISTICS_LAYOUT.forkliftBounds),destination=boxCorners(travel.end,Math.atan2(-travel.endDirection[0],-travel.endDirection[1]),LOGISTICS_LAYOUT.forkliftBounds);
   for(const b of other){if(boxesOverlap(source,b.polygon))upper=Math.min(upper,b.start+duration-1e-5);if(boxesOverlap(destination,b.polygon))lower=Math.max(lower,b.end-duration+1e-5);}
   const result=upper-lower<duration-1e-8?{start:null}:reserveMotionWindow(travel,duration,{start:lower,end:upper},other);
   if(result.start===null){
    const routed=reserveForkliftPath(travel,duration,{start:e.end,end:next.start},other);if(!routed)continue;
    const parts=splitEmptyMotion(routed.motion);if(!parts)continue;
    e.returnMotion=parts[0];next.approachMotion=parts[1];e.returnStart=e.end;e.returnEnd=e.end+parts[0].referenceSeconds;next.approachStart=e.returnEnd;next.approachEnd=next.start;cycleOf(e).end=e.returnEnd;cycleOf(next).start=next.approachStart;e.returnDelay=0;
    e.safeIntervalConnection={travelSeconds:routed.travelSeconds,waitSeconds:routed.waitSeconds};changes.push({id:e.id,nextId:next.id,phase:'safe-interval-connection',start:e.end,end:next.start});changed++;sweeps=[...sweeps.filter(s=>s.vehicleIndex!==i),...externalCycleSweeps(schedule,{vehicleIndex:i}).map(s=>({...s,...polygonBounds(s.polygon)}))];continue;
   }
   if(Math.abs(e.returnStart-result.start)>1e-7){e.returnStart=result.start;e.returnEnd=result.start+r;next.approachStart=e.returnEnd;next.approachEnd=result.end;cycleOf(e).end=e.returnEnd;cycleOf(next).start=next.approachStart;e.returnDelay=result.start-e.end;changes.push({id:e.id,nextId:next.id,phase:'connection',start:result.start,end:result.end});changed++;sweeps=[...sweeps.filter(s=>s.vehicleIndex!==i),...externalCycleSweeps(schedule,{vehicleIndex:i}).map(s=>({...s,...polygonBounds(s.polygon)}))];}
  }
  for(const e of events){const i=e.vehicleIndex,list=tasks.filter(c=>c.vehicleIndex===i).sort((a,b)=>a.start-b.start),cycle=cycleOf(e),at=list.indexOf(cycle),previous=list[at-1],next=list[at+1],motion=compileForkliftCycleMotion(e);
   for(const phase of ['approach','return']){
    if(phase==='approach'&&(incoming.has(e.id)||e.from==='component-m1')||phase==='return'&&(e.connectorNext||e.to==='component-m1'))continue;
    const approach=phase==='approach',travel=approach?motion.approach:motion.returning,duration=approach?(e.approachEnd??e.start)-e.approachStart:e.returnEnd-(e.returnStart??e.end);
    let lower=approach?Math.max(previous?.end??25,e.start-duration-maxWait):e.end,upper=approach?e.start:Math.min(next?.start??600,e.end+duration+maxWait);
    const oldStart=approach?e.approachStart:e.returnStart??e.end,other=sweeps.filter(s=>s.vehicleIndex!==i&&s.start<upper&&s.end>lower);
    const waitingPoint=approach?e.fromPosition:e.toPosition,waitingDirection=approach?motion.loaded.startDirection:motion.loaded.endDirection,waiting=boxCorners(waitingPoint,Math.atan2(-waitingDirection[0],-waitingDirection[1]),LOGISTICS_LAYOUT.forkliftBounds),idlePoint=approach?travel.start:travel.end,idleDirection=approach?travel.startDirection:travel.endDirection,parked=boxCorners(idlePoint,Math.atan2(-idleDirection[0],-idleDirection[1]),LOGISTICS_LAYOUT.forkliftBounds);
    const waitingBounds=polygonBounds(waiting),parkedBounds=polygonBounds(parked);
    for(const b of other){
     if(boundsIntersect(waitingBounds,b)&&boxesOverlap(waiting,b.polygon)){if(approach&&b.start<e.start)lower=Math.max(lower,Math.min(e.start,b.end)-duration+1e-5);else if(!approach&&b.end>e.end)upper=Math.min(upper,Math.max(e.end,b.start)+duration-1e-5);}
     if(boundsIntersect(parkedBounds,b)&&boxesOverlap(parked,b.polygon)){if(approach)upper=Math.min(upper,b.start+duration-1e-5);else lower=Math.max(lower,b.end-duration+1e-5);}
    }
    if(upper-lower<duration-1e-8)continue;
    const result=reserveMotionWindow(travel,duration,{start:lower,end:upper},other);if(result.start===null||Math.abs(result.start-oldStart)<1e-7)continue;
    if(approach){e.approachStart=result.start;e.approachEnd=result.end;cycle.start=result.start;}else{e.returnStart=result.start;e.returnEnd=result.end;cycle.end=result.end;e.returnDelay=result.start-e.end;}
    (e.corridorReservations??=[]).push({phase,start:result.start,end:result.end,travelSeconds:duration,waitSeconds:approach?e.start-result.end:result.start-e.end,blockers:result.blockers});
    changes.push({id:e.id,...e.corridorReservations.at(-1)});changed++;
    sweeps=[...sweeps.filter(s=>s.vehicleIndex!==i),...externalCycleSweeps(schedule,{vehicleIndex:i}).map(s=>({...s,...polygonBounds(s.polygon)}))];
   }
  }
  if(!changed)break;
 }
 schedule.logisticsCorridorPlan={complete:false,changes,method:'Fixed-duration motion; forbidden start intervals; explicit waits. Loaded windows and industrial timestamps unchanged.'};return schedule.logisticsCorridorPlan;
}

// Safe intervals at real route vertices. Motion keeps its fixed travel budget;
// only zero-distance waits are inserted. Every edge is checked with the same
// continuous polygons that certify playback, including angular sweeps.
export function reserveForkliftPath(motion,travelSeconds,window,obstacles){
 const epsilon=1e-5,scale=travelSeconds/motion.referenceSeconds;
 if(travelSeconds>window.end-window.start+epsilon)return null;
 const nearby=obstacles.filter(b=>b.start<window.end&&b.end>window.start).map(b=>b.min?b:{...b,...polygonBounds(b.polygon)}),query=spatialReservationIndex(nearby);
 if(motion.distance<1e-8&&Math.hypot(motion.startDirection[0]-motion.endDirection[0],motion.startDirection[1]-motion.endDirection[1])<1e-8){const polygon=boxCorners(motion.start,Math.atan2(-motion.startDirection[0],-motion.startDirection[1]),LOGISTICS_LAYOUT.forkliftBounds);if(nearby.some(b=>boxesOverlap(polygon,b.polygon)))return null;const span=window.end-window.start;return {motion:{...motion,referenceSeconds:span,segments:[{kind:'move',from:motion.start,to:motion.end,direction:motion.startDirection,length:0,distance:0,start:0,end:span,waiting:true}]},travelSeconds:0,waitSeconds:span,start:window.start,end:window.end};}
 const pieces=motion.segments.flatMap(s=>{const count=s.kind==='move'?Math.max(1,Math.ceil(s.length/(window.step||2))):1;return Array.from({length:count},(_,i)=>{if(s.kind!=='move')return s;const point=u=>s.from.map((v,j)=>v+(s.to[j]-v)*u);return {...s,start:s.start+(s.end-s.start)*i/count,end:s.start+(s.end-s.start)*(i+1)/count,from:point(i/count),to:point((i+1)/count),length:s.length/count,distance:s.distance+s.length*i/count};});});
 const edges=pieces.map(s=>{const duration=(s.end-s.start)*scale,p=sampleForkliftRoute(motion,s.start/motion.referenceSeconds),q=sampleForkliftRoute(motion,s.end/motion.referenceSeconds);return {duration,motion:{segments:[{...s,start:0,end:duration}],referenceSeconds:duration,distance:q.distance,start:p.position,startDirection:p.direction,end:q.position,endDirection:q.direction}};});
 if(!edges.length)return null;
 for(const e of edges){const blocked=[];for(const a of sweepForkliftRoute(e.motion,0,e.duration)){const bounds=polygonBounds(a.polygon);for(const b of query(bounds))if(boundsIntersect(bounds,b)&&boxesOverlap(a.polygon,b.polygon))blocked.push({start:b.start-a.end,end:b.end-a.start});}e.blocked=[];for(const b of blocked.sort((a,b)=>a.start-b.start)){const last=e.blocked.at(-1);if(last&&b.start<=last.end+epsilon)last.end=Math.max(last.end,b.end);else e.blocked.push({...b});}}
 function safe(point,direction){
  const box=boxCorners(point,Math.atan2(-direction[0],-direction[1]),LOGISTICS_LAYOUT.forkliftBounds),bounds=polygonBounds(box),busy=nearby.filter(b=>boundsIntersect(bounds,b.min?b:polygonBounds(b.polygon))&&boxesOverlap(box,b.polygon)).sort((a,b)=>a.start-b.start),out=[];let at=window.start;
  for(const b of busy){if(b.start>at+epsilon)out.push({start:at,end:Math.min(window.end,b.start-epsilon)});at=Math.max(at,b.end+epsilon);}if(at<window.end)out.push({start:at,end:window.end});return out;
 }
 const nodes=[safe(motion.start,motion.startDirection),...edges.map(e=>safe(e.motion.end,e.motion.endDirection))];
 let states=nodes[0].filter(n=>n.start<=window.start+1e-8).map(interval=>({at:window.start,interval,steps:[]}));
 for(let i=0;i<edges.length&&states.length;i++){
  const e=edges[i],next=[];
  for(const interval of nodes[i+1]){let best;
   for(const state of states){const start=Math.max(state.at,interval.start-e.duration),end=Math.min(state.interval.end+e.duration,interval.end);if(start+e.duration>end+1e-8)continue;
    let departure=start;for(const b of e.blocked)if(b.start<departure+1e-8&&b.end>departure-1e-8)departure=b.end+epsilon;const r={start:departure,end:departure+e.duration};if(r.end>end+1e-8||r.start>state.interval.end+1e-8)continue;
    if(!best||r.end<best.at)best={at:r.end,interval,steps:[...state.steps,{...e,start:r.start,end:r.end}]};
   }if(best)next.push(best);
  }window.onDiagnostic?.({edge:i,source:edges[i].motion.start,destination:edges[i].motion.end,states:states.map(s=>({at:s.at,interval:s.interval})),targets:nodes[i+1],next:next.map(s=>({at:s.at,interval:s.interval}))});states=next;
 }
 const selected=states.filter(s=>s.interval.end>=window.end-1e-8).sort((a,b)=>a.at-b.at)[0];if(!selected)return null;
 const segments=[];let at=window.start,position=motion.start,direction=motion.startDirection,distance=0;
 function wait(end){if(end>at+1e-8)segments.push({kind:'move',from:position,to:position,direction,length:0,distance,start:at-window.start,end:end-window.start,waiting:true});at=end;}
 for(const step of selected.steps){wait(step.start);const s=step.motion.segments[0];segments.push({...s,start:step.start-window.start,end:step.end-window.start});at=step.end;position=step.motion.end;direction=step.motion.endDirection;distance=step.motion.distance;}
 wait(window.end);
 return {motion:{...motion,segments,referenceSeconds:window.end-window.start},travelSeconds,waitSeconds:window.end-window.start-travelSeconds,start:window.start,end:window.end};
}

export function timedEmptyRoute(previous,next,route,referenceRate){
 const a=compileForkliftCycleMotion(previous),b=compileForkliftCycleMotion(next),base=compileForkliftRoute(route,{reverseFirst:previous.to!=='component-m2',reverseUntil:route.reverseUntil,initialDirection:a.loaded.endDirection,finalDirection:b.loaded.startDirection});
 if(base.referenceSeconds<1e-8)return {motion:base,duration:0,referenceRate};
 const distance=routeLength(route.slice(0,route.joinIndex+1)),cut=base.segments.find(s=>s.kind==='move'&&s.distance+s.length>=distance-1e-7)?.end??base.referenceSeconds/2,
  before=cut/referenceRate.return,after=(base.referenceSeconds-cut)/referenceRate.approach,duration=before+after,
  clock=t=>t<=cut?t/referenceRate.return:before+(t-cut)/referenceRate.approach,
  motion={...base,referenceSeconds:duration,segments:base.segments.map(s=>({...s,start:clock(s.start),end:clock(s.end)}))};
 return {motion,duration,referenceRate};
}
function alternateEmptyRoutes(previous,next){
 const a=previous.toPosition,b=next.fromPosition,upstream=s=>['raw','torno','us1'].includes(s),shipping=s=>['insp','dispatch'].includes(s);let route;
 if(upstream(previous.to)&&shipping(next.from))route=[a,[a[0],-3],[-19.8,-3],[-19.8,18],[b[0],18],b];
 else if(shipping(previous.to)&&(upstream(next.from)||next.from==='components'))route=[a,[a[0],18],[-19.8,18],[-19.8,next.from==='components'?b[1]:-3],...(next.from==='components'?[]:[[b[0],-3]]),b];
 else if(previous.to==='lap'&&upstream(next.from))route=[a,[a[0],-1.65],[21.4,-1.65],[21.4,18],[-19.8,18],[-19.8,-3],[b[0],-3],b];
 if(previous.to==='us1'&&next.from==='us2')route=dbrRoute('us1','us2',a,b,previous.vehicleIndex).flatMap(p=>p[0]===-8.3&&p[1]===-3?[[-7.9,-3],[-7.9,-5.8],[-8.3,-7]]:[p]);
 const alternatives=[];if(route){route.joinIndex=shipping(previous.to)&&upstream(next.from)?3:previous.to==='us1'&&next.from==='us2'?5:1;alternatives.push(route);}
 if(previous.to==='lap'&&upstream(next.from)){const north=[a,[a[0],-1.65],[19.8,-1.65],[19.8,-10.7],[-.1,-10.7],[-.1,-10.3],[-19.8,-10.3],[-19.8,-3],[b[0],-3],b];north.joinIndex=4;alternatives.unshift(north);}
 if(next.from==='components'&&['component-m2','dispatch'].includes(previous.to)){
  const outer=[a,...(previous.to==='component-m2'?[[3.8,a[1]],[3.8,16.2],[-21,16.2]]:[[a[0],18],[-21,18]]),[-21,10.2]];
  for(let i=1;i<=36;i++){const angle=i*Math.PI/72;outer.push([-21+8.9*(1-Math.cos(angle)),10.2-8.9*Math.sin(angle)]);}
  outer.push(b);outer.joinIndex=outer.length-2;alternatives.push(outer);
 }
 return alternatives;
}

// Temporal broad phase retains the original reservation objects and intervals.
export function createTemporalIndex(items=[],bucketSeconds=2){
 const buckets=new Map();
 function add(items){for(const item of items){if(!Number.isFinite(item.start)||!Number.isFinite(item.end))throw new Error('Non-finite reservation');for(let k=Math.floor(item.start/bucketSeconds);k<=Math.floor(item.end/bucketSeconds);k++){if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(item);}}}
 add(items);
 return {add,between(start,end){const found=new Set();for(let k=Math.floor(start/bucketSeconds);k<=Math.floor(end/bucketSeconds);k++)for(const item of buckets.get(k)||[])if(item.start<end&&item.end>start)found.add(item);return [...found];}};
}

// Merge only consecutive envelopes of the same body in one spatial cell.
// The union contains every original box for the entire combined interval.
export function coalesceReservations(reservations,{cellSize=.5}={}){
 const result=[],last=new Map();
 for(const a of reservations){const key=`${a.id}:${a.body}`,cell=a.min.map((v,i)=>Math.floor((v+a.max[i])/(2*cellSize))).join(','),previous=last.get(key);
  if(previous&&previous.cell===cell&&a.start<=previous.box.end+1e-7){const b=previous.box;b.end=Math.max(b.end,a.end);for(let i=0;i<2;i++){b.min[i]=Math.min(b.min[i],a.min[i]);b.max[i]=Math.max(b.max[i],a.max[i]);}}
  else{const box={...a,min:[...a.min],max:[...a.max]};result.push(box);last.set(key,{cell,box});}
 }
 return result.map(b=>({...b,polygon:boxCorners([0,0],0,b)}));
}

// Reuse the existing fleet when a complete connector has no safe interval.
// Loaded appointments and industrial timestamps are immutable.
export function reassignExternalAppointment(schedule,id,{exclude=[],preserveRoute=false}={}){
 const event=schedule.timeline.find(e=>e.id===id&&e.transportMode==='forklift');
 if(!event||event.kitId)return null;
 const candidates=[];
 for(let i=0;i<LOGISTICS_LAYOUT.fleet.length;i++){
  if(i===event.vehicleIndex||exclude.includes(i))continue;
  if(preserveRoute&&JSON.stringify(dbrRoute(event.from,event.to,event.fromPosition,event.toPosition,i))!==JSON.stringify(event.route))continue;
  const busy=[...schedule.timeline.filter(e=>e!==event&&e.transportMode==='forklift'&&e.vehicleIndex===i),...(schedule.componentPlan?.missions||[]).filter(e=>e.vehicleIndex===i)];
  if(busy.some(e=>e.start<event.end+1e-7&&e.end>event.start-1e-7))continue;
  const before=event.start-Math.max(25,...busy.filter(e=>e.end<=event.start).map(e=>e.end)),after=Math.min(600,...busy.filter(e=>e.start>=event.end).map(e=>e.start))-event.end;
  if(before<=0||after<=0)continue;
  candidates.push({index:i,clearance:Math.min(before,after),before,after});
 }
 candidates.sort((a,b)=>b.clearance-a.clearance||a.index-b.index);const choice=candidates[0];if(!choice)return null;
 const change={id,from:event.vehicleId,to:LOGISTICS_LAYOUT.fleet[choice.index].id,start:event.start,end:event.end,before:choice.before,after:choice.after};
 event.vehicleIndex=choice.index;event.vehicleId=change.to;event.route=dbrRoute(event.from,event.to,event.fromPosition,event.toPosition,choice.index);
 return change;
}

// Plan empty traffic against immutable loaded appointments, then reserve each
// complete connector. Unplanned empty trips cannot deadlock one another by
// waiting speculatively at the same future bay.
export function planExternalCirculation(schedule,{onFailure,backgroundSweeps=[],resourceChanges=schedule.logisticsCorridorPlan?.resourceChanges||[]}={}){
 const frozen=backgroundSweeps.length?new Map(schedule.timeline.filter(e=>e.loadedMotion).map(e=>[e.id,{loadedMotion:e.loadedMotion,loadedRouting:e.loadedRouting}])):null;
 compileExternalCycles(schedule);if(frozen)for(const e of schedule.timeline)Object.assign(e,frozen.get(e.id));
 const events=[...schedule.timeline.filter(e=>e.transportMode==='forklift'),...schedule.componentTransfers],changes=[],unresolved=[];
 const bounds=s=>({...s,...polygonBounds(s.polygon)}),cycleOf=e=>schedule.logisticsCycles.find(c=>c.id===(e.kitId||e.id));
 let loaded=[...externalCycleSweeps(schedule).filter(s=>['loaded','handling'].includes(s.phase)),...backgroundSweeps].map(bounds);
 const parked=DBR_PARKS.map((p,i)=>bounds({id:`park-${i}`,vehicleIndex:i,start:0,end:600,polygon:boxCorners(p,-Math.PI/2,LOGISTICS_LAYOUT.forkliftBounds)}));
 for(const e of events.filter(e=>!backgroundSweeps.length&&(e.from==='insp'&&e.to==='dispatch'||e.from==='stock'&&e.to==='lap'&&e.vehicleIndex===0)).sort((a,b)=>a.end-b.end)){
  const lane=LOGISTICS_LAYOUT.eastLanes[[1,4].includes(e.vehicleIndex)?1:0],a=e.fromPosition,b=e.toPosition,reference=e.from==='insp'?[a,[a[0],11.1],[lane,11.1],[lane,11],[b[0],11],b]:stockLoadedReference(a,b),motion=compileForkliftCycleMotion(e).loaded,hold=Math.min(.2,(e.end-e.start)*.15),span=e.end-e.start-2*hold,referenceRate=compileForkliftRoute(reference,{reverseFirst:true}).referenceSeconds/span,travelSeconds=motion.referenceSeconds/referenceRate;
  if(travelSeconds>span+1e-8)continue;
  const routed=reserveForkliftPath(motion,travelSeconds,{start:e.start+hold,end:e.end-hold},[...loaded,...parked].filter(b=>b.vehicleIndex!==e.vehicleIndex));if(!routed)continue;
  e.loadedMotion=routed.motion;e.loadedRouting={referenceRoute:reference,referenceRate,travelSeconds,waitSeconds:routed.waitSeconds};
  loaded=[...loaded.filter(b=>b.id!==e.id),...loadedForkliftSweeps(e).map(bounds)];
 }
 const tasks=[];
 for(let i=0;i<5;i++){
  const list=events.filter(e=>e.vehicleIndex===i).sort((a,b)=>a.start-b.start);
  for(let j=0;j<=list.length;j++){
   const previous=list[j-1],next=list[j];if(previous?.kitId&&previous.kitId===next?.kitId)continue;
   const a=previous&&compileForkliftCycleMotion(previous),b=next&&compileForkliftCycleMotion(next),r=previous?(previous.returnEnd-previous.end):0,q=next?(next.start-next.approachStart):0;
   if(previous&&next&&next.start-previous.end<=20){
    const referenceRate={return:a.returning.referenceSeconds/r,approach:b.approach.referenceSeconds/q},profile=timedEmptyRoute(previous,next,joinEmptyRoutes(previous,next),referenceRate);
    tasks.push({kind:'connection',previous,next,vehicleIndex:i,...profile,start:previous.end,end:next.start});
   }else{
    if(previous)tasks.push({kind:'return',previous,vehicleIndex:i,motion:a.returning,duration:r,start:previous.end,end:Math.min(600,previous.end+8,next?next.start-q:600)});
    if(next)tasks.push({kind:'approach',next,vehicleIndex:i,motion:b.approach,duration:q,start:Math.max(25,next.start-8,previous?previous.end+r:25),end:next.start});
   }
  }
 }
 const idle=[];
 for(let i=0;i<5;i++){let at=0;const spans=[...events.filter(e=>e.vehicleIndex===i).map(e=>({start:e.start,end:e.end})),...tasks.filter(t=>t.vehicleIndex===i)].sort((a,b)=>a.start-b.start);for(const span of [...spans,{start:600,end:600}]){if(span.start>at)idle.push({...parked[i],start:at,end:span.start});at=Math.max(at,span.end);}}
 // Every delivery owns a short departure clearance. Later reservations may
 // not enter its body immediately after the loaded appointment ends.
 const clearances=tasks.filter(t=>t.previous&&t.duration>0).flatMap(t=>sweepForkliftRoute(t.motion,t.start,t.start+t.duration).filter(s=>s.start<t.start+.1).map(s=>bounds({...s,end:Math.min(s.end,t.start+.1),id:`clearance:${t.previous.id}`,vehicleIndex:t.vehicleIndex,phase:'departure-clearance'})));
 let reserved=[...loaded,...idle,...clearances];const timeIndex=createTemporalIndex(reserved);
 for(const task of tasks.sort((a,b)=>a.end-b.end||a.start-b.start)){
  const other=timeIndex.between(task.start,task.end).filter(b=>b.vehicleIndex!==task.vehicleIndex);let routed=reserveForkliftPath(task.motion,task.duration,task,other);
  if(!routed&&task.kind==='connection')for(const route of alternateEmptyRoutes(task.previous,task.next)){
   const profile=timedEmptyRoute(task.previous,task.next,route,task.referenceRate),candidate=reserveForkliftPath(profile.motion,profile.duration,{...task,step:.5},other);
   if(candidate){routed=candidate;Object.assign(task,profile,{alternateCorridor:true});break;}
  }
  if(!routed&&task.kind==='connection'){
   // The assigned parking pocket is a real alternative to a short connector.
   // Keep the original return and approach clocks, including all their turns.
   const a=compileForkliftCycleMotion(task.previous).returning,b=compileForkliftCycleMotion(task.next).approach,
    r=task.previous.returnEnd-task.previous.end,q=task.next.start-task.next.approachStart,
    motion={...a,end:b.end,endDirection:b.endDirection,distance:a.distance+b.distance,referenceSeconds:r+q,
     segments:[...a.segments.map(s=>({...s,start:s.start*r/a.referenceSeconds,end:s.end*r/a.referenceSeconds})),...b.segments.map(s=>({...s,start:r+s.start*q/b.referenceSeconds,end:r+s.end*q/b.referenceSeconds,distance:a.distance+s.distance}))]};
   const fallback=reserveForkliftPath(motion,r+q,{...task,step:.5},other);
   if(fallback){routed=fallback;task.motion=motion;task.duration=r+q;task.viaParking=true;}
  }
  if(!routed)routed=reserveForkliftPath(task.motion,task.duration,{...task,step:.25},other);
  if(!routed){onFailure?.(task,other.filter(b=>b.start<task.end&&b.end>task.start));unresolved.push({kind:task.kind,ids:[task.previous?.id,task.next?.id].filter(Boolean),start:task.start,end:task.end,travelSeconds:task.duration});continue;}
  const check=sweepForkliftRoute(routed.motion,task.start,task.end),checkQuery=spatialReservationIndex(other.filter(b=>b.start<task.end&&b.end>task.start));
  for(const x of check)for(const y of checkQuery(polygonBounds(x.polygon)))if(x.start<y.end-1e-8&&y.start<x.end-1e-8&&boxesOverlap(x.polygon,y.polygon)){onFailure?.({...task,routed,invalidPair:{x,y}},other);throw new Error(`Unsafe safe-interval result: ${task.previous?.id}/${task.next?.id} against ${y.id} at ${Math.max(x.start,y.start)}`);}
  const {previous:e,next:n}=task;
  if(task.kind==='connection'){
   const [left,right]=splitEmptyMotion(routed.motion);e.returnStart=e.end;e.returnEnd=e.end+left.referenceSeconds;e.returnMotion=left;e.connectorNext=n.id;e.connectorMotion=task.motion;n.approachStart=e.returnEnd;n.approachEnd=n.start;n.approachMotion=right;cycleOf(e).end=e.returnEnd;cycleOf(n).start=n.approachStart;cycleOf(e).idlePosition=left.end;cycleOf(e).idleDirection=left.endDirection;e.safeIntervalConnection={travelSeconds:task.duration,waitSeconds:routed.waitSeconds,referenceRate:task.referenceRate};
  }else if(task.kind==='return'){e.returnStart=task.start;e.returnEnd=task.end;e.returnMotion=routed.motion;cycleOf(e).end=e.returnEnd;cycleOf(e).idlePosition=routed.motion.end;cycleOf(e).idleDirection=routed.motion.endDirection;}
  else {n.approachStart=task.start;n.approachEnd=task.end;n.approachMotion=routed.motion;cycleOf(n).start=n.approachStart;}
  const accepted=sweepForkliftRoute(routed.motion,task.start,task.end).map(s=>bounds({...s,id:`empty:${e?.id||n.id}`,vehicleIndex:task.vehicleIndex,phase:task.kind}));timeIndex.add(accepted);
  changes.push({kind:task.kind,ids:[e?.id,n?.id].filter(Boolean),start:task.start,end:task.end,travelSeconds:task.duration,waitSeconds:routed.waitSeconds});
 }
 for(const e of events)e.returnDuration=e.returnEnd-(e.returnStart??e.end);
 const blocked=unresolved.find(c=>c.kind==='connection'&&schedule.timeline.some(e=>e.id===c.ids[1]&&['raw','torno','us1','us2'].includes(e.from)));
 if(blocked&&resourceChanges.length<8){const event=schedule.timeline.find(e=>e.id===blocked.ids[1]),change=reassignExternalAppointment(schedule,event.id,{preserveRoute:backgroundSweeps.length>0,exclude:resourceChanges.filter(c=>c.id===event.id).flatMap(c=>[Number(c.from.split('-').at(-1))-1,Number(c.to.split('-').at(-1))-1])});
  if(change){const retry=planExternalCirculation(schedule,{onFailure,backgroundSweeps,resourceChanges:[...resourceChanges,change]});return retry;}
 }
 schedule.logisticsCorridorPlan={resourceChanges,complete:unresolved.length===0,method:'Loaded appointments first; fixed-rate safe intervals for complete empty trips',changes,unresolved};
 return schedule.logisticsCorridorPlan;
}
