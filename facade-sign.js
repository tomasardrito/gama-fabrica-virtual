const clamp=value=>Math.max(0,Math.min(1,value));

// Stateless lighting: reverse seeks and paused frames reproduce the same three
// fluorescent-start dips. The printed/raised artwork never fades to blank.
export function facadeSignState(s,cine) {
 const time=s.film?.presentationTime??s.elapsed??0;
 const windows=s.film?.story?.windows;
 const openingEnd=windows?.opening?.[1]??25,closingStart=windows?.closing?.[0]??565;
 const closing=time>=closingStart;
 const visible=s.mode==='dbr'&&(time<openingEnd||closing);
 const signal=clamp(cine?.sign??0),night=1-clamp(cine?.day??1);
 let flicker=1;
 if(!closing)for(const center of [.2,.46,.73])flicker*=1-.65*Math.max(0,1-Math.abs(signal-center)/.045);
 return {visible,power:visible?signal*flicker:0,night};
}

export function createFacadeSign({THREE,software=false,createCanvas=()=>document.createElement('canvas')}) {
 const group=new THREE.Group();group.name='gama-facade-sign';
 const cube=new THREE.BoxGeometry(1,1,1),emitters=[],washers=[],glows=[];
 const brand={background:0x203942,gold:0xe0c17b,cream:0xf5f2df};
 const finish=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.12,...options});
 function add(name,geometry,material,x,y,z,layer=4) {
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.position.set(x,y,z);
  mesh.userData.softwareLayer=layer;group.add(mesh);return mesh;
 }
 function box(name,x,y,z,w,h,d,material) {
  const mesh=add(name,cube,material,x,y,z);mesh.scale.set(w,h,d);mesh.receiveShadow=true;return mesh;
 }
 const frameMat=finish(brand.gold,{metalness:.35}),bodyMat=finish(brand.background);
 box('facade-sign-frame',0,4,14.65,8.84,1.2,.16,frameMat);
 box('facade-sign-backing',0,4,14.73,8.72,1.09,.075,bodyMat);
 // The old fascia ends at z=14.55. All artwork sits in front of it, under
 // the roof/eave, with depth testing enabled and no camera-facing rotation.

 // A single atlas holds the glyphs (top) and a soft elliptical halo (bottom).
 // Reuse this CanvasTexture for both diffuse/emissive artwork and light spill.
 const canvas=createCanvas();canvas.width=2048;canvas.height=512;
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,2048,512);
 // Same G symbol geometry as film-branding.js, without importing/changing it.
 ctx.save();ctx.translate(65,19);ctx.scale(.92,.92);
 ctx.fillStyle='#e0c17b';ctx.fillRect(24,210,190,24);
 ctx.strokeStyle='#f5f2df';ctx.lineWidth=16;ctx.beginPath();ctx.arc(118,119,65,.22*Math.PI,1.8*Math.PI);ctx.stroke();
 ctx.beginPath();ctx.moveTo(120,122);ctx.lineTo(186,122);ctx.lineTo(186,158);ctx.stroke();ctx.restore();
 ctx.fillStyle='#e0c17b';ctx.fillRect(332,35,3,188);
 function text(value,font,y,width) {
  ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f5f2df';
  ctx.save();ctx.translate(1210,y);ctx.scale(Math.min(1.9,width/ctx.measureText(value).width),1);ctx.fillText(value,0,0);ctx.restore();
 }
 text('GAMA','900 176px Arial, sans-serif',96,1250);
 text('COMPRESSORES AUTOMOTIVOS','700 76px Arial, sans-serif',216,1500);
 ctx.save();ctx.translate(1024,384);ctx.scale(8,1);
 const gradient=ctx.createRadialGradient(0,0,0,0,0,128);
 gradient.addColorStop(0,'rgba(255,255,255,.85)');gradient.addColorStop(.48,'rgba(255,255,255,.4)');gradient.addColorStop(1,'rgba(255,255,255,0)');
 ctx.fillStyle=gradient;ctx.fillRect(-128,-128,256,256);ctx.restore();
 const atlas=new THREE.CanvasTexture(canvas);atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;
 function plane(width,height,lower=false) {
  const geometry=new THREE.PlaneGeometry(width,height),uv=geometry.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*.5+(lower?0:.5));
  uv.needsUpdate=true;return geometry;
 }
 const letters=finish(0xffffff,{map:atlas,emissiveMap:atlas,emissive:brand.cream,emissiveIntensity:0,
  transparent:true,alphaTest:.04,depthWrite:false,metalness:0});
 const face=add('facade-sign-face',plane(8.45,1.06),letters,0,4,14.805,5);face.renderOrder=5;emitters.push(letters);

 // Canvas 2D fallback cannot texture meshes. Trace horizontal pixel runs from
 // the SAME atlas into two fixed meshes, so even that renderer keeps the sign
 // attached to the wall instead of falling back to a billboard or blank panel.
 if(software){
  face.visible=false;
  const pixels=ctx.getImageData(0,0,2048,256).data,runs=[[],[]],step=4;
  const ink=(x,y)=>{const p=(y*2048+x)*4;return pixels[p+3]<96?-1:pixels[p+2]<180?1:0;};
  for(let y=0;y<256;y+=step)for(let x=0;x<2048;){
   const color=ink(x,y);if(color<0){x+=step;continue;}
   const start=x;while(x<2048&&ink(x,y)===color)x+=step;
   const left=(start/2048-.5)*8.45,right=(x/2048-.5)*8.45,top=4+(.5-y/256)*1.06,bottom=4+(.5-(y+step)/256)*1.06,z=14.805;
   runs[color].push(left,bottom,z,right,bottom,z,right,top,z,left,bottom,z,right,top,z,left,top,z);
  }
  runs.forEach((vertices,i)=>{
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
   const color=i?brand.gold:brand.cream,mat=finish(color,{emissive:color,emissiveIntensity:0,metalness:0});
   add(`facade-sign-raised-${i}`,geometry,mat,0,0,0,5);emitters.push(mat);
  });
 }
 function glow(name,x,y,z,w,h,strength) {
  if(software){
   // Nested translucent rims approximate the same feathered light spill.
   for(let i=0;i<5;i++){
    const mat=new THREE.MeshBasicMaterial({color:brand.gold,transparent:true,opacity:0,depthWrite:false});
    const m=add(name,new THREE.PlaneGeometry(w-i*.15,h-i*.08),mat,x,y,z+i*.001);
    glows.push({mesh:m,material:mat,strength:strength*.13});
   }
   return;
  }
  const mat=new THREE.MeshBasicMaterial({color:0xffdda2,map:atlas,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const m=add(name,plane(w,h,true),mat,x,y,z);m.renderOrder=2;
  glows.push({mesh:m,material:mat,strength});
 }
 glow('facade-sign-halo',0,4,14.57,10.3,1.9,.26);
 const fixtureMat=finish(0x42616a,{metalness:.4});
 const diffuserMat=finish(brand.cream,{emissive:0xffd68c,emissiveIntensity:0});
 for(const x of [-2.8,2.8]){
  box('washer-bracket',x,4.71,14.72,.075,.075,.38,fixtureMat);
  const housing=box('washer-housing',x,4.71,14.9,.54,.12,.16,fixtureMat);housing.rotation.x=.35;
  const lens=box('washer-lens',x,4.647,14.921,.44,.018,.13,diffuserMat);lens.rotation.x=.35;
  const light=new THREE.SpotLight(0xffdfaa,0,7,.82,.9,2);light.name='facade-wall-washer';light.position.set(x,4.64,14.96);
  light.target.position.set(x,2.45,14.3);group.add(light,light.target);washers.push(light);
  glow('facade-wall-wash',x,3.13,14.568,4.8,3.35,.17);
 }
 const ledMat=finish(brand.cream,{emissive:brand.gold,emissiveIntensity:0});
 box('facade-underlight',0,3.415,14.785,8.4,.022,.035,ledMat);
 glow('facade-led-spill',0,3.4,14.576,9.8,.45,.2);

 function update(s,cine) {
  const {visible,power,night}=facadeSignState(s,cine);group.visible=visible;
  for(const mat of emitters)mat.emissiveIntensity=power*(.16+night*1.9);
  diffuserMat.emissiveIntensity=power*(.18+night*2);ledMat.emissiveIntensity=power*(.25+night*2.8);
  for(const light of washers){light.intensity=power*(.6+night*42);light.visible=visible&&power>.001;}
  for(const {mesh,material,strength}of glows){material.opacity=power*strength*(.025+night*.975);mesh.visible=visible&&material.opacity>.001;}
 }
 return {group,update};
}
