import * as THREE from './vendor/three.module.js';

// A small articulated worker. Both feet move with the legs; two-link arms target
// the same world-space grip points as the one visible batch specimen.
export function createWorkerRig({shirt=0x487b91,helmet=0xe7c65b,skin=0xd2aa88,showHelmet=true,vestColor=0xe4be58}={}){
 const group=new THREE.Group(),body=new THREE.Group();group.add(body);body.position.y=.73;
 const mats={shirt:new THREE.MeshStandardMaterial({color:shirt,roughness:.75}),pants:new THREE.MeshStandardMaterial({color:0x3c5260,roughness:.8}),skin:new THREE.MeshStandardMaterial({color:skin,roughness:.8}),boot:new THREE.MeshStandardMaterial({color:0x253941,roughness:.8}),helmet:new THREE.MeshStandardMaterial({color:helmet,roughness:.5}),vest:new THREE.MeshStandardMaterial({color:vestColor,roughness:.8})};
 const mesh=(geom,mat,parent=group)=>{const m=new THREE.Mesh(geom,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
 const box=(w,h,d,mat,parent=group,x=0,y=0,z=0)=>{const m=mesh(new THREE.BoxGeometry(w,h,d),mat,parent);m.position.set(x,y,z);return m;};
 const sphere=(r,mat,parent=group,x=0,y=0,z=0)=>{const m=mesh(new THREE.SphereGeometry(r,10,8),mat,parent);m.position.set(x,y,z);return m;};
 box(.44,.53,.28,mats.shirt,body,0,.27,0);box(.36,.36,.025,mats.vest,body,0,.28,-.15);box(.36,.055,.028,mats.helmet,body,0,.28,-.17);
 const head=sphere(.205,mats.skin,body,0,.72,0);const cap=sphere(.202,mats.helmet,body,0,.855,0);cap.visible=showHelmet;const brim=mesh(new THREE.CylinderGeometry(.255,.255,.065,12),mats.helmet,body);brim.position.set(0,.85,0);brim.visible=showHelmet;box(.32,.055,.035,mats.boot,body,0,.75,-.185);sphere(.055,mats.skin,body,0,.67,-.19);
 const arms=[-1,1].map(sign=>({sign,upper:mesh(new THREE.CylinderGeometry(.075,.08,1,8),mats.shirt),fore:mesh(new THREE.CylinderGeometry(.065,.07,1,8),mats.shirt),elbow:sphere(.08,mats.shirt),hand:sphere(.085,mats.skin)}));
 const legs=[-1,1].map(sign=>({sign,upper:mesh(new THREE.CylinderGeometry(.09,.105,1,8),mats.pants),lower:mesh(new THREE.CylinderGeometry(.08,.085,1,8),mats.pants),knee:sphere(.09,mats.pants),foot:box(.2,.12,.33,mats.boot)}));
 const toolGroup=new THREE.Group();arms[1].hand.add(toolGroup);const jaw=box(.32,.055,.06,mats.boot,toolGroup,0,0,-.09);box(.045,.14,.06,mats.boot,toolGroup,-.13,-.04,-.09);box(.045,.14,.06,mats.boot,toolGroup,.1,-.04,-.09);toolGroup.visible=false;
 const up=new THREE.Vector3(0,1,0);const v3=a=>new THREE.Vector3(...a);
 function segment(mesh,a,b){const d=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=d.length();mesh.quaternion.setFromUnitVectors(up,d.normalize());}
 function elbowFor(a,b,l1,l2,pole){const d=b.clone().sub(a),dist=Math.max(.001,Math.min(l1+l2-.002,d.length()));d.normalize();const actual=a.clone().addScaledVector(d,dist);const along=(l1*l1-l2*l2+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,l1*l1-along*along));const p=pole.clone().addScaledVector(d,-pole.dot(d)).normalize();return {joint:a.clone().addScaledVector(d,along).addScaledVector(p,height),end:actual};}
 let latest={};
 function pose({position=[0,0],direction=[0,-1],walking=false,gait=0,strideScale=1,bend=0,twist=0,handsWorld=null,handsLocal=null,reach=1,tool=false,seated=0}={}){
  seated=Math.max(0,Math.min(1,seated));
  toolGroup.visible=!!tool;
  latest={position:[...position],direction:[...direction],walking,gait,strideScale,bend,twist,seated};group.position.set(position[0],.05,position[1]);if(Math.hypot(...direction)>.001)group.rotation.y=Math.atan2(-direction[0],-direction[1]);
  const crouch=Math.min(.3,Math.max(0,bend)*.27);body.position.y=.73-crouch-seated*.19;body.rotation.x=-Math.min(.65,Math.max(0,bend)*.55);body.rotation.y=twist;
  group.updateMatrixWorld(true);
  for(const leg of legs){const phase=gait+(leg.sign<0?0:Math.PI),stride=walking?Math.sin(phase)*.14*strideScale:0,lift=walking?Math.max(0,Math.cos(phase))*.16*strideScale:0;const hip=new THREE.Vector3(leg.sign*.115,.76-crouch-seated*.19,0),ankle=new THREE.Vector3(leg.sign*.115,.14+lift,stride);const ik=elbowFor(hip,ankle,.35,.34,new THREE.Vector3(0,.05,-1));if(seated){ik.joint.lerp(new THREE.Vector3(leg.sign*.115,.54,-.34),seated);ik.end.lerp(new THREE.Vector3(leg.sign*.115,.14,-.38),seated);}segment(leg.upper,hip,ik.joint);segment(leg.lower,ik.joint,ik.end);leg.knee.position.copy(ik.joint);leg.foot.position.copy(ik.end).add(new THREE.Vector3(0,-.055,-.08));leg.foot.rotation.x=walking?Math.sin(phase)*.14*strideScale:0;}
  for(let i=0;i<arms.length;i++){const arm=arms[i],shoulder=body.localToWorld(new THREE.Vector3(arm.sign*.255,.46,0));group.worldToLocal(shoulder);
   const swing=walking?Math.sin(gait+(arm.sign<0?Math.PI:0))*.15*strideScale:0;const rest=new THREE.Vector3(arm.sign*.29,.77,-.04+swing);let hand=rest.clone();
   if(handsWorld?.[i])hand=group.worldToLocal(v3(handsWorld[i]));else if(handsLocal?.[i])hand=v3(handsLocal[i]);hand.lerp(rest,1-Math.min(1,Math.max(0,reach)));
   const ik=elbowFor(shoulder,hand,.42,.4,new THREE.Vector3(arm.sign*.75,-.25,.35));segment(arm.upper,shoulder,ik.joint);segment(arm.fore,ik.joint,ik.end);arm.elbow.position.copy(ik.joint);arm.hand.position.copy(ik.end);
  }
 }
 pose();return {group,pose,setAppearance({shirt,vestColor,showHelmet}={}){if(shirt!==undefined)mats.shirt.color.setHex(shirt);if(vestColor!==undefined)mats.vest.color.setHex(vestColor);if(showHelmet!==undefined){cap.visible=showHelmet;brim.visible=showHelmet;}},reset(){pose();},getPose(){return {...latest};},getGripPositions(){group.updateMatrixWorld(true);return arms.map(a=>a.hand.getWorldPosition(new THREE.Vector3()).toArray());}};
}

// An active carrier mission supplies the whole pose, including hands on the tiller.
export function workerMissionPose(operator){
 if(!operator?.carrierId)return null;
 return {position:operator.position,direction:operator.direction,walking:!!operator.walking,gait:operator.gait??(operator.distance??0)*7,bend:operator.bend??0,handsLocal:operator.handsLocal??null,twist:operator.twist??0};
}
