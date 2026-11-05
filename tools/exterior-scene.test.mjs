import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {createExterior} from '../exterior-scene.js';
import {cinematicState} from '../factory-cinematic.js';

function fixture() {
 const world=new THREE.Group();
 const box=(parent,x,y,z,w,h,d,color)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));
  mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 };
 const logistics=new THREE.Group();logistics.name='gama-logistics';world.add(logistics);
 const oldRoad=box(logistics,10,-.12,52.5,120,.2,35,0x3c454b);
 const oldPaint=box(logistics,30,.025,40,10,.04,.1,0xe4c355);
 const oldApron=box(logistics,3,-.025,24.75,54,.09,20.5,0xaeb9ba);
 const platform=box(logistics,9.25,.42,24.65,39.5,.84,2.5,0x7c9193);
 const truck=new THREE.Group();truck.position.set(7,0,43);logistics.add(truck);
 const wheel=box(truck,0,.5,0,1,1,1,0x333333);
 const exterior=createExterior({world,THREE,box});
 return {world,exterior,oldRoad,oldPaint,oldApron,platform,wheel};
}
function snapshot(time,actors={}) {return {mode:'dbr',film:{presentationTime:time,actors}};}
function bounds(root) {
 root.updateWorldMatrix(true,true);const result=[];
 root.traverse(o=>{
  if(!o.isMesh)return;
  o.geometry.computeBoundingBox();
  for(let i=0;i<(o.isInstancedMesh?o.count:1);i++){
   const matrix=o.matrixWorld.clone();
   if(o.isInstancedMesh){const instance=new THREE.Matrix4();o.getMatrixAt(i,instance);matrix.multiply(instance);}
   result.push({name:o.name,box:o.geometry.boundingBox.clone().applyMatrix4(matrix)});
  }
 });return result;
}
const overlaps=(a,x0,x1,z0,z1)=>a.max.x>x0&&a.min.x<x1&&a.max.z>z0&&a.min.z<z1;

test('exterior replaces only decorative road and apron surfaces',()=>{
 const {world,exterior,oldRoad,oldPaint,oldApron,platform,wheel}=fixture();
 assert.equal(exterior.group.parent,world);
 assert.equal(oldRoad.visible,false);assert.equal(oldPaint.visible,false);assert.equal(oldApron.visible,false);
 assert.equal(platform.visible,true);assert.equal(wheel.visible,true);
 assert.ok(exterior.group.getObjectByName('exterior-road'));
 assert.ok(exterior.group.getObjectByName('exterior-apron'));
});
test('landscape and parked cars preserve the camera sightline',()=>{
 const {exterior}=fixture();const campus=exterior.group.getObjectByName('exterior-campus');assert.ok(campus);
 for(const {name,box} of bounds(campus)){
  if(box.max.y>.50001)assert.ok(box.max.x<=-23||box.max.z<=-16,`${name} occludes the cutaway`);
 }
});
test('road, dock approach and employee entrance remain free of raised objects',()=>{
 const {exterior}=fixture();
 for(const name of ['exterior-campus','exterior-road','exterior-apron']){
  const root=exterior.group.getObjectByName(name);assert.ok(root);
  for(const {name:meshName,box} of bounds(root)){
   if(overlaps(box,-50,70,35,70)||overlaps(box,-10.5,29,21.9,35)||overlaps(box,-16,-10,15,17.3)){
    assert.ok(box.max.y<=.055,`${meshName} intrudes into a transport route (${box.max.y})`);
   }
  }
 }
});
test('roof equipment follows the reveal, including reverse seeks',()=>{
 const {exterior}=fixture();const roof=exterior.group.getObjectByName('exterior-roof');assert.ok(roof);
 exterior.update(snapshot(0),cinematicState(0));assert.equal(roof.visible,true);
 roof.traverse(o=>{if(o.isMesh)assert.equal(o.material.depthWrite,true,'opaque rooftop details must occlude the roof surface correctly');});
 exterior.update(snapshot(9),cinematicState(9));assert.equal(roof.visible,true);
 roof.traverse(o=>{if(o.isMesh){assert.ok(Math.abs(o.material.opacity-cinematicState(9).roof)<1e-9);assert.equal(o.material.depthWrite,false);}});
 exterior.update(snapshot(25),cinematicState(25));assert.equal(roof.visible,false);
 exterior.update(snapshot(300),cinematicState(300));assert.equal(roof.visible,false);
 exterior.update(snapshot(0),cinematicState(0));assert.equal(roof.visible,true);
});
test('night lighting responds to cinematic daylight and non-film modes',()=>{
 const {exterior}=fixture(),lights=[];exterior.group.traverse(o=>{if(o.isLight)lights.push(o);});
 assert.ok(lights.length>0&&lights.length<=3);
 exterior.update(snapshot(0),cinematicState(0));const night=lights.reduce((n,l)=>n+l.intensity,0);assert.ok(night>0);
 exterior.update(snapshot(24),cinematicState(24));assert.ok(lights.reduce((n,l)=>n+l.intensity,0)<night*.05);
 exterior.update(snapshot(600),cinematicState(600));assert.ok(lights.reduce((n,l)=>n+l.intensity,0)>night*.9);
 exterior.update({mode:'mps',elapsed:0},cinematicState(0));assert.equal(lights.reduce((n,l)=>n+l.intensity,0),0);
});
test('roof waits for departing actors and fan motion is deterministic',()=>{
 const {exterior}=fixture(),roof=exterior.group.getObjectByName('exterior-roof');assert.ok(roof);
 exterior.update(snapshot(600,{Carlos:{exitPhase:'walking'}}),cinematicState(600));assert.equal(roof.visible,false);
 exterior.update(snapshot(600,{Carlos:{exitPhase:'exited'}}),cinematicState(600));assert.equal(roof.visible,true);
 const fan=exterior.group.getObjectByName('exterior-fan-0');assert.ok(fan);
 exterior.update(snapshot(4),cinematicState(4));const angle=fan.rotation.y;
 exterior.update(snapshot(2),cinematicState(2));assert.notEqual(fan.rotation.y,angle);
 exterior.update(snapshot(4),cinematicState(4));assert.equal(fan.rotation.y,angle);
});
test('street arrows follow truck arrival from the east and departure to the south',()=>{
 const {exterior}=fixture(),entries=[],exits=[];
 exterior.group.traverse(o=>{
  if(o.name==='street-entry-arrow')entries.push(o);
  if(o.name==='street-exit-arrow')exits.push(o);
 });
 assert.ok(entries.length>=2);assert.ok(exits.length>=2);
 for(const o of entries){const direction=new THREE.Vector3(0,0,-1).applyQuaternion(o.quaternion);assert.ok(direction.x<-.99);}
 for(const o of exits){const direction=new THREE.Vector3(0,0,-1).applyQuaternion(o.quaternion);assert.ok(direction.z>.99);}
});
