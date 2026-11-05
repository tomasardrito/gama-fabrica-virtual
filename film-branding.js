import * as THREE from './vendor/three.module.js';
// Shared vector-drawn mark: also supplied to logistics through its optional callback.
export function makeBrand({text='GAMA',width=6}={}){
 const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=256;const ctx=canvas.getContext('2d');
 ctx.fillStyle='#203942';ctx.beginPath();ctx.roundRect(0,8,1536,240,24);ctx.fill();
 ctx.fillStyle='#e0c17b';ctx.fillRect(24,210,190,24);ctx.strokeStyle='#eef4ea';ctx.lineWidth=16;ctx.beginPath();ctx.arc(118,119,65,.22*Math.PI,1.8*Math.PI);ctx.stroke();ctx.beginPath();ctx.moveTo(120,122);ctx.lineTo(186,122);ctx.lineTo(186,158);ctx.stroke();
 ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#f5f2df';ctx.font='bold 125px Arial';ctx.fillText(text,260,134,1220);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true}));sprite.scale.set(width,width/6,1);sprite.name='gama-brand';return sprite;
}
