import * as THREE from './vendor/three.module.js';
import {INTERNAL_LAYOUT} from './internal-layout.js';
import {createInternalCart} from './internal-cart.js';
export function createInternalTransportScene({world}){
 const group=new THREE.Group();world.add(group);const carts=new Map();
 const material=new THREE.LineBasicMaterial({color:0xd3b559});
 for(const points of Object.values(INTERNAL_LAYOUT.bays))for(const [x,z]of points){const geometry=new THREE.BufferGeometry().setFromPoints([[-.6,-.6],[.6,-.6],[.6,.6],[-.6,.6],[-.6,-.6]].map(([a,b])=>new THREE.Vector3(x+a,.015,z+b)));group.add(new THREE.Line(geometry,material));}
 return {update(snapshot,presentation){const poses=presentation?.carriers||[];for(const c of carts.values())c.group.visible=false;for(const pose of poses){let c=carts.get(pose.id);if(!c){c=createInternalCart();group.add(c.group);carts.set(pose.id,c);}c.update(pose);}},destroy(){for(const c of carts.values())c.destroy();group.traverse(o=>o.geometry?.dispose());material.dispose();group.removeFromParent();}};
}
