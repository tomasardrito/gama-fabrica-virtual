import * as THREE from './vendor/three.module.js';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
export const TRUCK_REAR_OPEN_SECONDS=.8;
export const TRUCK_REAR_CLEAR_SECONDS=.6;
export const TRUCK_REAR_CLOSE_SECONDS=1.2;
export const TRUCK_REAR_DEPARTURE_DELAY=TRUCK_REAR_CLEAR_SECONDS+TRUCK_REAR_CLOSE_SECONDS;

// The rear remains open for the forklift clearance, then the ramp folds and
// both doors close. All of these phases finish before the truck moves.
export function sampleTruckRear(trip,elapsed){
 if(!trip)return {phase:'closed',doorOpen:0,rampOpen:0};
 const openingSeconds=trip.rearOpenSeconds??TRUCK_REAR_OPEN_SECONDS,openAt=trip.loadStart-openingSeconds;
 const loadEnd=Number.isFinite(trip.loadEnd)?trip.loadEnd:Math.max(trip.loadStart,trip.departAt-.4);
 const closeAt=loadEnd+Math.min(TRUCK_REAR_CLEAR_SECONDS,Math.max(0,trip.departAt-loadEnd)*.45);
 if(elapsed<openAt||elapsed>=trip.departAt)return {phase:'closed',doorOpen:0,rampOpen:0};
 if(elapsed<trip.loadStart){const t=clamp((elapsed-openAt)/openingSeconds);return {phase:'opening',doorOpen:smooth(t/.55),rampOpen:smooth((t-.4)/.6)};}
 if(elapsed<closeAt)return {phase:elapsed<loadEnd?'loading':'clearing',doorOpen:1,rampOpen:1};
 const t=clamp((elapsed-closeAt)/Math.max(.001,trip.departAt-closeAt));
 return {phase:'closing',doorOpen:1-smooth((t-.4)/.6),rampOpen:1-smooth(t/.55)};
}

export function createTruckRear(truck){
 // Replace the permanently deployed ramp on the retained truck model.
 truck.getObjectByName('truck-rear')?.removeFromParent();
 const old=[];truck.traverse(o=>{if(o.isMesh&&o.geometry?.parameters?.width===1.83)old.push(o);});
 for(const o of old)o.removeFromParent();
 const group=new THREE.Group();group.name='truck-rear';truck.add(group);
 const steel=new THREE.MeshStandardMaterial({color:0xe2e9e7,roughness:.58,metalness:.17});
 const dark=new THREE.MeshStandardMaterial({color:0x3f5661,roughness:.5,metalness:.4});
 const metal=new THREE.MeshStandardMaterial({color:0xa8b8b9,roughness:.42,metalness:.6});
 const amber=new THREE.MeshStandardMaterial({color:0xd8b65c,roughness:.55});
 const addBox=(parent,x,y,z,w,h,d,material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const doors=[];
 for(const side of [-1,1]){
  const hinge=new THREE.Group();hinge.name=side<0?'rear-door-left':'rear-door-right';hinge.position.set(4.26,1.83,side*1.275);group.add(hinge);
  const centre=-side*.6375;
  addBox(hinge,0,0,centre,.1,2.15,1.275,steel);
  for(const z of [centre-side*.44,centre+side*.44])addBox(hinge,.075,0,z,.055,1.9,.045,metal);
  addBox(hinge,.08,-.19,centre,.07,.08,.3,dark);
  for(const y of [-.86,.86])addBox(hinge,.085,y,centre,.035,.055,1.15,metal);
  addBox(hinge,.09,-.77,centre,.03,.1,.65,amber);
  for(const y of [-.7,0,.7])addBox(group,4.28,1.83+y,side*1.275,.16,.13,.1,dark);
  doors.push({hinge,side});
 }
 const ramp=new THREE.Group();ramp.name='rear-ramp';ramp.position.set(4.15,.89,0);group.add(ramp);
 addBox(ramp,.915,0,0,1.83,.08,2.55,metal);
 for(const z of [-1.22,1.22])addBox(ramp,.915,.05,z,1.83,.055,.055,amber);
 for(let x=.2;x<1.8;x+=.25)addBox(ramp,x,.045,0,.035,.012,2.4,dark);
 let state;
 function setState(next){state=next;for(const {hinge,side}of doors)hinge.rotation.y=-side*(Math.PI*.59)*next.doorOpen;ramp.rotation.z=Math.PI/2-(Math.PI/2+Math.atan(.85/1.6))*next.rampOpen;group.userData.rearPhase=next.phase;}
 setState({phase:'closed',doorOpen:0,rampOpen:0});
 return {group,doors,ramp,setState,get state(){return state;}};
}
