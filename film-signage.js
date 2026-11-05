import * as THREE from './vendor/three.module.js';
import {makeBrand} from './film-branding.js';

export function makeFixedBrand(options){
 const sprite=makeBrand(options),material=new THREE.MeshBasicMaterial({map:sprite.material.map,transparent:true,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(sprite.scale.x,sprite.scale.y),material);mesh.name='gama-fixed-brand';sprite.material.dispose();return mesh;
}

// Painted surfaces and fixed equipment plates; no screen-facing billboards.
export function createPhysicalSignage(world,machines){
 const group=new THREE.Group();group.name='factory-physical-signage';world.add(group);
 function plate(text,width,height,{paint=false}={}){
  const c=document.createElement('canvas');c.width=1024;c.height=128;
  const ctx=c.getContext('2d');
  if(!paint){ctx.fillStyle='#263f49';ctx.fillRect(0,0,1024,128);}
  ctx.fillStyle=paint?'#587168':'#f5f0d9';ctx.font='700 80px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,68,980);
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const material=new THREE.MeshBasicMaterial({map,transparent:paint,depthWrite:!paint,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);mesh.name=`sign:${text}`;return mesh;
 }
 const sectors=[
  ['TORNEARIA',-12,-10.7,5.3],['USINAGEM 1',-4,-10.7,5.5],['USINAGEM 2',4,-10.7,5.4],
  ['LAPIDAÇÃO',11,-10.7,5.4],['ROSQUEADORA',5,-3.1,5.6],['PULMÃO',-3.3,-3.1,4],
  ['MONTAGEM 1',-2,10.2,5.7],['MONTAGEM 2',6,10.2,5.7],['INSPEÇÃO',13,10.2,4.7],
  ['COMPONENTES',-13.5,2,6],['CORPOS USINADOS',18,-4.3,5.5],['EXPEDIÇÃO',7,18.4,7],
 ];
 for(const [name,x,z,width]of sectors){const p=plate(name,width,.8,{paint:true});p.rotation.x=-Math.PI/2;p.position.set(x,.086,z);group.add(p);}
 const codes={torno:'TOR',us1:'US1',us2:'US2',lap:'LAP',rosq:'ROS',m1:'M1',m2:'M2',insp:'INSP'};
 for(const m of machines){const p=plate(`${codes[m.id]} · ${String(m.index+1).padStart(2,'0')}`,1,.16);p.position.set(0,.86,.765);m.g.add(p);}
 return group;
}
