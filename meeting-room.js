import * as THREE from './vendor/three.module.js';
import {FILM_EXCEL as X} from './film-excel.js';

// Representation geometry in metres. Industrial capacity does not depend on seats.
export const MEETING_ROOM=Object.freeze({center:[-13,7],tableRadius:1.12,door:{x:-9.5,minZ:5.1,maxZ:7.3},
 seats:{Carlos:[-13,8.7],Ricardo:[-11.25,7.95],Marcos:[-14.75,7.95],Rafael:[-11.25,6.05],Jorge:[-14.75,6.05],André:[-13,5.05]},
 ropeStand:[-15.3,10.95]});
export function meetingDirection(position){const dx=MEETING_ROOM.center[0]-position[0],dz=MEETING_ROOM.center[1]-position[1],n=Math.hypot(dx,dz)||1;return [dx/n,dz/n];}
export function createMeetingRoom({world,box,textSprite}){
 const group=new THREE.Group();group.name='meeting-room';world.add(group);
 box(group,-13,.04,7,7,.1,5.8,0xc1b5a2);
 // Cutaway panes: low southern sill keeps the seated cast legible from the aisle.
 for(const [x,z,w,d]of [[-13,4.15,7,.07],[-16.45,7,.07,5.7],[-9.5,4.6,.07,.95],[-9.5,8.6,.07,2.55]]){
  box(group,x,1.35,z,w,2.6,d,0xa3c5c7,{transparent:true,opacity:.17,depthWrite:false,roughness:.12});
  box(group,x,2.72,z,w,.06,d,0x52717c);
 }
 for(const [x,z]of [[-16.45,4.15],[-16.45,9.85],[-9.5,4.15],[-9.5,5.1],[-9.5,7.3],[-9.5,9.85]])box(group,x,1.4,z,.075,2.8,.075,0x52717c);
 box(group,-13,.22,9.85,7,.35,.06,0x9fb6b8);
 const door=new THREE.Group();door.position.set(-9.5,0,5.1);group.add(door);
 box(door,0,1.32,1.1,.06,2.55,2.15,0x9fc4c6,{transparent:true,opacity:.1,depthWrite:false});box(door,-.12,1.08,1.85,.12,.07,.25,0xe1c885);
 const table=new THREE.Mesh(new THREE.CylinderGeometry(1.12,1.12,.12,48),new THREE.MeshStandardMaterial({color:0xe5d6b7,roughness:.6}));table.position.set(-13,.94,7);group.add(table);table.castShadow=true;
 box(group,-13,.46,7,.38,.86,.38,0x496371);
 const chairs=new Map();
 for(const [name,position]of Object.entries(MEETING_ROOM.seats)){
  const chair=new THREE.Group();chair.name=`chair-${name}`;group.add(chair);const direction=meetingDirection(position);chair.rotation.y=Math.atan2(-direction[0],-direction[1]);
  box(chair,0,.51,0,.62,.1,.6,0x456875);box(chair,0,.87,.26,.62,.64,.09,0x456875);
  for(const x of [-.23,.23])for(const z of [-.22,.22])box(chair,x,.26,z,.045,.48,.045,0x516873);
  chairs.set(name,{chair,position,direction});
 }
 for(let i=0;i<3;i++){const a=i*Math.PI*2/3,x=-13+Math.cos(a)*.7,z=7+Math.sin(a)*.7;const laptop=new THREE.Group();laptop.position.set(x,1.02,z);laptop.rotation.y=-a+Math.PI/2;group.add(laptop);box(laptop,0,0,0,.5,.025,.34,0x526776);const lid=box(laptop,0,.19,-.14,.5,.36,.025,0x294758);lid.rotation.x=-.15;box(laptop,0,.19,-.12,.43,.28,.014,0x6badb8,{emissive:0x578f9c,emissiveIntensity:.3});}
 // The TV texture uses the same snapshot values as the recording panel.
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=576;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 box(group,-13,1.95,4.24,3.6,2.03,.1,0x243d4b);const screen=new THREE.Mesh(new THREE.PlaneGeometry(3.45,1.94),new THREE.MeshBasicMaterial({map:texture}));screen.position.set(-13,1.95,4.305);group.add(screen);
 box(group,-15.3,.93,10.25,2.1,.1,.55,0xd6c4a2);box(group,-15.3,.47,10.25,.12,.9,.3,0x496776);
 let key='';
 function update(s){const t=s?.elapsed||0;
  for(const [name,{chair,position,direction}]of chairs){const pull=s?.film?.actors?.[name]?.chairPull||0;chair.position.set(position[0]-direction[0]*pull*.36,0,position[1]-direction[1]*pull*.36);}
  door.rotation.y=Object.values(s?.film?.actors||{}).some(a=>a.walking||a.exitPhase==='standing')?Math.PI/2:0;
  const comparison=!!s?.film?.comparison,newKey=comparison?'comparison':s?.film?.act==='results'?`final:${s.shipped}:${s.backlog}`:'intro';if(newKey===key)return;key=newKey;
  ctx.fillStyle='#173b46';ctx.fillRect(0,0,1024,576);ctx.textAlign='left';ctx.fillStyle='#e1c785';ctx.font='bold 38px Arial';ctx.fillText(comparison?'MESMA QUEBRA · COM / SEM PULMÃO':'GAMA · COMERCIAL & PCP',48,70);
  const lines=comparison?[`Com pulmão: ${X.comparison.A.drum.toLocaleString('pt-BR')} un · ${X.comparison.A.idleHours} h sem material`,`Sem pulmão: ${X.comparison.B.drum.toLocaleString('pt-BR')} un · ${X.comparison.B.idleHours} h sem material`,`${X.comparison.B.lostUnits.toLocaleString('pt-BR')} un perdidas · R$ ${(X.comparison.B.lostGain/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})} mi`]:s?.film?.act==='results'?[`${s.shipped.toLocaleString('pt-BR')} expedidas · ${s.backlog} em atraso`,`MCT ${X.mct.current} → ${X.mct.future} dias corridos`,`QRM ${X.mct.qrm} · TOC R$ ${(X.mixGain/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})} mi`]:['O pedido espera. A fila cresce.','MCT atual: 31,5 dias corridos','Carga original da Montagem 1: 122%'];
  ctx.fillStyle='#f5f3e8';ctx.font='34px Arial';lines.forEach((line,i)=>ctx.fillText(line,48,190+i*108,930));texture.needsUpdate=true;
 }
 update(null);return {group,update,destroy(){texture.dispose();group.removeFromParent();}};
}
