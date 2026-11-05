import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {cinematicState} from '../factory-cinematic.js';

const windows={opening:[0,25],closing:[565,600],exit:[565,590],credits:[595,600]};
const snapshot=time=>({mode:'dbr',film:{presentationTime:time,story:{windows},actors:{}}});
function canvasFixture(){
 let count=0;const text=[];
 const ctx=new Proxy({fillText(value){text.push(value);},measureText(value){return {width:value.length*95};},createRadialGradient(){return {addColorStop(){}};}},{get:(target,key)=>target[key]??(()=>{})});
 return {createCanvas(){count++;return {width:0,height:0,getContext:()=>ctx};},get count(){return count;},text};
}
test('facade sign lights while the opening is still night',()=>{
 assert.equal(cinematicState(0).sign,0);
 assert.equal(cinematicState(3.5).day,0);
 assert.equal(cinematicState(3.5).sign,1);
 assert.equal(cinematicState(22).sign,1);
});
test('sign stays lit after the last interior fixture, then fades before credits',()=>{
 for(const time of [593.4,593.9,594.2]){
  const cine=cinematicState(time,{windows});assert.ok(cine.p<5);assert.equal(cine.sign,1);
 }
 assert.ok(cinematicState(594.6,{windows}).sign>0);
 assert.equal(cinematicState(594.99,{windows}).sign,0);
 assert.equal(cinematicState(595).sign,0);
});
test('sign uses one atlas, fixed geometry ahead of the fascia, and two washers',async()=>{
 const {createFacadeSign}=await import('../facade-sign.js');const canvas=canvasFixture();
 const sign=createFacadeSign({THREE,createCanvas:canvas.createCanvas});
 const face=sign.group.getObjectByName('facade-sign-face');assert.ok(face?.isMesh);assert.equal(face.geometry.type,'PlaneGeometry');
 assert.equal(face.rotation.y,0);assert.ok(face.position.z>14.55);assert.equal(face.material.opacity,1);
 const bounds=new THREE.Box3().setFromObject(face);assert.ok(bounds.max.x-bounds.min.x>=8);assert.ok(bounds.max.x-bounds.min.x<=9);
 assert.ok(bounds.min.y>=3.4&&bounds.max.y<=4.6);
 const textures=new Set(),lights=[];sign.group.traverse(o=>{assert.ok(!o.isSprite);if(o.material?.map)textures.add(o.material.map);if(o.material?.emissiveMap)textures.add(o.material.emissiveMap);if(o.isLight)lights.push(o);});
 assert.equal(canvas.count,1);assert.equal(textures.size,1);assert.ok([...textures][0].image.width<=2048);
 assert.deepEqual(canvas.text,['GAMA','COMPRESSORES AUTOMOTIVOS']);assert.equal(lights.length,2);
 for(const light of lights){assert.equal(light.isSpotLight,true);assert.ok(light.target.parent);assert.equal(light.castShadow,false);}
});
test('startup has three brief dips and remains deterministic when seeking',async()=>{
 const {facadeSignState}=await import('../facade-sign.js');let dips=0,descending=false;
 let previous=0;
 for(let t=1.5;t<3.6;t+=.005){const value=facadeSignState(snapshot(t),cinematicState(t,{windows})).power;
  if(value<previous-1e-5){if(!descending)dips++;descending=true;}else if(value>previous+1e-5)descending=false;
  previous=value;
 }
 assert.equal(dips,3);
 const expected=facadeSignState(snapshot(2.5),cinematicState(2.5,{windows}));
 facadeSignState(snapshot(595),cinematicState(595,{windows}));
 assert.deepEqual(facadeSignState(snapshot(2.5),cinematicState(2.5,{windows})),expected);
 for(const t of [4,10,22,566,590,594.2])assert.equal(facadeSignState(snapshot(t),cinematicState(t,{windows})).power,1);
});
test('artwork remains opaque when unlit, night lighting is stronger, and the interior stays clear',async()=>{
 const {createFacadeSign}=await import('../facade-sign.js'),canvas=canvasFixture();
 const sign=createFacadeSign({THREE,createCanvas:canvas.createCanvas});
 const face=sign.group.getObjectByName('facade-sign-face');
 sign.update(snapshot(0),cinematicState(0,{windows}));assert.equal(sign.group.visible,true);assert.equal(face.material.opacity,1);assert.equal(face.material.emissiveIntensity,0);
 sign.update(snapshot(4),cinematicState(4,{windows}));const night=face.material.emissiveIntensity;assert.ok(night>1);
 sign.update(snapshot(24),cinematicState(24,{windows}));assert.ok(face.material.emissiveIntensity<night*.2);
 sign.update(snapshot(300),cinematicState(300,{windows}));assert.equal(sign.group.visible,false);
 sign.update(snapshot(566),cinematicState(566,{windows}));assert.equal(sign.group.visible,true);
 sign.update(snapshot(595),cinematicState(595,{windows}));assert.equal(face.material.opacity,1);assert.equal(face.material.emissiveIntensity,0);
 sign.group.traverse(o=>{if(o.isLight)assert.equal(o.intensity,0);});
});
