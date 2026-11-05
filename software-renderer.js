import * as THREE from './vendor/three.module.js';

// Compatibility renderer for browsers without a WebGL context. It projects the
// existing Three.js scene: geometry, camera, picking and simulation stay shared.
export class SoftwareRenderer {
 constructor(){
  this.domElement=document.createElement('canvas');
  this.context=this.domElement.getContext('2d',{alpha:false});
  if(!this.context)throw new Error('Canvas 2D indisponível');
  this.shadowMap={enabled:false,type:null};
  this.width=1;this.height=1;this.lastDraw=-Infinity;
  this.viewProjection=new THREE.Matrix4();this.modelProjection=new THREE.Matrix4();
  this.normalMatrix=new THREE.Matrix3();
  this.light=new THREE.Vector3(-.36,.78,.48).normalize();
  this.isSoftwareRenderer=true;
 }
 setPixelRatio(){}
 setSize(w,h){this.width=Math.round(w);this.height=Math.round(h);this.domElement.width=this.width;this.domElement.height=this.height;this.lastDraw=-Infinity;}
 dispose(){this.domElement.width=1;this.domElement.height=1;}
 render(scene,camera){
  const now=performance.now();if(now-this.lastDraw<100)return;this.lastDraw=now;
  const ctx=this.context,W=this.width,H=this.height;if(W<2||H<2)return;
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  ctx.fillStyle=scene.background?.isColor?scene.background.getStyle():'#e7eceb';ctx.fillRect(0,0,W,H);
  const drawables=[];const vw=this.viewProjection.elements;const light=this.light;
  const cameraScaleX=W/(camera.right-camera.left),cameraScaleY=H/(camera.top-camera.bottom);
  scene.traverseVisible(obj=>{
   if(obj.isSprite){
    const mat=obj.material;if(!mat||mat.visible===false||mat.opacity<=0)return;
    const canvas=mat.map?.image;if(!canvas)return;
    const wm=obj.matrixWorld.elements;const px=wm[12],py=wm[13],pz=wm[14];
    const iw=1/(vw[3]*px+vw[7]*py+vw[11]*pz+vw[15]);
    const x=(vw[0]*px+vw[4]*py+vw[8]*pz+vw[12])*iw,y=(vw[1]*px+vw[5]*py+vw[9]*pz+vw[13])*iw,z=(vw[2]*px+vw[6]*py+vw[10]*pz+vw[14])*iw;
    const sw=Math.hypot(wm[0],wm[1],wm[2])*cameraScaleX,sh=Math.hypot(wm[4],wm[5],wm[6])*cameraScaleY;
    if(z< -1||z>1||x*W/2>W+sw||x*W/2< -W-sw)return;
    drawables.push({kind:'sprite',image:canvas,x:(x+1)*W/2-sw/2,y:(1-y)*H/2-sh/2,w:sw,h:sh,z:z-.00003,alpha:mat.opacity,layer:obj.userData.softwareLayer??2});return;
   }
   if(obj.isLine&&obj.geometry?.attributes?.position){
    const p=obj.geometry.attributes.position,mat=obj.material;if(!mat||mat.visible===false)return;
    this.modelProjection.multiplyMatrices(this.viewProjection,obj.matrixWorld);const m=this.modelProjection.elements;
    const point=i=>{const px=p.getX(i),py=p.getY(i),pz=p.getZ(i),iw=1/(m[3]*px+m[7]*py+m[11]*pz+m[15]);return [((m[0]*px+m[4]*py+m[8]*pz+m[12])*iw+1)*W/2,(1-(m[1]*px+m[5]*py+m[9]*pz+m[13])*iw)*H/2,(m[2]*px+m[6]*py+m[10]*pz+m[14])*iw];};
    for(let i=0;i<p.count-1;i+=(obj.isLineSegments?2:1)){const a=point(i),b=point(i+1);drawables.push({kind:'line',ax:a[0],ay:a[1],bx:b[0],by:b[1],z:(a[2]+b[2])/2,color:mat.color.getStyle(),alpha:mat.opacity,dashed:mat.isLineDashedMaterial,layer:0,groundY:.1});}return;
   }
   if(!obj.isMesh||!obj.geometry?.attributes?.position)return;
   const geometry=obj.geometry,position=geometry.attributes.position,index=geometry.index;
   const mats=Array.isArray(obj.material)?obj.material:[obj.material];
   if(!mats.length||mats.every(m=>!m||m.visible===false||m.opacity<=0))return;
   this.modelProjection.multiplyMatrices(this.viewProjection,obj.matrixWorld);
   this.normalMatrix.getNormalMatrix(obj.matrixWorld);
   const m=this.modelProjection.elements,nm=this.normalMatrix.elements;
   const vertexCount=position.count;
   const projected=new Float32Array(vertexCount*3);
   let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity,minz=Infinity,maxz=-Infinity;
   for(let i=0;i<vertexCount;i++){
    const px=position.getX(i),py=position.getY(i),pz=position.getZ(i);
    const iw=1/(m[3]*px+m[7]*py+m[11]*pz+m[15]);
    const x=((m[0]*px+m[4]*py+m[8]*pz+m[12])*iw+1)*W/2;
    const y=(1-(m[1]*px+m[5]*py+m[9]*pz+m[13])*iw)*H/2;
    const z=(m[2]*px+m[6]*py+m[10]*pz+m[14])*iw;
    projected[i*3]=x;projected[i*3+1]=y;projected[i*3+2]=z;
    minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);minz=Math.min(minz,z);maxz=Math.max(maxz,z);
   }
   if(maxx< -2||minx>W+2||maxy< -2||miny>H+2||minz>1||maxz< -1)return;
   // Large architectural surfaces cannot use average triangle depth: a single
   // floor triangle spans the whole room and would paint over nearby machines.
   // Draw the ground and rear structural shell as an architectural underlay.
   if(!geometry.boundingBox)geometry.computeBoundingBox();
   const bounds=geometry.boundingBox;
   const size=new THREE.Vector3();bounds.getSize(size);
   const worldBounds=bounds.clone().applyMatrix4(obj.matrixWorld);
   const ground=worldBounds.max.y<=.21;
   const structural=Math.max(size.x,size.z)>20;
   const layer=obj.userData.softwareLayer??((ground||structural)?0:1);
   const groundY=ground?worldBounds.max.y:-.5;
   const count=index?index.count:vertexCount;const groups=geometry.groups;
   for(let i=0;i<count;i+=3){
    let mat=mats[0];if(mats.length>1){const group=groups.find(g=>i>=g.start&&i<g.start+g.count);mat=mats[group?.materialIndex||0];}
    if(!mat||mat.visible===false||mat.opacity<=0)continue;
    const ai=index?index.getX(i):i,bi=index?index.getX(i+1):i+1,ci=index?index.getX(i+2):i+2;
    const a=ai*3,b=bi*3,c=ci*3;
    const ax=projected[a],ay=projected[a+1],bx=projected[b],by=projected[b+1],cx=projected[c],cy=projected[c+1];
    const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    if(Math.abs(area)<.08)continue;
    if(mat.side===THREE.FrontSide&&area>0||mat.side===THREE.BackSide&&area<0)continue;
    if(Math.max(ax,bx,cx)<0||Math.min(ax,bx,cx)>W||Math.max(ay,by,cy)<0||Math.min(ay,by,cy)>H)continue;
    const abx=position.getX(bi)-position.getX(ai),aby=position.getY(bi)-position.getY(ai),abz=position.getZ(bi)-position.getZ(ai);
    const acx=position.getX(ci)-position.getX(ai),acy=position.getY(ci)-position.getY(ai),acz=position.getZ(ci)-position.getZ(ai);
    const nx=aby*acz-abz*acy,ny=abz*acx-abx*acz,nz=abx*acy-aby*acx;
    let wx=nm[0]*nx+nm[3]*ny+nm[6]*nz,wy=nm[1]*nx+nm[4]*ny+nm[7]*nz,wz=nm[2]*nx+nm[5]*ny+nm[8]*nz;
    const norm=Math.hypot(wx,wy,wz)||1;wx/=norm;wy/=norm;wz/=norm;
    if(area>0){wx=-wx;wy=-wy;wz=-wz;}
    const intensity=(mat.isMeshBasicMaterial?1:.65+.34*Math.max(0,wx*light.x+wy*light.y+wz*light.z))*(this.exposureFactor??1);
    const color=mat.color||new THREE.Color(0xffffff),em=mat.emissive,ei=mat.emissiveIntensity||0;
    let r=Math.min(1,color.r*intensity+(em?.r||0)*ei*.3),g=Math.min(1,color.g*intensity+(em?.g||0)*ei*.3),bb=Math.min(1,color.b*intensity+(em?.b||0)*ei*.3);
    const gamma=v=>v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055;
    const css=`rgb(${Math.round(gamma(r)*255)},${Math.round(gamma(g)*255)},${Math.round(gamma(bb)*255)})`;
    drawables.push({kind:'tri',ax,ay,bx,by,cx,cy,z:(projected[a+2]+projected[b+2]+projected[c+2])/3,color:css,alpha:mat.transparent?mat.opacity:1,layer,groundY});
   }
  });
  drawables.sort((a,b)=>{
   if(a.layer!==b.layer)return a.layer-b.layer;
   if(a.layer===0&&Math.abs((a.groundY||0)-(b.groundY||0))>.001)return (a.groundY||0)-(b.groundY||0);
   return b.z-a.z;
  });
  ctx.lineJoin='round';ctx.lineWidth=.45;
  for(const d of drawables){ctx.globalAlpha=d.alpha;if(d.kind==='line'){ctx.strokeStyle=d.color;ctx.lineWidth=1.25;ctx.setLineDash(d.dashed?[5,3]:[]);ctx.beginPath();ctx.moveTo(d.ax,d.ay);ctx.lineTo(d.bx,d.by);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=.45;continue;}if(d.kind==='sprite'){ctx.drawImage(d.image,d.x,d.y,d.w,d.h);continue;}ctx.fillStyle=d.color;ctx.beginPath();ctx.moveTo(d.ax,d.ay);ctx.lineTo(d.bx,d.by);ctx.lineTo(d.cx,d.cy);ctx.closePath();ctx.fill();if(d.alpha>.98){ctx.strokeStyle=d.color;ctx.stroke();}}
  ctx.globalAlpha=1;
 }
}
