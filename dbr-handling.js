import {compileForkliftCycleMotion,sampleForkliftRoute} from './logistics-motion.js';
import {sampleInternalTransport} from './internal-motion.js';
import {OPERATION_TIMING} from './dbr-timing.js';
import {LOGISTICS_LAYOUT,boxCorners,boxesOverlap} from './logistics-layout.js';
import {DBR_LAYOUT,dbrStationAccessRoute,dbrWorkStand,DBR_BAYS,DBR_PARKS,sampleRoute,routeLength,dbrRoute} from './dbr-layout.js';
import {CONVEYOR_HEIGHT,hasConveyorPort} from './dbr-conveyors.js';
import {transferProgress,transferLift} from './dbr-presentation.js';
export const DBR_HANDLING_BAYS=[];
export const DBR_BUFFER_OPERATOR={stand:[1.7,0],workStand:[1.7,0],machineIndex:null};
export const DBR_MOVEMENT_LABEL='Pallets identificados · transporte físico integral';
const EPS=1e-7,clamp=t=>Math.max(0,Math.min(1,t)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*clamp(t));
const platformHeight=p=>{const a=LOGISTICS_LAYOUT.platform;return p[1]>=a.rampStart&&p[1]<a.deckEnd?a.height*clamp((p[1]-a.rampStart)/(a.rampEnd-a.rampStart)):0;};
function idleFleetPose(prior,t,park,motion){
 if(!prior)return {position:park,direction:LOGISTICS_LAYOUT.parkDirection,distance:0};
 if(prior.to==='component-m1')return {position:prior.toPosition,direction:motion.loaded.endDirection,distance:0};
 const end=prior.returnEnd??prior.end+2,start=prior.returnStart??prior.end,u=clamp((t-start)/Math.max(EPS,end-start));
 return sampleForkliftRoute(motion.returning,u);
}

const base=(p,stage)=>[p[0],hasConveyorPort(stage)?CONVEYOR_HEIGHT+.25:.3,p[1]],direction=(a,b)=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1]);return d>EPS?[(b[0]-a[0])/d,(b[1]-a[1])/d]:[0,-1];};
const cfg=(stage,index=0)=>{const f=DBR_LAYOUT[stage]?.[index]||DBR_LAYOUT[stage]?.[0];return f?{fixture:f,stand:[f[0],f[2]+.8],workStand:dbrWorkStand(stage,index),machineIndex:index}:null;};
const field=(lot,p,stage)=>({batchId:lot.id,lotId:lot.id,orderId:lot.orderId||lot.id,product:lot.product||((lot.body==='z3')?'Corpos Z3':'Corpos genéricos'),quantity:lot.quantity,initial:lot.initial,inventoryLabel:stage==='buffer',stage,partStage:stage==='buffer'?'rosq':stage,position:[...p],palletY:hasConveyorPort(stage)?CONVEYOR_HEIGHT:.05,partPosition:base(p,stage),partLocation:hasConveyorPort(stage)?'conveyor':'bay',onCart:false,stationId:null,machineIndex:null,bufferMember:stage==='buffer'});
function operatorPose(stage,index,bay,part,t,carrying){const c=cfg(stage,index);if(!c)return null;const position=sampleRoute(dbrStationAccessRoute(stage,index,bay),t).position;return {stationId:stage,machineIndex:index,position,direction:direction(position,[part[0],part[2]]),distance:Math.hypot(position[0]-c.workStand[0],position[1]-c.workStand[1]),carrying};}
export function compileDbrHandling(snapshot){
 const timeline=snapshot.timeline,transfers=[...timeline.filter(e=>e.kind==='transfer').map(e=>e.transportMode==='trolley'&&e.loadedEnd!=null?{...e,start:e.pickupStart,end:e.loadedEnd}:e),...(snapshot.componentTransfers||[])],all=new Map(snapshot.lots.map(l=>[l.id,l]));
 for(const e of [...timeline,...transfers])if(!all.has(e.lotId))all.set(e.lotId,{id:e.lotId,product:e.product,body:e.body,quantity:e.quantity,initial:false,releasedAt:e.start});
 const sequences=new Map([...all].map(([id])=>[id,transfers.filter(e=>e.lotId===id).sort((a,b)=>a.start-b.start)]));
 const processByKey=new Map(timeline.filter(e=>['process','replenishment-process'].includes(e.kind)).map(e=>[`${e.lotId}:${e.station}`,e]));
 const motions=new Map(transfers.filter(e=>e.vehicleIndex!==null&&e.vehicleIndex!==undefined).map(e=>[e,compileForkliftCycleMotion(e)]));
 const vehicleEvents=Array.from({length:LOGISTICS_LAYOUT.fleet.length},(_,i)=>transfers.filter(e=>e.vehicleIndex===i).sort((a,b)=>a.approachStart-b.approachStart));
 return {events:transfers,visualTrips:snapshot.trips,
  sample(current,seconds=current.animationTime??current.elapsed){
   const t=seconds,processTime=current.film?.factoryAnimationTime??t,ground=!!(current.internalTransportPlan||snapshot.internalTransportPlan),loads=new Map(),operators=new Map(),stationActions=new Map(),machineOccupants=new Map(),bufferPallets=new Map();
   const fleet=vehicleEvents.map((list,i)=>{
    const at=current.elapsed<OPERATION_TIMING.productionStart?current.elapsed:seconds,e=list.find(e=>at>=e.approachStart&&at<e.end),prior=list.filter(e=>e.end<=at).at(-1),park=DBR_PARKS[i];
    let {position,direction:dir,distance}=idleFleetPose(prior,at,park,motions.get(prior)),forkLift=0;
    if(e){
     if(at<e.start){const p=sampleForkliftRoute(motions.get(e).approach,(at-e.approachStart)/((e.approachEnd??e.start)-e.approachStart));position=p.position;dir=p.direction;distance=p.distance;}
     else {const u=transferProgress(e,at),p=sampleForkliftRoute(motions.get(e).loaded,u);position=p.position;dir=p.direction;distance=p.distance;forkLift=transferLift(e,at)+(!ground&&hasConveyorPort(e.from)?CONVEYOR_HEIGHT-.05:0)*(1-u)+(!ground&&hasConveyorPort(e.to)?CONVEYOR_HEIGHT-.05:0)*u;}

    }
    return {id:LOGISTICS_LAYOUT.fleet[i].id,visible:true,position:[...position],direction:dir,vehicleDirection:dir,forkLift,distance,groundHeight:platformHeight(position),event:e||null,priorEvent:prior||null};
   });
   if(current.logisticsOnly)return {fleet};
   const fieldAt=(lot,p,stage)=>{const load=field(lot,p,stage);if(ground&&hasConveyorPort(stage))Object.assign(load,{palletY:.05,partPosition:[p[0],.3,p[1]],partLocation:'bay'});return load;};
   function manual(load,stage,index,bay,part,progress,unloading){const pose=operatorPose(stage,index,bay,part,unloading?progress:1-progress,true);if(!pose)return;const key=`${stage}:${index}`;operators.set(key,pose);if(index===0)operators.set(stage,pose);const c=cfg(stage,index),action={id:`HAND-${load.batchId}`,kind:'station',stationId:stage,machineIndex:index,batchId:load.batchId,lotId:load.batchId,phaseKey:unloading?'source_carry_out':'station_carry_in',phaseProgress:progress,operatorPosition:pose.position,operatorDirection:pose.direction,operatorDistance:pose.distance,partPosition:part,partLocation:'hands',fixture:c.fixture,workStand:c.workStand};stationActions.set(key,action);if(index===0)stationActions.set(stage,action);load.partLocation='hands';load.stationId=stage;load.machineIndex=index;}
   for(const [id,lot]of all){const seq=sequences.get(id)||[],first=seq[0],t=id.startsWith('KIT-')?current.elapsed:seq.some(e=>e.to==='truck'&&seconds>=e.start)?seconds:processTime;if(!lot.initial&&(!first||t<Math.min(lot.releasedAt??first.start,first.start)))continue;
    const active=seq.find(e=>t>=e.start&&t<e.end),last=seq.filter(e=>e.end<=t).at(-1),future=seq.find(e=>e.start>t);
    let load;
    if(active?.transportMode==='conveyor'){const p=sampleRoute(active.route,transferProgress(active,t));load=fieldAt(lot,p.position,active.from);load.partLocation='conveyor';load.stage='transport';load.palletYaw=0;load.partYaw=0;load.bufferMember=false;load.from=active.from;load.to=active.to;}
    else if(active?.transportMode==='trolley'){load=fieldAt(lot,active.fromPosition,active.from);Object.assign(load,{stage:'transport',bufferMember:false,from:active.from,to:active.to,vehicleId:null,vehicleIndex:null});}
    else if(active){load=fieldAt(lot,active.fromPosition,active.from);const pose=fleet[active.vehicleIndex];load.position=[...pose.position];load.partPosition=[pose.position[0],.3+pose.forkLift+pose.groundHeight,pose.position[1]];load.onCart=true;load.partLocation='vehicle';load.vehicleId=active.vehicleId;load.palletY=.05+pose.forkLift+pose.groundHeight;load.palletDirection=pose.direction;load.partStage=active.from==='raw'?'stock':active.from;load.stage='transport';load.bufferMember=false;load.from=active.from;load.to=active.to;}
    else if(last){
     if(last.to==='component-m2'||last.to==='stock'&&id.startsWith('DBR-REP-'))continue;
     load=fieldAt(lot,last.toPosition,last.to);if(last.to==='truck'){const trip=current.trips.find(tr=>tr.lotIds.includes(id));if(!trip||t>=trip.exitAt)continue;load.partLocation='truck';load.palletY=.89;load.partPosition=[load.position[0],1.14,load.position[1]];}
     else if(DBR_LAYOUT[last.to]){
      const process=processByKey.get(`${id}:${last.to}`);
      const idx=process?.machineIndex||0,f=last.toMachine||cfg(last.to,idx)?.fixture;
      if(process&&t>=process.start&&t<process.end&&hasConveyorPort(last.to)){load.stationId=last.to;load.machineIndex=idx;machineOccupants.set(`${last.to}:${idx}`,id);if(!idx)machineOccupants.set(last.to,id);}
      else if(process&&t>=process.start&&t<process.end&&f){const loadStart=process.start+.3,loadEnd=Math.min(process.start+.6,process.end-.6),unloadStart=Math.max(loadEnd,process.end-.6);
       if(t<loadEnd){const a=clamp((t-loadStart)/Math.max(.001,loadEnd-loadStart));load.partPosition=mix(base(load.position),f,a);if(t>=loadStart)manual(load,last.to,idx,load.position,load.partPosition,a,false);}
       else if(t>=unloadStart){const a=clamp((t-unloadStart)/Math.max(.001,process.end-.3-unloadStart));load.partPosition=mix(f,base(load.position),a);if(t<process.end-.3)manual(load,last.to,idx,load.position,load.partPosition,a,true);}
       else {load.partPosition=[...f];load.partLocation='machine';load.stationId=last.to;load.machineIndex=idx;machineOccupants.set(`${last.to}:${idx}`,id);if(idx===0)machineOccupants.set(last.to,id);}
      }
     }
    }else if(lot.initial){load=fieldAt(lot,(snapshot.handlingBays||DBR_BAYS).buffer[lot.bufferSlot],'buffer');}
    else {const stage=first.from;load=fieldAt(lot,first.fromPosition,stage);}
    if(load){loads.set(id,load);if(load.stage==='buffer')bufferPallets.set(id,{id,quantity:lot.quantity,position:[...load.position]});}
   }
   {const t=processTime;for(const e of transfers){if(!DBR_LAYOUT[e.to]||hasConveyorPort(e.to))continue;const process=processByKey.get(`${e.lotId}:${e.to}`),loadAt=process?process.start+.3:e.end;if(t<loadAt-.3||t>=loadAt)continue;const idx=process?.machineIndex||0,c=cfg(e.to,idx),u=clamp((t-loadAt+.3)/.3),pose=operatorPose(e.to,idx,e.toPosition,base(e.toPosition),u,false),key=`${e.to}:${idx}`;operators.set(key,pose);if(!idx)operators.set(e.to,pose);const action={kind:'station',stationId:e.to,machineIndex:idx,batchId:e.lotId,phaseKey:'station_approach',phaseProgress:u,operatorPosition:pose.position,operatorDirection:pose.direction,operatorDistance:pose.distance,partPosition:base(e.toPosition),fixture:c.fixture,workStand:c.workStand};stationActions.set(key,action);if(!idx)stationActions.set(e.to,action);}
   for(const e of timeline){if(hasConveyorPort(e.station)||e.kind!=='replenishment-process'||t<e.end-.3||t>=e.end)continue;const idx=e.machineIndex||0,key=`${e.station}:${idx}`;if(stationActions.has(key))continue;const inbound=transfers.find(x=>x.lotId===e.lotId&&x.to===e.station),c=cfg(e.station,idx);if(!inbound||!c)continue;const u=clamp((t-(e.end-.3))/.3),pose=operatorPose(e.station,idx,inbound.toPosition,base(inbound.toPosition),1-u,false);operators.set(key,pose);if(!idx)operators.set(e.station,pose);const action={kind:'station',stationId:e.station,machineIndex:idx,batchId:e.lotId,phaseKey:'station_return',phaseProgress:u,operatorPosition:pose.position,operatorDirection:pose.direction,operatorDistance:pose.distance,partPosition:base(inbound.toPosition),fixture:c.fixture,workStand:c.workStand};stationActions.set(key,action);if(!idx)stationActions.set(e.station,action);}
   }
   for(const [stage,fixtures]of Object.entries(DBR_LAYOUT))for(let i=0;i<fixtures.length;i++){const key=`${stage}:${i}`,c=cfg(stage,i);if(!operators.has(key))operators.set(key,{position:c.workStand,direction:[0,-1],distance:0});if(i===0&&!operators.has(stage))operators.set(stage,operators.get(key));}
   // Physical protection includes the remaining units of the pallet feeding M1.
   // Keep this remainder visible on that same identified pallet, not a second load.
   for(const p of current.buffer.pallets.filter(p=>p.feeding)){
    const load=loads.get(p.id);if(!load)continue;
    load.quantity=p.quantity;load.inventoryLabel=true;load.bufferMember=true;
    bufferPallets.set(p.id,{id:p.id,quantity:p.quantity,position:[...load.position],feeding:true});
   }
   const internalPlan=current.internalTransportTrial?.plan||current.internalTransportPlan||snapshot.internalTransportPlan,internal=internalPlan?sampleInternalTransport(internalPlan,processTime):null;
   if(ground){const pose={position:DBR_BUFFER_OPERATOR.workStand,direction:[0,-1],distance:0};operators.set('buffer:0',pose);operators.set('buffer',pose);}
   if(internal){
    for(const [id,patch]of internal.loads){const load=loads.get(id);if(!load)throw new Error(`Missing internal load: ${id}`);const yaw=patch.direction?Math.atan2(-patch.direction[0],-patch.direction[1]):patch.yaw??0;Object.assign(load,patch,{palletYaw:yaw,partYaw:yaw});if(bufferPallets.has(id))bufferPallets.get(id).position=[...load.position];}
    for(const [id,pose]of internal.operators){operators.set(id,pose);stationActions.delete(id);if(id.endsWith(':0')){operators.set(id.split(':')[0],pose);stationActions.delete(id.split(':')[0]);}}
   }
   return {elapsed:t,loads,operators,stationActions,machineOccupants,bufferPallets,fleet,carriers:internal?.carriers||[],internalTransportScope:ground?'R3-operational':current.internalTransportTrial?.scope||null,visualTrips:current.trips,movementLabel:DBR_MOVEMENT_LABEL,focusLotId:current.dbr?.trace.find(l=>!l.initial)?.lotId||null};
  }};
}
const cache=new WeakMap();
export function sampleDbrHandling(snapshot,seconds=snapshot.animationTime??snapshot.elapsed){let plan=cache.get(snapshot.timeline);if(!plan){plan=compileDbrHandling(snapshot);cache.set(snapshot.timeline,plan);}return plan.sample(snapshot,seconds);}


// Review only: a D pilot with its explicitly enlarged window alongside the
// actual external fleet. Never promote individual pilot clearance to full-film
// safety. The displayed pallet/handle and operator are checked independently.
export function reviewInternalTrialTraffic(schedule,trial,{step=1/60}={}){
 const plan=compileDbrHandling(schedule),conflicts=[];
 const start=Math.min(...trial.plan.missions.map(m=>m.start)),end=Math.max(...trial.plan.missions.map(m=>m.end));
 const bounds={min:[-.6,-.6],max:[.6,1.2]},person={min:[-.3,-.3],max:[.3,.3]};
 for(let tick=Math.floor(start/step);tick<=Math.ceil(end/step);tick++){
  const time=tick*step,external=plan.sample({elapsed:time,logisticsOnly:true},time).fleet,internal=sampleInternalTransport(trial.plan,time);
  const volumes=[...internal.carriers.filter(c=>c.visible).map(c=>({id:c.id,body:'carrier',box:boxCorners(c.position,Math.atan2(-c.direction[0],-c.direction[1]),bounds)})),...[...internal.operators].map(([id,p])=>({id,body:'operator',box:boxCorners(p.position,0,person)}))];
  for(const v of external){const box=boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),LOGISTICS_LAYOUT.forkliftBounds);for(const b of volumes)if(boxesOverlap(box,b.box))conflicts.push({time,vehicleId:v.id,eventId:v.event?.id||v.priorEvent?.id||null,body:b.body,internalId:b.id});}
 }
 return {scope:trial.scope,proposedWindow:trial.proposedWindow,complete:false,step,collisionFree:conflicts.length===0,conflicts};
}
