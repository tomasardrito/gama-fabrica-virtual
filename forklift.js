import * as THREE from './vendor/three.module.js';

// Origin = centre of the supported pallet; forward = local -Z.
// Overall width 1.10 m; body sits behind the load at Z=.60..1.70 m.
export function createForklift({color=0xdda53d,number=1}={}){
 const group=new THREE.Group(),forks=new THREE.Group();group.add(forks);
 const material=color=>new THREE.MeshStandardMaterial({color,roughness:.57,metalness:.16});
 const amber=material(color),gold=material(0xe4bb59),dark=material(0x314651),steel=material(0x899ba1),rubber=material(0x26373d),skin=material(0xd5ac89),uniform=material(0x46788c),pants=material(0x3b515b),helmet=material(0xead06b);
 const add=(geo,mat,parent=group)=>{const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(x,y,z,w,h,d,mat,parent=group)=>{const m=add(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;};
 const cylinder=(x,y,z,r,h,mat,parent=group,axis='y')=>{const m=add(new THREE.CylinderGeometry(r,r,h,12),mat,parent);m.position.set(x,y,z);if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;};
 const sphere=(x,y,z,r,mat,parent=group)=>{const m=add(new THREE.SphereGeometry(r,12,8),mat,parent);m.position.set(x,y,z);return m;};
 const segment=(a,b,r,mat,parent=group)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=add(new THREE.CylinderGeometry(r,r,d.length(),10),mat,parent);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;};
 box(0,.29,1.15,1,.25,1.1,dark);box(0,.51,1.47,1,.49,.45,amber);box(0,.68,1.49,.96,.12,.4,gold);
 for(const x of [-.45,.45]){box(x,.52,1.02,.16,.36,.82,amber);box(x,.76,1.2,.13,.1,.55,gold);}
 box(0,.41,.99,.75,.08,.62,steel);box(0,.76,1.35,.53,.14,.48,rubber);box(0,.99,1.56,.55,.48,.1,rubber);
 box(0,.55,1.7,.62,.15,.025,dark);for(const x of [-.34,.34])box(x,.6,1.7,.1,.12,.025,gold);
 const wheels=[];for(const z of [.88,1.45])for(const x of [-.48,.48]){const p=new THREE.Group();p.position.set(x,z<1?.25:.24,z);group.add(p);const r=z<1?.25:.24;cylinder(0,0,0,r,.14,rubber,p,'x');cylinder(Math.sign(x)*.075,0,0,r*.48,.015,steel,p,'x');wheels.push({p,r});}
 // Mast rails and hydraulic ram stay fixed; carriage, backrest and forks lift.
 for(const x of [-.41,.41]){box(x,1.04,.64,.095,2.08,.11,dark);box(x,1.03,.61,.035,1.8,.025,steel);}
 box(0,1.98,.64,.89,.12,.15,dark);cylinder(0,.83,.69,.065,1.5,dark);cylinder(0,1.36,.69,.038,.82,steel);
 box(0,.31,.54,.93,.12,.12,dark,forks);for(const x of [-.27,.27]){box(x,.17,-.025,.12,.065,1.25,steel,forks);box(x,.36,.56,.12,.42,.085,steel,forks);}
 for(const x of [-.43,.43])box(x,.71,.57,.055,1.02,.055,dark,forks);for(const y of [.4,.7,1.15])box(0,y,.57,.9,.045,.055,dark,forks);for(const x of [-.22,0,.22])box(x,.78,.57,.025,.7,.035,dark,forks);
 // Overhead protection is open so the seated pose and steering remain visible.
 for(const x of [-.47,.47])for(const z of [.78,1.65])box(x,1.25,z,.065,1.28,.065,dark);
 for(const x of [-.51,.51])box(x,1.9,1.215,.065,.08,.95,dark);for(const z of [.755,1.675])box(0,1.9,z,1.08,.08,.065,dark);for(const x of [-.32,0,.32])box(x,1.95,1.215,.04,.04,.89,gold);cylinder(-.34,2.05,1.66,.075,.15,gold);
 // Driver: pelvis on the seat, thighs forward, knees bent and feet on pedals.
 box(0,.9,1.31,.37,.18,.3,pants);box(0,1.15,1.34,.4,.43,.24,uniform);box(0,1.15,1.205,.32,.29,.025,gold);box(0,1.2,1.185,.31,.035,.02,helmet);
 sphere(0,1.5,1.32,.185,skin);sphere(0,1.63,1.32,.19,helmet);cylinder(0,1.6,1.32,.235,.055,helmet);box(0,1.52,1.145,.28,.045,.025,dark);
 for(const sign of [-1,1]){const x=sign*.115;segment([x,.89,1.3],[x,.74,.94],.09,pants);sphere(x,.74,.94,.09,pants);segment([x,.74,.94],[x,.4,.89],.075,pants);box(x,.36,.8,.18,.12,.28,rubber);}
 segment([0,.55,.86],[0,1.07,.9],.035,dark);const steering=add(new THREE.TorusGeometry(.21,.025,8,20),rubber);steering.position.set(0,1.08,.9);steering.rotation.x=-.5;segment([-.18,1.08,.9],[.18,1.08,.9],.014,steel);
 for(const sign of [-1,1]){segment([sign*.23,1.3,1.32],[sign*.24,1.13,1.12],.065,uniform);segment([sign*.24,1.13,1.12],[sign*.17,1.09,.92],.06,uniform);sphere(sign*.17,1.09,.92,.07,skin);}
 if(number!==null&&typeof document!=='undefined'){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#243d49';ctx.fillRect(0,0,64,64);ctx.fillStyle='white';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.fillText(String(number),32,50);
  const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas)}));badge.position.set(0,2.3,1);badge.scale.set(.6,.6,1);group.add(badge);
 }
 let lift=0;
 return {group,forks,setPose({position=[0,0],direction=[0,-1],distance=0,forkLift=0,groundHeight=0}={}){group.position.set(position[0],groundHeight,position[1]);if(Math.hypot(...direction)>.001)group.rotation.y=Math.atan2(-direction[0],-direction[1]);lift=Math.max(0,Math.min(1.5,forkLift));forks.position.y=lift;for(const w of wheels)w.p.rotation.x=-distance/w.r;},getLift(){return lift;}};
}
