// Decorative exterior only. All coordinates are metres; transport geometry,
// schedules and the createExterior({world,THREE,box}) contract stay unchanged.
export function createExterior({world,THREE,box}) {
 const group=new THREE.Group();group.name='exterior';world.add(group);
 const part=name=>{const g=new THREE.Group();g.name=`exterior-${name}`;group.add(g);return g;};
 const road=part('road'),apron=part('apron'),campus=part('campus');
 const roof=part('roof'),envelope=part('envelope'),front=part('front');
 const palette={asphalt:0x424f56,shoulder:0x59666a,concrete:0xb8c3bf,curb:0xd3d9cf,
  paint:0xf0ead3,yellow:0xe1b956,green:0x739b8c,grass:0x839b78,soil:0x687361,
  steel:0x42616a,metal:0x8fa6ab,wall:0xcbd5cf,glass:0x729aa6,dark:0x2b414a};
 const materials=new Map(),unitBox=new THREE.BoxGeometry(1,1,1);
 const cylinder=new THREE.CylinderGeometry(1,1,1,10),foliage=new THREE.IcosahedronGeometry(1,0);
 const circle=new THREE.CircleGeometry(1,24),fans=[],nightMaterials=[],pools=[],lights=[];
 const fadingMaterials=new Set(),fadingMeshes=[];
 const canvas=typeof document==='undefined'?null:document.querySelector('canvas[aria-label^="Maquete 3D"]');
 // The project's Canvas 2D renderer has no instancing support. Reuse the same
 // geometry/material in that fallback; WebGL batches repeated pieces normally.
 const useInstances=!canvas||!canvas.getContext('2d');
 const fading=parent=>parent===roof||parent===envelope;
 function material(color,parent,extra={}) {
  const fade=fading(parent),key=`${color}:${fade}:${JSON.stringify(extra)}`;
  if(!materials.has(key)){
   const m=new THREE.MeshStandardMaterial({color,roughness:.66,metalness:.08,...extra,
    ...(fade?{transparent:true,depthWrite:false}:{} )});
   materials.set(key,m);if(fade)fadingMaterials.add(m);
  }
  return materials.get(key);
 }
 function mesh(parent,name,geometry,mat,x,y,z,w=1,h=1,d=1) {
  const m=new THREE.Mesh(geometry,mat);m.name=name;m.position.set(x,y,z);m.scale.set(w,h,d);
  m.castShadow=h>.08;m.receiveShadow=true;parent.add(m);
  if(fading(parent)){m.userData.softwareLayer=3;fadingMeshes.push(m);}
  return m;
 }
 function block(parent,name,x,y,z,w,h,d,color,extra={}) {
  return mesh(parent,name,unitBox,material(color,parent,extra),x,y,z,w,h,d);
 }
 function batch(parent,name,entries,color,geometry=unitBox,extra={}) {
  if(!entries.length)return;
  const mat=material(color,parent,extra);
  if(!useInstances){
   for(const [x,y,z,w,h,d,yaw=0]of entries){const m=mesh(parent,name,geometry,mat,x,y,z,w,h,d);m.rotation.y=yaw;}
   return;
  }
  const m=new THREE.InstancedMesh(geometry,mat,entries.length),pose=new THREE.Object3D();m.name=name;
  entries.forEach(([x,y,z,w,h,d,yaw=0],i)=>{
   pose.position.set(x,y,z);pose.scale.set(w,h,d);pose.rotation.set(0,yaw,0);pose.updateMatrix();m.setMatrixAt(i,pose.matrix);
  });
  m.instanceMatrix.needsUpdate=true;m.computeBoundingBox();m.computeBoundingSphere();
  m.castShadow=entries.some(e=>e[4]>.08);m.receiveShadow=true;parent.add(m);
  if(fading(parent)){m.userData.softwareLayer=3;fadingMeshes.push(m);}
  return m;
 }
 function paint(parent,name,x,z,w,d,color=palette.paint,yaw=0) {
  const m=block(parent,name,x,.036,z,w,.008,d,color);m.rotation.y=yaw;m.castShadow=false;return m;
 }
 function label(parent,text,x,z,w,h,yaw=0) {
  // Small, local canvas plates; no fonts, images or network requests to load.
  const options={transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1};
  if(typeof document!=='undefined'){
   const c=document.createElement('canvas');c.width=512;c.height=96;
   const ctx=c.getContext('2d');ctx.fillStyle='#f0ead3';ctx.font='700 58px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,49,495);
   const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;options.map=map;
  }
  const mat=new THREE.MeshStandardMaterial({color:palette.paint,roughness:.8,...options});
  const m=mesh(parent,`road-label:${text}`,new THREE.PlaneGeometry(w,h),mat,x,.045,z);
  m.rotation.set(-Math.PI/2,0,yaw);m.castShadow=false;return m;
 }
 function arrow(parent,x,z,yaw=0,name='painted-arrow') {
  const g=new THREE.Group();g.name=name;g.position.set(x,0,z);g.rotation.y=yaw;parent.add(g);
  paint(g,'direction-shaft',0,.55,.18,1.5);
  paint(g,'direction-head',-.3,-.1,.16,.9,palette.paint,-Math.PI/4);
  paint(g,'direction-head',.3,-.1,.16,.9,palette.paint,Math.PI/4);
 }

 // Replace only the old, top-level decorative ground meshes. Keep the slab
 // structure, ramps, dock deck, vehicles and their routes exactly where they are.
 const logistics=world.getObjectByName('gama-logistics');
 for(const o of logistics?.children||[]){
  if(!o.isMesh||!o.geometry)continue;
  o.updateMatrix();o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrix);
  const within=(x0,x1,z0,z1)=>b.min.x>=x0-.01&&b.max.x<=x1+.01&&b.min.z>=z0-.01&&b.max.z<=z1+.01;
  const roadSurface=within(-50,70,35,70)&&b.max.y<=.071&&b.min.y>=-.23;
  const apronSurface=(within(-24,30,14.5,35)||within(22.2,29,-16,14.5))&&b.max.y<=.03&&b.min.y>=-.08;
  if(roadSurface||apronSurface)o.visible=false;
 }

 // Street: a single unobstructed manoeuvring surface with flush markings.
 // Kerbs, drains and the opposite sidewalk sit OUTSIDE z=35..70.
 block(road,'truck-street',10,-.105,52.5,120,.23,35,palette.asphalt);
 block(road,'street-edge',10,.016,68.8,120,.008,2.4,palette.shoulder);
 paint(road,'outer-edge-line',10,69.6,120,.13);
 batch(road,'lane-dashes',Array.from({length:19},(_,i)=>-46+i*6).filter(x=>x<2||x>22).map(x=>[x,.036,54,3,.008,.13]),palette.paint);
 batch(road,'dock-reversing-guides',[7,16].flatMap(x=>Array.from({length:5},(_,i)=>[x,.036,36.5+i*3, .12,.008,1.4])),palette.yellow);
 // The holding bay keeps its established x=30,z=40 location.
 paint(road,'holding-bay',30,40,10,3.2,palette.shoulder);
 for(const z of [38.3,41.7])paint(road,'holding-outline',30,z,10,.12,palette.yellow);
 paint(road,'holding-stop',24.8,40,.16,3.4,palette.paint);
 label(road,'ESPERA',30,40,5.3,.85);
 label(road,'ENTRADA',48,43,6.4,1.05);label(road,'SAÍDA',11.5,62.5,5.8,1.05);
 for(const x of [39,58])arrow(road,x,40,Math.PI/2,'street-entry-arrow');
 for(const x of [7,16])for(const z of [49,58])arrow(road,x,z,Math.PI,'street-exit-arrow');
 // Side street brings visitors to the west car park without occupying the
 // truck street. Its mouth at z=35 has no curb across it.
 block(campus,'visitor-street',-45,-.105,3,7,.23,64,palette.asphalt);
 batch(campus,'visitor-dashes',Array.from({length:10},(_,i)=>[-45,.036,-24+i*6,.1,.008,2.6]),palette.paint);
 block(campus,'far-sidewalk',10,.06,71.75,120,.12,3.1,palette.curb);
 block(campus,'far-curb',10,.09,70.2,120,.18,.25,palette.concrete);
 batch(campus,'road-drains',Array.from({length:15},(_,i)=>[-46+i*8,.187,70.2,.8,.008,.18]),palette.dark);
 batch(campus,'sidewalk-joints',Array.from({length:31},(_,i)=>[-50+i*4,.123,71.8,.018,.006,2.8]),palette.concrete);
 block(campus,'east-street-verge',50,-.055,33,40,.1,3.5,palette.grass);
 block(campus,'east-street-curb',50,.08,34.8,40,.16,.2,palette.curb);
 batch(campus,'east-drain-grates',Array.from({length:8},(_,i)=>[32+i*5,.168,34.8,.7,.008,.16]),palette.dark);

 // Loading apron: larger concrete panels and a flush pedestrian route. The
 // raised loading platform/ramp are left intact in the logistics scene.
 block(apron,'loading-apron',3,.009,24.75,54,.022,20.5,palette.concrete);
 block(apron,'east-apron',25.6,.009,-.75,6.7,.022,30.5,palette.concrete);
 batch(apron,'apron-expansion-joints',[
  ...Array.from({length:9},(_,i)=>[-21+i*6,.024,24.75,.018,.008,20.4]),
  ...[16,20,28,32].map(z=>[3,.024,z,54,.008,.018]),
  ...[-12,-6,0,6,12].map(z=>[25.6,.024,z,6.7,.008,.018]),
 ],0x97a7a5);
 paint(apron,'walkway-west',-19,18.4,10,1.7,palette.green);
 paint(apron,'walkway-entry',-13,16.75,2,4.9,palette.green);
 paint(apron,'walkway-connection',-14.4,18.4,1.3,1.7,palette.green);
 batch(apron,'walkway-edge',[-1,1].map(side=>[-19,.04,18.4+side*.79,10,.008,.06]),palette.paint);
 batch(apron,'pedestrian-crossing',Array.from({length:6},(_,i)=>[-22.5+i*.45,.04,16.4,.22,.008,1.5]),palette.paint);
 paint(apron,'dock-apron-edge',9.25,34.65,39.5,.14,palette.yellow);
 batch(apron,'dock-edge-hatching',Array.from({length:38},(_,i)=>[-9.7+i*1.02,.036,34.25,.12,.008,.5,-Math.PI/4]),palette.yellow);
 // Short flush drain grilles near the outer apron edges, away from the ramp.
 batch(apron,'apron-drains',[-21,27.5].flatMap(x=>[17,28,33].map(z=>[x,.032,z,.5,.008,.8])),palette.steel);

 // A landscaped west edge and rear garden frame the factory. No tall objects
 // are placed on the camera-facing east or south sides.
 block(campus,'west-verge',-31.8,-.055,-3,19,.1,38,palette.grass);
 block(campus,'rear-verge',0,-.055,-21.7,44,.1,11.2,palette.grass);
 block(campus,'west-sidewalk',-23.6,.07,-.4,2.5,.14,30.8,palette.curb);
 block(campus,'rear-sidewalk',0,.07,-16.9,46,.14,1.8,palette.curb);
 batch(campus,'west-paving-joints',Array.from({length:15},(_,i)=>[-23.6,.144,-14+i*2,2.3,.008,.018]),palette.concrete);
 block(campus,'parking-surface',-32,.015,-1.3,13.4,.03,25.4,palette.shoulder);
 block(campus,'parking-drive',-40.1,.015,-1.1,3.9,.03,6.2,palette.shoulder);
 const bays=[-36.8,-33.6,-30.4,-27.2];
 batch(campus,'parking-lines',[-10.6,7.8].flatMap(z=>[-38.4,-35.2,-32,-28.8,-25.6].map(x=>[x,.04,z,.085,.008,5])),palette.paint);
 batch(campus,'parking-end-lines',[-13.1,10.3].map(z=>[-32,.04,z,12.8,.008,.1]),palette.paint);
 batch(campus,'parking-stops',[-12.5,9.7].flatMap(z=>bays.map(x=>[x,.115,z,1.7,.18,.22])),palette.curb);
 label(campus,'VISITANTES',-32,-1,7.3,1.1);arrow(campus,-36,-1,Math.PI/2);
 batch(campus,'parking-curbs',[
  [-32,.11,-14.2,13.8,.22,.24],[-32,.11,11.5,13.8,.22,.24],
  [-39,.11,-9,.24,.22,10],[-39,.11,7,.24,.22,9],
 ],palette.curb);

 function car(x,z,color,yaw=0) {
  const g=new THREE.Group();g.name='parked-car';g.position.set(x,0,z);g.rotation.y=yaw;campus.add(g);
  block(g,'car-body',0,.54,0,1.8,.48,4.1,color);
  block(g,'car-sill',0,.34,0,1.82,.12,3.55,palette.dark);
  block(g,'car-cabin',0,.99,.1,1.52,.52,2.05,palette.glass,{roughness:.35,metalness:.25});
  block(g,'car-roof',0,1.27,.13,1.58,.08,1.65,color);
  for(const side of [-1,1]){
   block(g,'window-pillar',side*.77,1,.12,.055,.52,.12,color);
   block(g,'headlight',side*.58,.57,-2.06,.44,.15,.035,0xf1e8be);
   block(g,'tail-light',side*.62,.57,2.06,.3,.14,.035,0xbc6a52);
   for(const dz of [-1.25,1.28]){
    const wheel=mesh(g,'car-wheel',cylinder,material(0x2c383d,g),side*.88,.34,dz,.32,.22,.32);wheel.rotation.z=Math.PI/2;
    const hub=mesh(g,'car-hub',cylinder,material(palette.metal,g),side*1.005,.34,dz,.16,.012,.16);hub.rotation.z=Math.PI/2;
   }
  }
 }
 car(-36.8,-10.4,0x91a5ac);car(-30.4,-10.4,0xd1cbb5);car(-33.6,7.7,0x5f8296,Math.PI);car(-27.2,7.7,0xb9755b,Math.PI);

 const trees=[[-40.2,-19,1.35],[-29,-20.8,1.55],[-18,-22.5,1.5],[-7,-22,1.3],[5,-22.8,1.55],[17,-22,1.4],[-40.3,9,1.25]];
 batch(campus,'tree-trunks',trees.map(([x,z,r])=>[x,1.3,z,.16,2.6,.16]),0x817461,cylinder);
 batch(campus,'tree-crowns',trees.map(([x,z,r],i)=>[x,3.35,z,r*1.25,r*1.35,r,i*.6]),0x608773,foliage,{flatShading:true});
 batch(campus,'tree-highlights',trees.map(([x,z,r],i)=>[x-.48,3.65,z-.22,r*.85,r*.95,r*.9,i]),0x87a27b,foliage,{flatShading:true});
 const beds=[[-20.3,21,2.7,2.4],[-18.3,27.5,5.5,1.8],[-31.5,-17,12,1.5]];
 for(const [x,z,w,d]of beds){
  block(campus,'plant-bed',x,.085,z,w,.17,d,palette.curb);
  block(campus,'plant-soil',x,.176,z,w-.22,.018,d-.22,palette.soil);
  const plants=Array.from({length:Math.max(3,Math.floor(w/.65))},(_,i)=>[x-w/2+.4+i*(w-.8)/Math.max(1,Math.floor(w/.65)-1),.3,z,.32,.17,.38,i]);
  batch(campus,'low-planting',plants,0x719576,foliage,{flatShading:true});
 }
 // Low rails stop before the visitor driveway; no fence crosses a route.
 batch(campus,'low-fence-posts',[-13,-10,-7,6,9,12].map(z=>[-40,.22,z,.08,.44,.08]),palette.steel);
 batch(campus,'low-fence-rails',[[-40,.35,-10,.06,.08,6],[-40,.35,9,.06,.08,6]],palette.metal);
 const booth=new THREE.Group();booth.position.set(-26.8,0,13.2);campus.add(booth);
 block(booth,'gatehouse-plinth',0,.13,0,2.7,.26,2.8,palette.concrete);
 block(booth,'gatehouse',0,1.35,0,2.4,2.5,2.4,palette.wall);
 block(booth,'gatehouse-window',0,1.65,1.22,1.85,.95,.04,palette.glass);
 block(booth,'gatehouse-side-window',-1.22,1.65,0,.04,.95,1.65,palette.glass);
 block(booth,'gatehouse-roof',0,2.71,0,2.85,.18,2.85,palette.steel);
 block(booth,'gatehouse-door',1.22,1.06,0,.04,1.96,.8,palette.steel);

 function lamp(x,z,lit=false) {
  block(campus,'lamp-base',x,.16,z,.48,.32,.48,palette.concrete);
  block(campus,'lamp-post',x,2.3,z,.11,4.6,.11,palette.steel);
  block(campus,'lamp-arm',x+.42,4.48,z,.95,.1,.12,palette.steel);
  block(campus,'lamp-housing',x+.85,4.44,z,.65,.14,.4,palette.dark);
  const bulb=block(campus,'lamp-diffuser',x+.85,4.355,z,.56,.025,.33,0xffe7b1,{emissive:0xffd793,emissiveIntensity:0});
  nightMaterials.push(bulb.material);
  const poolMat=new THREE.MeshStandardMaterial({color:0xffe8b7,emissive:0xffcf84,emissiveIntensity:.6,transparent:true,opacity:0,depthWrite:false,roughness:1});
  const pool=mesh(campus,'lamp-pool',circle,poolMat,x+.85,.049,z,2.4,2.4,1);pool.rotation.x=-Math.PI/2;pool.castShadow=false;pools.push(pool);
  if(lit){const light=new THREE.PointLight(0xffdfaa,0,12,2);light.position.set(x+.85,4.25,z);campus.add(light);lights.push({light,power:35});}
 }
 lamp(-25.2,-7,true);lamp(-25.2,10.7,true);lamp(-12,-19.4);lamp(14,-19.4);

 // Roof hardware disappears with the original roof; no floating fans or AC
 // boxes remain over the production floor after the opening reveal.
 batch(roof,'roof-flashing',[
  [0,5.18,-15.74,44.7,.22,.18],[0,5.18,14.74,44.7,.22,.18],
  [-22.3,5.18,-.5,.18,.22,30.5],[22.3,5.18,-.5,.18,.22,30.5],
 ],palette.metal);
 for(const x of [-13,0,13]){
  block(roof,'skylight-frame',x,5.23,-5.1,3.7,.18,7.3,palette.steel);
  block(roof,'skylight-glass',x,5.34,-5.1,3.42,.08,6.98,0x8eb7bb,{roughness:.35,metalness:.12});
  batch(roof,'skylight-mullions',[-8.5,-6.8,-5.1,-3.4,-1.7].map(z=>[x,5.4,z,3.5,.045,.075]),palette.wall);
  block(roof,'skylight-spine',x,5.4,-5.1,.07,.045,7.05,palette.wall);
 }
 for(const [i,x]of [-16,-5.5,5.5,16].entries()){
  block(roof,'exhaust-plinth',x,5.29,6,1.25,.28,1.25,palette.steel);
  mesh(roof,'exhaust-stack',cylinder,material(palette.metal,roof),x,5.63,6,.48,.5,.48);
  const fan=new THREE.Group();fan.name=`exterior-fan-${i}`;fan.position.set(x,5.94,6);roof.add(fan);fans.push(fan);
  // Keep the fading material ownership on the roof even for rotating children.
  for(let j=0;j<3;j++){
   const blade=mesh(fan,'exhaust-blade',unitBox,material(0xc5d1d0,roof),0,0,0,1.12,.055,.16);blade.rotation.y=j*Math.PI/3;blade.userData.softwareLayer=3;fadingMeshes.push(blade);
  }
  mesh(roof,'exhaust-cap',cylinder,material(palette.steel,roof),x,6.01,6,.17,.12,.17);
 }
 for(const x of [-18.3,-14.7]){
  block(roof,'condenser-foot',x,5.24,-11.9,2.8,.19,1.7,palette.steel);
  block(roof,'condenser',x,5.7,-11.9,2.5,.74,1.45,palette.wall);
  batch(roof,'condenser-grille',Array.from({length:7},(_,i)=>[x-1+i*.33,5.72,-11.16,.12,.5,.025]),palette.steel);
  mesh(roof,'condenser-fan',cylinder,material(palette.dark,roof),x,6.085,-11.9,.48,.035,.48);
 }

 // The complete external skin is visible only while the roof is closed.
 block(envelope,'east-wall',22.08,2.45,-.65,.18,4.9,29.5,palette.wall);
 block(envelope,'rear-upper-wall',0,4.08,-15.65,44,1.75,.18,palette.wall);
 block(envelope,'west-upper-wall',-22.15,3.55,-.65,.18,2.7,29.5,palette.wall);
 block(envelope,'front-shipping-wall',14.5,2.2,14.2,15,4.4,.25,palette.wall);
 batch(envelope,'wall-columns',[-21.5,-16.2,-9.8,-4.5,7,14.3,21.6].map(x=>[x,2.2,14.39,.22,4.4,.2]),palette.steel);
 batch(envelope,'facade-plinth',[[-19,.35,14.39,5.8,.7,.12],[-1.5,.35,14.39,16.8,.7,.12],[14.5,.35,14.39,14.8,.7,.12]],palette.steel);
 batch(envelope,'cladding-seams',[-21,-20,-19,-18,-17,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(x=>[x,2.25,14.345,.028,3.5,.035]),0xa0b4b5);
 batch(envelope,'side-columns',[-13,-7,-1,5,11].map(z=>[22.23,2.4,z,.19,4.8,.25]),palette.steel);
 batch(envelope,'rear-downpipes',[-20,-10,10,20].map(x=>[x,2.4,-15.82,.11,4.8,.11]),palette.metal);
 // A slim fascia carries the existing illuminated GAMA sign after the roof
 // reveals the interior. It vanishes outside the cinematic exterior shots.
 block(front,'facade-fascia',0,4.55,14.34,44.5,.65,.42,palette.steel);
 // The fixed brand panel, wall washers and LED belong to facade-sign.js.


 function update(s,cine) {
  const active=s.mode==='dbr'&&!!cine?.active;
  const leaving=active&&cine.closing&&Object.values(s.film?.actors||{}).some(a=>a.exitPhase!=='exited');
  const cover=active&&!leaving?Math.max(0,Math.min(1,cine.roof??0)):0;
  const day=active&&!leaving?Math.max(0,Math.min(1,cine.day??1)):1,night=1-day;
  roof.visible=envelope.visible=cover>.01;front.visible=active&&!leaving;
  for(const m of fadingMaterials){m.opacity=cover;m.depthWrite=cover>.99;}
  for(const m of fadingMeshes)m.castShadow=cover>.95;
  const time=Number(s.film?.presentationTime??s.elapsed)||0;
  fans.forEach((fan,i)=>{fan.rotation.y=(time*(1.35+i*.13)+i*.8)%(Math.PI*2);});
  for(const mat of nightMaterials)mat.emissiveIntensity=night*1.7;
  for(const pool of pools){pool.material.opacity=night*.12;pool.visible=night>.01;}
  for(const {light,power}of lights){light.intensity=power*night;light.visible=night>.01;}
 }
 return {group,update};
}
