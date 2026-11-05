import * as THREE from './vendor/three.module.js';
import {LOGISTICS_LAYOUT} from './logistics-layout.js';
// C1 owns mounting this module and removing the former dock/truck geometry.
export function createLogisticsScene({world,textSprite,makeBrand,physicalSigns=false}){
 const group=new THREE.Group();group.name='gama-logistics';world.add(group);
 const materials=new Map(),material=color=>{if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.7}));return materials.get(color);};
 const box=(parent,x,y,z,w,h,d,color)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 const label=(parent,text,x,y,z,width=3)=>{const sprite=makeBrand?.({text,width})||textSprite?.(text,width,'#f7f5e9','#344e5b');if(sprite){sprite.position.set(x,y,z);if(physicalSigns&&['LOGÍSTICA INTERNA','ESPERA','ENTRADA'].includes(text)){sprite.rotation.x=-Math.PI/2;sprite.position.y=.06;}if(physicalSigns&&text.startsWith('Doca '))sprite.position.y=3.48;parent.add(sprite);}return sprite;};
 box(group,10,-.12,52.5,120,.2,35,0x3c454b);
 // Connected indoor service apron and east aisle; truck asphalt begins at z=35.
 // Match the original slab edge, finished height and joints all the way to
 // the loading apron. These decorative surfaces do not alter route geometry.
 box(group,3,-.45,24.75,54,.9,20.5,0xc6cece);
 box(group,25.6,-.45,-.75,6.7,.9,30.5,0xc6cece);
 box(group,3,-.025,24.75,54,.09,20.5,0xaeb9ba);
 box(group,25.6,-.025,-.75,6.7,.09,30.5,0xaeb9ba);
 for(let x=-21;x<=27;x+=3)box(group,x,.023,24,.015,.008,21.8,0x97a5a7);
 for(let z=16;z<35;z+=3)box(group,3,.023,z,54,.008,.015,0x97a5a7);
 for(const x of [24,27])box(group,x,.023,-.75,.015,.008,30.5,0x97a5a7);
 for(let z=-14;z<=13;z+=3)box(group,25.6,.023,z,6.7,.008,.015,0x97a5a7);
 // Green work-area edge ends before the asphalt truck lanes at z=35.
 box(group,29.65,.032,24.2,.12,.02,20.6,0x65b18b);
 box(group,3,.032,34.5,53.4,.02,.12,0xe4c355);
 const platform=LOGISTICS_LAYOUT.platform,width=platform.max[0]-platform.min[0],center=(platform.max[0]+platform.min[0])/2;
 box(group,center,platform.height/2,(platform.min[1]+platform.max[1])/2,width,platform.height,platform.max[1]-platform.min[1],0x7c9193);
 const rampLength=platform.rampEnd-platform.rampStart,ramp=box(group,center,platform.height/2,(platform.rampStart+platform.rampEnd)/2,width,.08,Math.hypot(rampLength,platform.height),0x91a6a1);ramp.rotation.x=-Math.atan(platform.height/rampLength);
 for(const d of LOGISTICS_LAYOUT.docks){
  const x=d.position[0],gate=d.position[1]-4.9;
  for(const side of [-1,1]){box(group,x+side*1.7,1.7,gate,.15,3.4,.2,0x426374);box(group,x+side*1.7,.55,gate,.25,1.1,.3,0xe4b74c);}
  box(group,x,3.45,gate,3.6,.2,.2,0x426374);label(group,`${d.id} · GAMA`,x,3.85,gate);
  for(let z=35;z<64;z+=4)box(group,x,.015,z,.12,.03,2,0xe4c355);
 }
 box(group,11.5,.02,18.0,17,.03,.14,0x65b18b);label(group,'LOGÍSTICA INTERNA',11,1,18.0,4);
 box(group,30,.02,40,10,.03,3.2,0x62676a);for(const z of [38.3,41.7])box(group,30,.025,z,10,.04,.1,0xe4c355);box(group,24.8,.025,40,.15,.04,3.2,0xf7f5e9);label(group,'ESPERA',30,1,42.5);for(let x=38;x<65;x+=4)box(group,x,.025,40,2,.04,.12,0xe4c355);label(group,'ENTRADA',48,1,42.5);
 for(const [i,v]of LOGISTICS_LAYOUT.fleet.entries()){
  const [x,z]=v.park;for(const side of [-1,1]){box(group,x-.55+side*1.45,.025,z,.04,.04,1.5,v.color);box(group,x-.55,.025,z+side*.75,2.9,.04,.04,v.color);}
  box(group,x-2.3,.8,z,.6,1.6,.28,0x3a5362);box(group,x-1.98,1.1,z,.04,.25,.24,0x6ed4a5);label(group,String(i+1),x,1,z, .6);
 }
 for(const [x,z]of LOGISTICS_LAYOUT.dispatchBays){for(const side of [-1,1])box(group,x+side*.62,.025,z,.035,.025,1.24,0xe4c355);for(const side of [-1,1])box(group,x,.025,z+side*.62,1.24,.025,.035,0xe4c355);}
 const truckTemplate=new THREE.Group();truckTemplate.name='gama-truck-template';truckTemplate.visible=false;group.add(truckTemplate);
 box(truckTemplate,.6,.62,0,7.6,.28,2.55,0x344c59);box(truckTemplate,1.25,.78,0,5.9,.18,2.55,0x71848a);
 box(truckTemplate,1.25,1.83,-1.275,5.9,2.15,.1,0xe9eee9);box(truckTemplate,-1.7,1.83,0,.1,2.15,2.55,0xe9eee9);
 box(truckTemplate,1.25,1.1,1.275,5.9,.55,.1,0xe9eee9);box(truckTemplate,-2.6,1.4,0,1.65,1.7,2.05,0x487c9a);box(truckTemplate,-3.44,1.86,0,.035,.65,1.65,0x294c62);
 for(const x of [-2.5,2.6,3.4])for(const z of [-1.25,1.25]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.28,12),material(0x263b45));wheel.rotation.x=Math.PI/2;wheel.position.set(x,.54,z);truckTemplate.add(wheel);}
 label(truckTemplate,'GAMA Logística',1.2,1.35,1.35,3.4);
 return {truckTemplate,update(){},destroy(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const m of materials.values())m.dispose();}};
}
