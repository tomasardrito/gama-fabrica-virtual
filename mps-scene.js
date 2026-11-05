import {LOGISTICS_LAYOUT} from './logistics-layout.js';
import {sampleLogisticsTruck as sampleTruckVisit,cargoWorldPosition} from './logistics-motion.js';
import * as THREE from './vendor/three.module.js';
import { createForklift } from './forklift.js';
import {createInternalTransportScene} from './internal-scene.js';
import { MPS_TRUCK_EXIT_SECONDS } from './mps-handling.js';
import { STAGING_BAYS, STATION_HANDLING } from './transport-routes.js';
import {createTruckRear,sampleTruckRear} from './truck-rear.js';
import { DBR_REFERENCE } from './dbr-reference.js';

export const MPS_TRUCK_TIMING=Object.freeze({arrivalSeconds:3,departureSeconds:MPS_TRUCK_EXIT_SECONDS,travelDistance:48});
export {sampleLogisticsTruck as sampleTruckVisit} from './logistics-motion.js';

// The A/B workbook is an hourly state table, not a transport timeline. Its
// exact WIP is shown in stationary pallet equivalents; no shipment is invented.
export function referencePresentation(snapshot){
 const scenario=snapshot.referenceScenario==='B'?'B':'A',data=snapshot.scenarios?.[scenario]||(scenario==='A'?snapshot.withBuffer:snapshot.withoutBuffer);
 if(!data)throw new Error('Cenário de referência DBR ausente.');
 const loads=new Map(),capacity=DBR_REFERENCE.params.lotUnits;
 for(const [stage,total] of [['buffer',data.bufferUnits],['lap',data.lapUnits],['rosq',data.rosqUnits],['m2',data.M2InspectionUnits]]){
  let remaining=Math.max(0,Number(total)||0),index=0;while(remaining>1e-7){const quantity=Math.min(capacity,remaining),position=STAGING_BAYS[stage][index];if(!position)throw new Error(`Referência excede baias de ${stage}.`);const id=`REF-${scenario}-${stage}-${index+1}`;
   loads.set(id,{id,batchId:id,orderId:`REFERÊNCIA ${scenario}`,product:stage==='m2'?'M2 + INSPEÇÃO':null,quantity,inventoryLabel:stage==='buffer',stage,partStage:stage==='buffer'?'rosq':stage==='m2'?'m1':stage==='rosq'?'lap':'stock',position:[...position],palletY:.05,onCart:false,partLocation:'bay',partPosition:[position[0],.3,position[1]],stationId:null,machineIndex:null});remaining-=quantity;index++;
  }
 }
 const operators=new Map(Object.entries(STATION_HANDLING).map(([id,c])=>[id,{position:[...c.stand],direction:[0,-1],distance:0}]));
 const stations=Object.entries(data.stations).map(([id,s])=>({id,status:s.processedThisHour>0?'Produzindo':'Aguardando',processingUnits:s.processedThisHour,queueUnits:s.queue||0,progress:Math.min(1,(s.forming||0)/capacity),activeBatchId:null}));
 return {data,loads,operators,machineOccupants:new Map(),stationActions:new Map(),fleet:[],stations,buffer:{units:data.bufferUnits,lotCount:Math.ceil(data.bufferUnits/capacity),zone:data.zone,target:DBR_REFERENCE.params.bufferUnits,min:DBR_REFERENCE.params.minimumBufferUnits},trips:[]};
}

// Presentation-only objects for the absolute MPS timeline. The sampler owns all
// positions and identities; this layer never advances a load towards a target.
export function createMPSVisuals({world,firstForklift,truck,makeBatchLoad,updateBatchLabel,styleBatch,releaseGroup}){
 const rigs=[firstForklift,...Array.from({length:LOGISTICS_LAYOUT.fleet.length-1},(_,i)=>createForklift({color:LOGISTICS_LAYOUT.fleet[i+1].color,number:i+2}))];
 for(let i=1;i<rigs.length;i++)world.add(rigs[i].group);
 const loads=new Map();let lastElapsed=-1,visible=false,internalScene=null;
 const mpsTruck=truck.clone(true);world.add(mpsTruck);mpsTruck.visible=false;
 // Two real pallet lanes, five positions each; the legacy truck is untouched.
 mpsTruck.traverse(o=>{const p=o.geometry?.parameters;if(!p)return;if(o.geometry.type==='BoxGeometry'){if(p.width===5.7){o.scale.x=5.9/5.7;o.position.x=1.3;}if(p.depth===2.2)o.scale.z=2.55/2.2;if(p.depth===2.15)o.scale.z=2.45/2.15;if(p.depth===2.12)o.scale.z=2.55/2.12;if(o.position.x===-1.45)o.position.x=-1.65;if(Math.abs(o.position.z)===1.06)o.position.z=Math.sign(o.position.z)*1.235;if(Math.abs(o.position.z)===1&&p.width===1.83)o.position.z=Math.sign(o.position.z)*1.22;}});
 // Smaller panels retain the same wall geometry while avoiding long-triangle
 // painter ordering artifacts in the Canvas compatibility renderer.
 const panels=[];mpsTruck.traverse(o=>{const p=o.geometry?.parameters;if(o.isMesh&&p?.width===5.7&&p.height===2.15)panels.push(o);});
 for(const wall of panels){const width=5.9/5;for(let i=0;i<5;i++){const panel=new THREE.Mesh(new THREE.BoxGeometry(width,2.15,.1),wall.material);panel.position.set(1.3-5.9/2+width*(i+.5),wall.position.y,wall.position.z);panel.castShadow=true;panel.receiveShadow=true;mpsTruck.add(panel);}wall.removeFromParent();}
 const decks=[];mpsTruck.traverse(o=>{const p=o.geometry?.parameters;if(o.isMesh&&p?.width>5&&p.height<.4)decks.push(o);});
 for(const deck of decks){const p=deck.geometry.parameters,w=p.width*deck.scale.x,d=p.depth*deck.scale.z,nx=Math.ceil(w/1.2),nz=Math.ceil(d/1.2);for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){const tile=new THREE.Mesh(new THREE.BoxGeometry(w/nx,p.height,d/nz),deck.material);tile.position.set(deck.position.x-w/2+w/nx*(x+.5),deck.position.y,deck.position.z-d/2+d/nz*(z+.5));tile.castShadow=true;tile.receiveShadow=true;mpsTruck.add(tile);}deck.removeFromParent();}
 const rear=createTruckRear(mpsTruck),truckTemplate=mpsTruck.clone(true),extraTrucks=[];
 const fleetIdIndex=id=>typeof id==='number'?Math.max(0,Math.min(LOGISTICS_LAYOUT.fleet.length-1,id)):Math.max(0,Number(String(id).match(/(\d+)$/)?.[1]||1)-1);
 function reset(){for(const visual of loads.values()){releaseGroup(visual.parts);releaseGroup(visual.g);}loads.clear();lastElapsed=-1;}
 function setVisible(enabled){visible=!!enabled;if(!visible)internalScene?.update(null,{carriers:[]});mpsTruck.visible=visible;for(const extra of extraTrucks)extra.truck.visible=false;for(const rig of rigs)rig.group.visible=visible;for(const v of loads.values()){v.g.visible=visible;v.parts.visible=visible;}}
 function reparent(object,parent){if(object.parent===parent)return;object.updateWorldMatrix(true,false);parent.updateWorldMatrix(true,false);parent.attach(object);}
 function update(snapshot,presentation,{span=60}={}){
  const elapsed=Number(snapshot.elapsed)||0;if(elapsed<lastElapsed-1e-7)reset();lastElapsed=elapsed;setVisible(true);
  const visits=(snapshot.trips||[]).map(tr=>sampleTruckVisit([tr],elapsed)).filter(v=>v.visible),visit=visits.find(v=>!['arriving','departing'].includes(v.phase))||visits.find(v=>v.phase==='arriving')||visits[0]||sampleTruckVisit([],elapsed),trip=visit.trip;
  mpsTruck.position.set(...visit.position);mpsTruck.rotation.y=visit.yaw;mpsTruck.visible=visit.visible;rear.setState(sampleTruckRear(trip,elapsed));
  const truckForTrip=new Map();if(trip)truckForTrip.set(trip.id,{truck:mpsTruck,visit});
  const others=visits.filter(v=>v!==visit);for(let i=0;i<others.length;i++){if(!extraTrucks[i]){const truck=truckTemplate.clone(true);world.add(truck);extraTrucks.push({truck,rear:createTruckRear(truck)});}const extra=extraTrucks[i],v=others[i];extra.truck.visible=true;extra.truck.position.set(...v.position);extra.truck.rotation.y=v.yaw;extra.rear.setState(sampleTruckRear(v.trip,elapsed));truckForTrip.set(v.trip.id,{truck:extra.truck,visit:v});}
  for(let i=others.length;i<extraTrucks.length;i++)extraTrucks[i].truck.visible=false;
  if(presentation.carriers?.length){internalScene??=createInternalTransportScene({world});internalScene.update(snapshot,{...presentation,carriers:productionCarrierPoses(presentation)});}else internalScene?.update(snapshot,{carriers:[]});
  const fleet=presentation.fleet||[];
  for(let i=0;i<rigs.length;i++){const pose=fleet[i];rigs[i].group.visible=!!pose&&pose.visible!==false;if(pose)rigs[i].setPose({position:pose.position,direction:pose.vehicleDirection||pose.direction,distance:pose.wheelDistance??pose.distance??0,forkLift:pose.forkLift||0,groundHeight:pose.groundHeight||0});}
  const activeLoads=presentation.loads instanceof Map?presentation.loads:new Map((presentation.loads||[]).map(l=>[l.batchId||l.id,l]));
  const activeIds=new Set();
  for(const [id,load] of activeLoads){
   const inTruck=load.partLocation==='truck';
   const owningTrip=inTruck?(snapshot.trips||[]).find(t=>t.lotIds?.includes(String(id))):null,truckPose=owningTrip?truckForTrip.get(owningTrip.id):null;
   if(inTruck&&!truckPose){const prior=loads.get(id);if(prior){prior.g.visible=false;prior.parts.visible=false;}continue;}
   if(load.visible===false||['delivered','pending','unreleased'].includes(load.stage)){const prior=loads.get(id);if(prior){prior.g.visible=false;prior.parts.visible=false;}continue;}
   const inventoryLabel=load.inventoryLabel||(snapshot.mode!=='dbr'&&String(id).startsWith('BUF-INI-'));activeIds.add(id);let visual=loads.get(id);if(!visual){visual=makeBatchLoad({...load,inventoryLabel,shortLabel:true,batchId:id,orderId:load.orderId||load.id||id});loads.set(id,visual);}
   updateBatchLabel?.(visual,{...load,inventoryLabel,shortLabel:true,compactLabel:['conveyor','trolley'].includes(load.partLocation)&&presentation.focusLotId!==id});styleBatch(visual,load.partStage||load.stage);visual.g.visible=true;visual.parts.visible=load.partVisible!==false&&(!inventoryLabel||load.quantity>1e-7);
   const onVehicle=load.onCart||load.partLocation==='cart'||load.partLocation==='vehicle';
   const vehicle=rigs[fleetIdIndex(load.vehicleId??load.forkliftId??0)].group;
   const parent=onVehicle?vehicle:inTruck?truckPose.truck:world;
   reparent(visual.g,parent);parent.updateWorldMatrix(true,false);
   const cargoPosition=inTruck?cargoWorldPosition(load.position,owningTrip,truckPose.visit):load.position;
   const palletPosition=new THREE.Vector3(cargoPosition[0],load.palletY??.05,cargoPosition[1]);
   if(parent!==world)parent.worldToLocal(palletPosition);visual.g.position.copy(palletPosition);
   const palletYaw=Number.isFinite(load.palletYaw)?load.palletYaw:load.palletDirection?Math.atan2(-load.palletDirection[0],-load.palletDirection[1]):null;if(palletYaw!==null)visual.g.rotation.y=palletYaw-(parent===vehicle?vehicle.rotation.y:0);
   const partParent=load.partLocation==='cart'||load.partLocation==='vehicle'?vehicle:inTruck?truckPose.truck:world;
   reparent(visual.parts,partParent);partParent.updateWorldMatrix(true,false);
   const partPosition=new THREE.Vector3(...load.partPosition);if(inTruck){const p=cargoWorldPosition([partPosition.x,partPosition.z],owningTrip,truckPose.visit);partPosition.x=p[0];partPosition.z=p[1];}if(partParent!==world)partParent.worldToLocal(partPosition);visual.parts.position.copy(partPosition);
   if(Number.isFinite(load.partYaw))visual.parts.rotation.y=load.partYaw-(partParent===vehicle?vehicle.rotation.y:0);
   const held=load.partLocation==='hands',atFixture=load.partLocation==='machine';if(held){const op=presentation.operators?.get(load.stationId);if(op)visual.parts.rotation.y=Math.atan2(-op.direction[0],-op.direction[1]);}else if(onVehicle&&palletYaw!==null)visual.parts.rotation.y=palletYaw-vehicle.rotation.y;
   const badgeParent=held||atFixture?visual.parts:visual.g;reparent(visual.badge,badgeParent);const bayIndex=inventoryLabel?Math.max(0,(snapshot.handlingBays?.buffer||STAGING_BAYS.buffer).findIndex(p=>Math.hypot(p[0]-load.position[0],p[1]-load.position[1])<.01)):0;visual.badge.position.set(0,load.illustrative&&onVehicle?2.8:held||atFixture?1.65:inventoryLabel?1.25+(bayIndex%2)*.45:1.55,0);const badgeWidth=load.illustrative?3.2:inventoryLabel?1.4:['conveyor','trolley'].includes(load.partLocation)?2.4:4.2;visual.badge.scale.set(badgeWidth,badgeWidth/8,1);
   // The live order card carries identity while driving; keep the seated driver
   // and hands clear. On a close workcell view the physical lot is labelled.
   visual.badge.visible=load.illustrative||(!['conveyor','trolley'].includes(load.partLocation)||load.stage!=='transport'||presentation.focusLotId===id)&&!onVehicle&&!inTruck&&span<31&&(snapshot.mode==='dbr'||held||atFixture||(inventoryLabel&&load.stage==='buffer')||presentation.focusLotId===id||(load.stage==='buffer'&&load.partLocation==='bay'&&snapshot.buffer?.nextLotId===id));
  }
  for(const [id,visual] of loads)if(!activeIds.has(id)){visual.g.visible=false;visual.parts.visible=false;}
 }
 return {rigs,loads,truck:mpsTruck,rear,extraTrucks,update,reset,setVisible,destroy(){reset();internalScene?.destroy();mpsTruck.removeFromParent();for(let i=1;i<rigs.length;i++){rigs[i].group.removeFromParent();rigs[i].group.traverse(o=>{o.geometry?.dispose();if(o.material&&!Array.isArray(o.material))o.material.dispose();});}}};
}

// C1 renders the educational rig itself. Its pose replaces the same carrier ID;
// it must not also be instantiated by the production renderer in that interval.
export function productionCarrierPoses(presentation){
 return (presentation.carriers||[]).filter(c=>c.id!==presentation.demonstration?.carrierId);
}
