import * as THREE from './vendor/three.module.js';
// Local forward is +Z. Origin is the pallet centre; no pallet or worker here.
export function createInternalCart(){
 const group=new THREE.Group(),forks=new THREE.Group();group.add(forks);
 const yellow=new THREE.MeshStandardMaterial({color:0xeeb833,roughness:.4}),metal=new THREE.MeshStandardMaterial({color:0x425965}),rubber=new THREE.MeshStandardMaterial({color:0x202c35});
 const box=(parent,x,y,z,w,h,d,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);parent.add(m);return m;};
 for(const x of [-.24,.24]){box(forks,x,.08,0,.16,.07,1.15,yellow);const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.13,12),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.07,.43);group.add(wheel);}
 box(group,0,.19,-.63,.64,.23,.24,yellow);box(group,0,.4,-.72,.18,.35,.16,metal);
 const steering=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.18,16),rubber);steering.rotation.z=Math.PI/2;steering.position.set(0,.13,-.72);group.add(steering);
 const tiller=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.78,12),metal);tiller.position.set(0,.71,-.87);tiller.rotation.x=-.32;group.add(tiller);
 box(group,0,1.1,-1,.42,.07,.07,rubber);
 group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 return {group,update(p){group.visible=p.visible!==false;group.position.set(p.position[0],0,p.position[1]);group.rotation.y=Math.atan2(p.direction[0],p.direction[1]);forks.position.y=Math.max(0,p.deckHeight-.05);},destroy(){group.removeFromParent();group.traverse(o=>o.geometry?.dispose());for(const m of [yellow,metal,rubber])m.dispose();}};
}
