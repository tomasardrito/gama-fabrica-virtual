import {DbrSimulation} from './dbr-simulation.js';
import {sampleDbrHandling} from './dbr-handling.js';
import {createInternalDemonstration,prepareInternalAccess,compileInternalTransport} from './internal-motion.js';
import {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles} from './internal-layout.js';
import {filmDemonstrationSweeps} from './film-actors.js';
import {DBR_LAYOUT,dbrWorkStand} from './dbr-layout.js';
import {createForklift} from './forklift.js';
import * as THREE from './vendor/three.module.js';
export const DEMO_TIMING=Object.freeze({id:'ACT2-PALLET-JACK-DEMO',start:79,end:94.6,link:'lap>rosq',sourceBay:4,destinationBay:4,operatorId:'lap:1',carrierId:'jack-lap',educational:true,affectsIndustry:false});
export function prepareDemonstration(schedule){
 const d=DEMO_TIMING,pilot=INTERNAL_PILOTS.find(p=>p.link===d.link);
 if(!pilot||pilot.operator.id!==d.operatorId||pilot.source!==d.sourceBay||pilot.destination!==d.destinationBay)throw new Error('B1/D1 demonstration identity mismatch');
 // Preserve the published B/C educational source, independent of production allocation.
 const sourceBay=3;
 const [from,to]=d.link.split('>'),input=prepareInternalAccess(internalPilotInput({id:'DEMO-TRANSFER',from,to},{...pilot,source:sourceBay}));
 const people=Object.entries(DBR_LAYOUT).flatMap(([stage,rows])=>rows.map((_,i)=>({id:`${stage}:${i}`,position:dbrWorkStand(stage,i)}))).filter(p=>p.id!==d.operatorId).map(p=>({id:`station-person:${p.id}`,min:p.position.map(v=>v-.65),max:p.position.map(v=>v+.65)}));
 const layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(input.transfer),...people]};
 const example=createInternalDemonstration({start:d.start,end:d.end,input,layout});
 // Check the actual A1 pre-production fleet meshes against the complete example.
 const probe=createForklift(),snapshot=new DbrSimulation({preparedSchedule:schedule}).seek(d.start);
 const fleet=sampleDbrHandling(snapshot).fleet.map(p=>{probe.setPose({...p,direction:p.vehicleDirection||p.direction});probe.group.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(probe.group);return {id:p.id,start:d.start,end:d.end,min:[b.min.x,b.min.z],max:[b.max.x,b.max.z]};});
 probe.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 const plan=compileInternalTransport({transfers:example.transfers,carriers:example.carriers,operators:[example.missions[0].operator],layout,presentation:{mode:'demonstration'},externalSweeps:[...filmDemonstrationSweeps(d),...fleet]});
 plan.demonstration=example.demonstration;
 return {plan,sourceBay,sourceStart:d.start,sourceEnd:d.end};
}
