// Physical presentation layout: pallets, pedestrians and the forklift use
// separate access lanes. None of these seconds alter analytical production time.
export const STAGING_BAYS=Object.freeze({
 stock:[...[15.4,17].map(x=>[x,-4.3]),...[15.4,17,18.6].map(x=>[x,-10.6])],
 lap:[6.8,8.4,10,11.6,13.2].map(x=>[x,-4.3]),
 rosq:[2,3.6,5.2,6.8,8.4].map(x=>[x,2.3]),
 buffer:[...[-6.5,-4.9,-3.3,-1.7,-.1].map(x=>[x,2.3]),...[-5.6,-4,-2.4,-.8,.8].map(x=>[x,-1.3])],
 m1:[-5.8,-4.2,-2.6,-1,.6].map(x=>[x,9.3]),
 m2:[2.8,4.4,6,7.6,9.2].map(x=>[x,9.3]),
 insp:[10.8,12.4,14,15.6,17.2].map(x=>[x,9.3]),
 dispatch:[8.8,10.4,12,13.6,15.2].map(x=>[x,13.6]),
 truck:[11.25,12.55,13.85,15.15].map(x=>[x,19.2])
});
export const TRUCK_BAYS=STAGING_BAYS.truck;
export const TRANSPORT_STOPS=Object.freeze(Object.fromEntries(Object.entries(STAGING_BAYS).map(([id,points])=>[id,points[0]])));
export const TRANSPORT_LANES=Object.freeze({stock:-2.8,lap:-2.8,rosq:3.9,buffer:3.9,m1:11.1,m2:11.1,insp:11.1,dispatch:15.4,truck:19.2,east:19.8});
export const FORKLIFT_GEOMETRY=Object.freeze({bodyOffset:1.15,halfLength:.55,halfWidth:.55,palletHalf:.55,workerRadius:.30});
const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
export function stagingPoint(stage,batchId=''){
 const bays=STAGING_BAYS[stage];if(!bays)throw new Error(`Unknown transport stage: ${stage}`);
 const n=Number(String(batchId).match(/(\d+)$/)?.[1]||1);return [...bays[(n-1)%bays.length]];
}
export function bayApproach(stage,bay){return stage==='stock'&&bay[1]<-8?[bay[0],-12.2]:stage==='buffer'&&bay[1]<0?[bay[0],-2.8]:stage==='truck'?[TRANSPORT_LANES.east,bay[1]]:[bay[0],TRANSPORT_LANES[stage]];}
export function bayWorkerStand(bay){return [bay[0],bay[1]-.95];}
export function forkliftBodyPolygon(position,direction){
 const {bodyOffset,halfLength,halfWidth}=FORKLIFT_GEOMETRY;
 const back=[-direction[0],-direction[1]],side=[direction[1],-direction[0]];
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[position[0]+back[0]*(bodyOffset+z*halfLength)+side[0]*x*halfWidth,position[1]+back[1]*(bodyOffset+z*halfLength)+side[1]*x*halfWidth]);
}
export function routeFor(from,to,{start=TRANSPORT_STOPS[from],end=TRANSPORT_STOPS[to]}={}){
 if(!TRANSPORT_STOPS[from]||!TRANSPORT_STOPS[to]||!start||!end)throw new Error('Only physical production stops can have routes');
 if(same(start,end))return [[...start]];
 const points=[];const add=p=>{if(!points.length||!same(points.at(-1),p))points.push([...p]);};
 const a=bayApproach(from,start),b=bayApproach(to,end);
 add(start);add(a);
 if(a[1]!==b[1]){add([TRANSPORT_LANES.east,a[1]]);add([TRANSPORT_LANES.east,b[1]]);}
 add(b);add(end);return points;
}
export function routeLength(points){let n=0;for(let i=1;i<points.length;i++)n+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);return n;}
export function sampleRoute(points,fraction){
 if(!points.length)return {position:[0,0],direction:[0,-1]};
 if(fraction>=1){const last=points.at(-1),prev=points.at(-2)||last,len=Math.hypot(last[0]-prev[0],last[1]-prev[1]);return {position:[...last],direction:len?[(last[0]-prev[0])/len,(last[1]-prev[1])/len]:[0,-1]};}
 let remaining=Math.max(0,Math.min(1,fraction))*routeLength(points);
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(remaining<=len||i===points.length-1){const t=len?Math.min(1,remaining/len):0;return {position:[a[0]+dx*t,a[1]+dz*t],direction:len?[dx/len,dz/len]:[0,-1]};}remaining-=len;}
 return {position:[...points[0]],direction:[0,-1]};
}

// One staffed fixture represents each aggregate work centre. This is visual
// handling only: it neither creates pieces nor changes analytical capacity.
export const STATION_HANDLING=Object.freeze({
 lap:{machineIndex:1,fixture:[12,1.34,-6.45],stand:[12,-5.65],workStand:[12,-5.85]},
 rosq:{machineIndex:2,fixture:[7.2,1.12,.55],stand:[7.2,1.35],workStand:[7.2,1.15]},
 m1:{machineIndex:0,fixture:[-3.78,1.34,7.55],stand:[-3.78,8.35],workStand:[-3.78,8.15]},
 m2:{machineIndex:0,fixture:[4.22,1.34,7.55],stand:[4.22,8.35],workStand:[4.22,8.15]},
 insp:{machineIndex:0,fixture:[11.7,1.27,7.55],stand:[11.7,8.35],workStand:[11.7,8.15]}
});
const PHASES={
 pickup:'Empilhadeira buscando lote',fork_align:'Alinhando os garfos',fork_approach:'Aproximando os garfos',pickup_clear:'Recuando com o pallet',deposit_approach:'Posicionando pallet',deposit_align:'Alinhando a entrega',loading:'Elevando pallet',carrying:'Transportando',
 unloading:'Descarregando no setor',clearance:'Recuando e liberando a área',
 station_approach:'Operador buscando a peça',station_pick:'Retirando peça do lote',
 station_carry_in:'Levando peça até a máquina',station_place:'Posicionando peça na máquina',
 station_retreat:'Preparando a operação',source_approach:'Operador acessando a máquina',
 source_pick:'Retirando peça pronta',source_carry_out:'Levando peça ao pallet',
 source_place:'Apoiando peça no pallet',source_return:'Operador retornando à estação'
};
const clamp=t=>Math.max(0,Math.min(1,t));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*clamp(t));
const look=(a,b)=>{const d=[b[0]-a[0],b[1]-a[1]],n=Math.hypot(...d);return n?d.map(v=>v/n):[0,-1];};
const floorPart=(p,height=.3)=>[p[0],height,p[1]];
const turnDirection=(from,to,seconds)=>{const angle=Math.atan2(from[0],from[1]),goal=Math.atan2(to[0],to[1]);const diff=Math.atan2(Math.sin(goal-angle),Math.cos(goal-angle));const next=angle+Math.sign(diff)*Math.min(Math.abs(diff),3.8*seconds);return [Math.sin(next),Math.cos(next)];};
const platformAt=p=>Math.abs(p[1]-19.2)<1.15&&p[0]>=10.5?.84*clamp((17.8-p[0])/1.6):0;
const manual=key=>key.startsWith('station_')||key.startsWith('source_');

// Both endpoints are in the cell's front access lane. The lapidation bay is
// beside the machines: reach x=16.6 before moving along that side of the cell.
export function operatorRoute(station,start,end){
 if(same(start,end))return [[...start]];
 const front=STATION_HANDLING[station].stand[1],points=[];
 const add=p=>{if(!points.length||!same(points.at(-1),p))points.push([...p]);};
 add(start);add([start[0],front]);add([end[0],front]);add(end);return points;
}

export class TransportController {
 constructor(){this.reset();}
 reset(){
  this.queue=[];this.active=null;this.seen=0;this.time=null;this.serial=null;
  this.cartStop='stock';this.position=bayApproach('stock',TRANSPORT_STOPS.stock);
  this.direction=[0,-1];this.vehicleDirection=[0,-1];this.distance=0;this.forkLift=0;this.groundHeight=0;this.travelLift=0;
  this.loads=new Map();this.machineOccupants=new Map();this.bayOccupants=new Map(Object.keys(STAGING_BAYS).map(id=>[id,new Map()]));
  this.operators=new Map(Object.entries(STATION_HANDLING).map(([id,c])=>[id,{position:[...c.stand],direction:look(c.stand,[c.fixture[0],c.fixture[2]]),distance:0}]));
  this.resetCount=(this.resetCount||0)+1;
 }
 _allocate(stage,id){
  const map=this.bayOccupants.get(stage);if(map.has(id))return [...STAGING_BAYS[stage][map.get(id)]];
  const used=new Set(map.values()),slot=STAGING_BAYS[stage].findIndex((_,i)=>!used.has(i));
  if(slot<0)throw new Error(`Todas as baias de ${stage} estão ocupadas nesta apresentação.`);
  map.set(id,slot);return [...STAGING_BAYS[stage][slot]];
 }
 _makeLoad(e){const position=this._allocate(e.from,e.batchId);return {batchId:e.batchId,orderId:e.orderId,product:e.product,quantity:e.quantity,stage:e.from,position,palletY:.05,onCart:false,partLocation:'bay',partPosition:floorPart(position),partStage:e.from,stationId:null,machineIndex:null};}
 ingest(snapshot){
  const combined=Array.isArray(snapshot.presentationEvents),time=Number(snapshot.time)||0;
  const serial=Number(combined?snapshot.presentationSerial:snapshot.movementSerial)||0;
  if(this.time!==null&&(time<this.time-1e-8||serial<this.serial))this.reset();this.time=time;this.serial=serial;
  for(const b of snapshot.batches||[])if(b.stage==='delivered')this.bayOccupants.get('truck').delete(b.batchId||b.id);
  // Unreleased orders remain inventory in the rack; physical pallets appear
  // only when their first real transfer is released. No modulo slot collisions.
  for(const raw of [...(combined?snapshot.presentationEvents:snapshot.movements||[])].sort((a,b)=>a.id-b.id)){
   if(raw.id<=this.seen)continue;this.seen=raw.id;const e={...raw,type:raw.type||'transfer'};
   if(e.type==='station-load'&&!STATION_HANDLING[e.station||e.to])continue;
   if(!TRANSPORT_STOPS[e.from]||!TRANSPORT_STOPS[e.to])continue;
   if(!this.loads.has(e.batchId))this.loads.set(e.batchId,this._makeLoad(e));this.queue.push(e);
  }
  if(!this.active&&this.queue.length)this._start();
 }
 _start(){
  const event=this.queue.shift();if(!event)return;const load=this.loads.get(event.batchId);
  const station=event.type==='station-load'?(event.station||event.to):event.from,config=STATION_HANDLING[station],operator=this.operators.get(station);
  const bay=[...load.position],bayStand=bayWorkerStand(bay),phases=[];
  const add=(key,duration,route=null,target=null,reverse=false)=>phases.push({key,duration,route,target,reverse});
  const walk=(key,from,to,min=1.05)=>{const route=operatorRoute(station,from,to);add(key,Math.max(min,routeLength(route)/2.1),route);};
  if(event.type==='station-load'){
   if(load.partLocation==='machine'&&load.stationId===station){this._start();return;}
   const owner=this.machineOccupants.get(station);if(owner&&owner!==load.batchId)throw new Error(`Fixture ${station} still contains ${owner}`);
   walk('station_approach',operator.position,bayStand);add('station_pick',.8,null,floorPart(bay));
   walk('station_carry_in',bayStand,config.workStand,1.4);add('station_place',.8,null,config.fixture);add('station_retreat',.45);
  }else{
   if(load.stage!==event.from)throw new Error(`Lote ${load.batchId} ainda está em ${load.stage}, não em ${event.from}.`);
   const fromMachine=load.partLocation==='machine'&&load.stationId===station&&config;
   // Operators put the completed part on a grounded pallet and leave first.
   // The forklift is parked in its cleared aisle throughout this handoff.
   if(fromMachine){
    load.partStage=event.from;walk('source_approach',operator.position,config.workStand);
    add('source_pick',.8,null,config.fixture);walk('source_carry_out',config.workStand,bayStand,1.4);
    add('source_place',.8,null,floorPart(bay));walk('source_return',bayStand,config.stand);
   }
   const destination=this._allocate(event.to,load.batchId),sourceApproach=bayApproach(event.from,bay),destinationApproach=bayApproach(event.to,destination);
   const pickup=routeFor(this.cartStop,event.from,{start:this.position,end:sourceApproach});
   if(routeLength(pickup)>.001)add('pickup',Math.max(.8,routeLength(pickup)/3.2),pickup);
   add('fork_align',.6,null,look(sourceApproach,bay));
   add('fork_approach',Math.max(.8,routeLength([sourceApproach,bay])/2),[sourceApproach,bay]);
   add('loading',.7);
   add('pickup_clear',Math.max(.8,routeLength([bay,sourceApproach])/2),[bay,sourceApproach],null,true);
   const carry=routeFor(event.from,event.to,{start:sourceApproach,end:destinationApproach});
   if(routeLength(carry)>.001)add('carrying',Math.max(1,routeLength(carry)/3.2),carry);
   add('deposit_align',.6,null,look(destinationApproach,destination));
   add('deposit_approach',Math.max(.8,routeLength([destinationApproach,destination])/2),[destinationApproach,destination]);
   add('unloading',.7);
   add('clearance',Math.max(.9,routeLength([destination,destinationApproach])/2),[destination,destinationApproach],null,true);
   this.active={event,load,station,config,operator,phases,index:0,elapsed:0,totalElapsed:0,bay,bayStand,destination};this._enterPhase();return;
  }
  this.active={event,load,station,config,operator,phases,index:0,elapsed:0,totalElapsed:0,bay,bayStand};this._enterPhase();
 }
 _handPosition(a){const op=a.operator;return [op.position[0]+op.direction[0]*.35,1.1,op.position[1]+op.direction[1]*.35];}
 _face(a,target){if(a.operator)a.operator.direction=look(a.operator.position,[target[0],target[2]]);}
 _enterPhase(){
  const a=this.active,p=a.phases[a.index];a.phase=p.key;a.elapsed=0;a.partStart=[...a.load.partPosition];a.palletStart=a.load.palletY;
  if(p.key==='loading'){a.load.onCart=true;a.load.partLocation='cart';}
  if(p.key==='station_pick'){this._face(a,floorPart(a.bay));a.load.partLocation='hands';a.load.stationId=a.station;}
  if(['station_place','source_pick','station_retreat'].includes(p.key))this._face(a,a.config.fixture);
  if(p.key==='source_pick'){a.load.partLocation='hands';this.machineOccupants.delete(a.station);}
  if(p.key==='source_place')this._face(a,floorPart(a.bay));
 }
 _syncVehicle(){
  const g=FORKLIFT_GEOMETRY;this.groundHeight=platformAt([this.position[0]-this.vehicleDirection[0]*g.bodyOffset,this.position[1]-this.vehicleDirection[1]*g.bodyOffset]);
  this.forkLift=Math.max(0,platformAt(this.position)+this.travelLift-this.groundHeight);
 }
 _renderPhase(a,t,seconds){
  const p=a.phases[a.index],key=p.key,load=a.load,isManual=manual(key);
  if(p.route&&!isManual){
   const prev=this.position,result=sampleRoute(p.route,t);this.position=result.position;this.direction=result.direction;
   if(!p.reverse)this.vehicleDirection=turnDirection(this.vehicleDirection,result.direction,seconds);
   this.distance+=Math.hypot(result.position[0]-prev[0],result.position[1]-prev[1]);
  }else if(p.route&&a.operator){
   const prev=a.operator.position,result=sampleRoute(p.route,t);a.operator.position=result.position;a.operator.direction=turnDirection(a.operator.direction,result.direction,seconds);
   a.operator.distance+=Math.hypot(result.position[0]-prev[0],result.position[1]-prev[1]);
  }
  if(key==='fork_align'||key==='deposit_align')this.vehicleDirection=turnDirection(this.vehicleDirection,p.target,seconds);
  if(key==='loading')this.travelLift=.3*t;
  if(key==='unloading')this.travelLift=.3*(1-t);
  this._syncVehicle();
  if(load.onCart){
   load.position=[...this.position];load.palletY=.05+platformAt(this.position)+this.travelLift;
   load.partPosition=floorPart(this.position,.3+platformAt(this.position)+this.travelLift);
   if(key==='unloading'&&a.event.to==='truck'){
    load.palletY=a.palletStart+(.89-a.palletStart)*t;load.partPosition=mix(a.partStart,floorPart(this.position,1.13),t);
   }
  }
  if(key==='station_pick'||key==='source_pick')load.partPosition=mix(a.partStart,this._handPosition(a),t);
  if(key==='station_carry_in'||key==='source_carry_out')load.partPosition=this._handPosition(a);
  if(key==='station_place'||key==='source_place')load.partPosition=mix(a.partStart,p.target,t);
 }
 _finishPhase(){
  const a=this.active,key=a.phase,load=a.load;
  if(key==='station_place'){load.partLocation='machine';load.partPosition=[...a.config.fixture];load.stationId=a.station;load.machineIndex=a.config.machineIndex;this.machineOccupants.set(a.station,load.batchId);}
  if(key==='source_place'){load.partLocation='bay';load.partPosition=floorPart(load.position);load.stationId=null;load.machineIndex=null;load.onCart=false;}
  if(key==='loading')this.bayOccupants.get(a.event.from).delete(load.batchId);
  if(key==='unloading'){
   load.onCart=false;load.stage=a.event.to;load.position=[...a.destination];load.palletY=a.event.to==='truck'?.89:.05;
   load.partLocation=a.event.to==='truck'?'truck':'bay';load.partPosition=floorPart(load.position,a.event.to==='truck'?1.13:.3);load.stationId=null;load.machineIndex=null;this.cartStop=a.event.to;
  }
  if(key==='source_return')this._face(a,a.config.fixture);
  a.index++;if(a.index<a.phases.length)this._enterPhase();else{this.active=null;this._start();}
 }
 advance(seconds,playing=true){
  if(!playing||!this.active)return;let dt=Math.max(0,Math.min(1,Number(seconds)||0));
  while(dt>1e-9&&this.active){const a=this.active,p=a.phases[a.index],step=Math.min(dt,p.duration-a.elapsed);a.elapsed+=step;a.totalElapsed+=step;dt-=step;this._renderPhase(a,a.elapsed+1e-9>=p.duration?1:clamp(a.elapsed/p.duration),step);if(a.elapsed+1e-9>=p.duration)this._finishPhase();}
 }
 isTransporting(){return !!this.active||this.queue.length>0;}
 getTransportState(){
  if(!this.active)return null;const a=this.active,isManual=manual(a.phase),p=a.phases[a.index],total=a.phases.reduce((n,p)=>n+p.duration,0);
  return {...a.event,kind:isManual?'station':'transport',stationId:isManual?a.station:null,phase:PHASES[a.phase],phaseKey:a.phase,phaseProgress:a.elapsed/p.duration,progress:clamp(a.totalElapsed/total),position:[...this.position],vehicleDirection:[...this.vehicleDirection],forkLift:this.forkLift,groundHeight:this.groundHeight,operatorPosition:isManual?[...a.operator.position]:null,operatorDirection:isManual?[...a.operator.direction]:null,operatorDistance:isManual?a.operator.distance:0,partLocation:a.load.partLocation,partPosition:[...a.load.partPosition],machineIndex:isManual?a.config.machineIndex:null};
 }
}
