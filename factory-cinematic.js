import {LOGISTICS_LAYOUT} from './logistics-layout.js';
import {createFacadeSign} from './facade-sign.js';
import {FILM_TIMING as T} from './film-story.js';
import * as THREE from './vendor/three.module.js';
import {DBR_LAYOUT,dbrWorkStand,sampleRoute,routeLength} from './dbr-layout.js';
const clamp=t=>Math.max(0,Math.min(1,t)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const departingWorkers=Object.entries(DBR_LAYOUT).flatMap(([stage,rows])=>rows.map((_,i)=>`${stage}:${i}`)).filter(id=>!['lap:0','m1:0'].includes(id)).concat('buffer:0');
// Use the existing staff aisles at a measured walking pace. The left side of
// the entrance remains separate from the meeting group's path on the right.
// Staff reach each post from the aisle on the post's side of the machine row
// (the Rosqueadora posts face the aisle between the Rosqueadora and the meeting room).
export function staffAisle(stand){return stand[1]<-2.8?-2.8:stand[1]<3.6?3.6:11.1;}
export function sampleFactoryWorkerExit(id,stand,time,{windows}={}){
 const key=id.includes(':')?id:`${id}:0`,index=departingWorkers.indexOf(key);
 if(index<0)return null;
 const aisle=staffAisle(stand),path=[stand,[stand[0],aisle],[-18,aisle],[-18,13],[-15.2,13],[-15.2,16.7]];
 const distance=routeLength(path),duration=distance/1.6,end=(windows?.exit?.[1]??595)-5-index*.9,start=end-duration;
 if(time<start)return null;
 const u=clamp((time-start)/duration),pose=sampleRoute(path,u);
 return {...pose,walking:u<1,visible:u<1,gait:distance*u*7,start,end};
}
export function cinematicState(elapsed,{windows}={}){
 const closeStart=windows?.exit?.[1]??T.closingStart,closeEnd=windows?.credits?.[0]??T.duration;
 const closing=elapsed>=closeStart,local=closing?(elapsed-closeStart)*15/(closeEnd-closeStart):elapsed*15/T.openingSeconds,active=elapsed<T.openingSeconds||closing,p=closing?Math.max(0,15-local):local;
 // Illuminate during the night establishing shot; keep the sign on until
 // every interior sector is dark, then fade immediately before the credits.
 const signEnd=windows?.credits?.[0]??T.duration-5,fade=Math.min(.7,Math.max(.01,signEnd-closeStart)*.14);
 const sign=closing?1-smooth((elapsed-(signEnd-fade))/(fade*.85)):smooth((p-1)/.9);
 return {active,closing,local,p,gate:smooth((p-2)/3),dock:smooth((p-10)/2),roof:1-smooth((p-4)/3),day:smooth((p-4)/10),sign,entered:smooth((p-6)/6)};
}
export function createFactoryCinematic({world,scene,camera,ambient,sun,fill,renderer,box,textSprite,machines,workers,pcp,movers}){
 const shell=new THREE.Group();world.add(shell);const roof=new THREE.Group();shell.add(roof);
 box(roof,0,5,-.5,44.5,.25,30.5,0x496272);for(let x=-22;x<22;x+=2)box(roof,x,5.14,-.5,.06,.025,30,0x718491);
 const facade=new THREE.Group();shell.add(facade);box(facade,-19,2.2,14.2,6,4.4,.25,0x94a8af);box(facade,-1.5,2.2,14.2,17,4.4,.25,0x94a8af);box(facade,-13,4.3,14.2,6,.3,.35,0x496272);
 const gate=new THREE.Group();shell.add(gate);for(let i=0;i<14;i++)box(gate,-13,.16+i*.29,14.25,5.9,.28,.12,0x587784);
 const dock=new THREE.Group();world.add(dock);for(const d of LOGISTICS_LAYOUT.docks)for(let i=0;i<10;i++)box(dock,d.position[0],.15+i*.29,d.position[1]-4.9,3.4,.28,.1,0x6a838b);
 const outsideSign=createFacadeSign({THREE,software:!!renderer.isSoftwareRenderer});world.add(outsideSign.group);
 roof.traverse(o=>{if(o.isMesh){o.userData.softwareLayer=3;o.material=o.material.clone();o.material.transparent=true;o.material.depthWrite=false;}});
 // Wall panels reveal the interior with the roof; the GAMA sign keeps its cue.
 const facadePanels=facade.children.filter(o=>o.isMesh);
 for(const panel of facadePanels){panel.material=panel.material.clone();panel.material.color.setHex(0xcbd5cf);panel.material.transparent=true;panel.material.depthWrite=false;}
 const sectors=['torno','us1','us2','lap','rosq','buffer','m1','m2','insp','dispatch'];
 const lightPos=[[-12,-7],[-4,-7],[4,-7],[11,-7],[5,0],[-3,0],[-2,7],[6,7],[13,7],[13,14]];
 const fixtures=lightPos.map(([x,z])=>{const m=box(world,x,4.25,z,2.2,.08,.5,0xffe7ab);m.material=m.material.clone();return m;});
 const materials=machines.map(m=>{const meshes=[];m.g.traverse(o=>{if(o.isMesh&&o.material?.color){o.material=o.material.clone();meshes.push({o,color:o.material.color.clone(),emissive:o.material.emissive?.clone(),intensity:o.material.emissiveIntensity});}});return {m,meshes};});
 const coveredSprites=new Map();
 function update(s){const is=s.mode==='dbr',st=cinematicState(s.film?.presentationTime??s.elapsed??0,{windows:s.film?.story?.windows}),active=is&&st.active;
  const leaving=st.closing&&Object.values(s.film?.actors||{}).some(a=>a.exitPhase!=='exited');
  if(leaving){st.p=15;st.roof=0;st.day=1;st.gate=1;st.sign=1;}
  const p=active?st.p:15;
  shell.visible=active;roof.visible=active&&st.roof>.01;facade.visible=active;gate.visible=active;dock.visible=is&&st.dock<.999;
  roof.traverse(o=>{if(o.isMesh){o.material.opacity=st.roof;o.material.depthWrite=st.roof>.99;o.castShadow=st.roof>.95;}});for(const panel of facadePanels){panel.material.opacity=st.roof;panel.material.depthWrite=st.roof>.99;panel.visible=st.roof>.01;panel.castShadow=st.roof>.95;}gate.position.y=st.gate*4.2;gate.scale.y=Math.max(.01,1-st.gate);dock.position.y=(active?st.dock:1)*3;dock.scale.y=Math.max(.01,1-(active?st.dock:1));
  const daylight=active?st.day:1;scene.background.setHex(active?0x142638:0xe7eceb);if(active)scene.background.lerp(new THREE.Color(0xe7eceb),daylight);scene.fog.color.copy(scene.background);
  ambient.intensity=.35+daylight*2.25;sun.intensity=.12+daylight*3.18;fill.intensity=.18+daylight*1.07;renderer.exposureFactor=.14+daylight*.86;
  outsideSign.update(s,st);
  if(active&&st.roof>.05){world.traverse(o=>{if(o.isSprite){if(!coveredSprites.has(o))coveredSprites.set(o,o.visible);o.visible=false;}});}else{for(const [o,v]of coveredSprites)o.visible=v;coveredSprites.clear();}
  sectors.forEach((id,i)=>{const on=active?smooth((p-5-i*.65)/.6):1;fixtures[i].material.color.setHex(on>.5?0xffefd1:0x354957);fixtures[i].material.emissive?.setHex(0xffd98d);fixtures[i].material.emissiveIntensity=on*.6;fixtures[i].visible=on>.01;});
  for(const {m,meshes}of materials){const idx=sectors.indexOf(m.id),on=active?smooth((p-5-idx*.65)/.6):1;for(const {o,color,emissive,intensity}of meshes){o.material.color.copy(color).multiplyScalar(.18+on*.82);if(o.material.emissive&&emissive)o.material.emissive.copy(emissive);o.material.emissiveIntensity=(intensity||0)*on;}if(active){m.lamp.material.color.setHex(on>.5?0xa8efba:0x263b44);m.moving.rotation.set(0,0,0);}}
  if(is)for(const [id,w]of workers){const stage=id.split(':')[0],index=Number(id.split(':')[1]||0),stand=DBR_LAYOUT[stage]?.[index]?dbrWorkStand(stage,index):w.cfg.workStand||w.cfg.stand,pose=sampleFactoryWorkerExit(id,stand,s.film?.presentationTime??s.elapsed,{windows:s.film?.story?.windows});if(pose){w.rig.group.visible=pose.visible;w.rig.pose({...pose,bend:0});}}
  if(!active)return;
  if(!st.closing)for(const [id,w]of workers){const index=sectors.indexOf(id.split(':')[0]),u=smooth((p-6-Math.max(0,index)*.18)/4),f=DBR_LAYOUT[id.split(':')[0]]?.[Number(id.split(':')[1]||0)],end=f?dbrWorkStand(id.split(':')[0],Number(id.split(':')[1]||0)):w.cfg.workStand||w.cfg.stand,aisle=staffAisle(end),path=[[-13,16],[-18,13],[-18,aisle],[end[0],aisle],end],pos=sampleRoute(path,u);w.rig.group.visible=u>0;w.rig.pose({position:pos.position,direction:pos.direction,walking:u>0&&u<1,gait:(s.elapsed||0)*7,bend:0});}
  if(!st.closing)pcp.group.visible=p>8;for(const m of movers)m.g.visible=false;
  // Exterior camera reveals the cutaway only after the main gate opens.
  if(leaving)return;
  const reveal=smooth((p-4)/6),distance=58-14*smooth(p/5);camera.position.set(8+20*reveal,12+23*reveal,45-8*reveal);camera.lookAt(0,1,3-5*reveal);const aspect=renderer.domElement.width/Math.max(1,renderer.domElement.height);camera.left=-distance/2;camera.right=distance/2;camera.top=distance/(2*aspect);camera.bottom=-distance/(2*aspect);camera.updateProjectionMatrix();
 }
 return {update};
}
