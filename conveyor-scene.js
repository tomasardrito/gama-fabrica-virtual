import * as THREE from './vendor/three.module.js';
import {CONVEYOR_SECTIONS,CONVEYOR_WIDTH,BUFFER_POSITIONS} from './dbr-conveyors.js';

export function createRollerConveyors({world,textSprite}) {
 const group=new THREE.Group();group.name='DBR roller conveyors';world.add(group);
 const buckets=new Map(),joints=[];
 const near=(a,b,r=.01)=>Math.hypot(a[0]-b[0],a[1]-b[1])<r;
 const between=(n,a,b)=>n>=Math.min(a,b)-1e-6&&n<=Math.max(a,b)+1e-6;
 for(const [a,b] of CONVEYOR_SECTIONS)for(const [c,d]of CONVEYOR_SECTIONS){
  if(a[1]!==b[1]||c[0]!==d[0])continue;
  const p=[c[0],a[1]];
  if(between(p[0],a[0],b[0])&&between(p[1],c[1],d[1])&&!joints.some(j=>near(j,p)))joints.push(p);
 }
 function add(geometry,color,x,y,z,rotation=0){
  const g=geometry.index?geometry.toNonIndexed():geometry;
  g.rotateY(rotation);g.translate(x,y,z);
  if(!buckets.has(color))buckets.set(color,{positions:[],normals:[]});
  const bucket=buckets.get(color);bucket.positions.push(...g.attributes.position.array);bucket.normals.push(...g.attributes.normal.array);
  if(g!==geometry)geometry.dispose();g.dispose();
 }
 const box=(x,y,z,w,h,d,color,rotation=0)=>add(new THREE.BoxGeometry(w,h,d),color,x,y,z,rotation);
 const steel=0xb6c5c7,frame=0x526c74,dark=0x354d56,guard=0xc5a559;
 const leg=(x,z)=>{box(x,.29,z,.09,.52,.09,frame);box(x,.055,z,.24,.06,.24,dark);};
 const seen=new Set();
 for(const [a,b]of CONVEYOR_SECTIONS){
  const horizontal=a[1]===b[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(length/.27),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
  for(let i=0;i<=steps;i++){
   const x=a[0]+dx*length*i/steps,z=a[1]+dz*length*i/steps,key=`${x.toFixed(2)}:${z.toFixed(2)}`;
   if(joints.some(p=>near(p,[x,z],.77))||seen.has(key))continue;seen.add(key);
   const cylinder=new THREE.CylinderGeometry(.07,.07,CONVEYOR_WIDTH-.12,8,1);
   cylinder.rotateZ(horizontal?0:Math.PI/2);if(horizontal)cylinder.rotateX(Math.PI/2);
   add(cylinder,steel,x,.6,z);
   for(const side of [-1,1])box(x-dz*side*.65,.52,z+dx*side*.65,horizontal?length/steps+.015:.08,.2,horizontal?.08:length/steps+.015,frame);
   if(i%7===0)for(const side of [-1,1])leg(x-dz*side*.5,z+dx*side*.5);
  }
 }
 for(const [x,z]of joints){
  box(x,.5,z,1.44,.22,1.44,frame);box(x,.625,z,1.3,.035,1.3,steel);
  // Pop-up cross transfer: two perpendicular chain tracks on a roller table.
  for(const offset of [-.4,.4]){box(x+offset,.65,z,.055,.035,1.24,dark);box(x,.65,z+offset,1.24,.035,.055,dark);}
  for(const dx of [-.52,.52])for(const dz of [-.52,.52])leg(x+dx,z+dz);
 }
 for(const [i,[x,z]]of BUFFER_POSITIONS.entries()){
  box(x,.54,z+Math.sign(z-.5)*.72,1.1,.1,.07,guard);
  const badge=textSprite(`${String(i+1).padStart(2,'0')} · 1 PALLET`,1.22,'#e9eeec','#455e65');
  badge.position.set(x,.93,z+Math.sign(z-.5)*.78);group.add(badge);
 }
 for(const [color,{positions,normals}]of buckets){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.55}));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
 }
 return {group,update(snapshot){group.visible=snapshot.mode==='dbr';}};
}
