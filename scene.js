import {scenarioPresentation} from './scenario-view.js';
import {createPhysicalSignage,makeFixedBrand} from './film-signage.js';
import {sampleInternalTransport} from './internal-motion.js';
import {createInternalCart} from './internal-cart.js';
import {withFilmDemonstration} from './film-actors.js';
import {createFilmCameraRig} from './camera-rig.js';
import {makeBrand} from './film-branding.js';
import {createMeetingRoom} from './meeting-room.js';
import {createFilmCast} from './film-cast.js';
import {createFactoryCinematic} from './factory-cinematic.js';
import {createLogisticsScene} from './logistics-scene.js';
import {LOGISTICS_LAYOUT} from './logistics-layout.js';
import {DBR_LAYOUT,DBR_BAYS,dbrWorkStand} from './dbr-layout.js';
import * as THREE from './vendor/three.module.js';
import { SoftwareRenderer } from './software-renderer.js';
import { TransportController, TRANSPORT_STOPS, STATION_HANDLING } from './transport-routes.js';
import { createWorkerRig, workerMissionPose } from './worker-rig.js';
import { createForklift } from './forklift.js';
import { createVisualProps, applyJourneyHandling, pinSpeakingOperators, finishedStageAppearance } from './film-visuals.js';
import { createExterior } from './exterior-scene.js';
import { cinematicState } from './factory-cinematic.js';
import * as TransportLayout from './transport-routes.js';
import { sampleMpsHandling } from './mps-handling.js';
import { createMPSVisuals, referencePresentation } from './mps-scene.js';
import { sampleDbrHandling, DBR_BUFFER_OPERATOR, DBR_HANDLING_BAYS } from './dbr-handling.js';

const COLORS = {torno:0x4e9be9, us1:0x6977d5, us2:0x37a6a5, stock:0xa4a99c, lap:0xaf74d8, rosq:0xe8a53a, buffer:0xeac958, m1:0x498dce, m2:0x31a58b, insp:0x79ab63, office:0x536878, dispatch:0xd77652};
const POS = { exterior:[0,10],overview:[0,-.5],office:[-13,7],torno:[-12,-7],us1:[-4,-7],us2:[4,-7],stock:[17.2,-7.2],lap:[STATION_HANDLING.lap.fixture[0]-1.25,STATION_HANDLING.lap.fixture[2]-.55],rosq:[5,0],buffer:[-3.3,0],m1:[-2,7],m2:[6,7],insp:[13,7],dispatch:[LOGISTICS_LAYOUT.dispatchBays.reduce((sum,p)=>sum+p[0],0)/LOGISTICS_LAYOUT.dispatchBays.length,LOGISTICS_LAYOUT.dispatchBays[0][1]],components:[-10,0] };
const NAMES = {torno:'01  TORNEARIA',us1:'02  USINAGEM 1',us2:'03  USINAGEM 2',stock:'CORPOS USINADOS',lap:'04  LAPIDAÇÃO',rosq:'05  ROSQUEADORA',buffer:'PULMÃO DO TAMBOR',m1:'06  MONTAGEM 1',m2:'07  MONTAGEM 2',insp:'08  INSPEÇÃO',office:'COMERCIAL & PCP',dispatch:'EXPEDIÇÃO',components:'COMPONENTES'};
const matCache = new Map();
function material(color, opts={}) { const key=String(color)+JSON.stringify(opts); if(!matCache.has(key))matCache.set(key,new THREE.MeshStandardMaterial({color,roughness:.52,metalness:.12,...opts})); return matCache.get(key); }

export function createAct2Demonstration(preparedDemonstration){
 if(!preparedDemonstration)return null;
 const {plan,sourceBay,sourceStart,sourceEnd}=preparedDemonstration;
 if(!plan?.missions?.length||!Number.isFinite(sourceStart)||!Number.isFinite(sourceEnd)||sourceEnd<=sourceStart)throw new Error('Invalid prepared demonstration');
 return {plan,sourceBay,sourceStart,sourceEnd,sample:sampleInternalTransport,createCart:createInternalCart};
}

export function createFactoryScene(container,{onSelect=()=>{},onInteract=()=>{},demonstration=null,signage='floating'}={}) {
 const createBrand=signage==='physical'?makeFixedBrand:makeBrand;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0xe7eceb);scene.fog=new THREE.Fog(0xe7eceb,80,170);
 let renderer;
 try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});} catch(e) {
  renderer=new SoftwareRenderer();
 }
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab';renderer.domElement.setAttribute('aria-label','Maquete 3D da fábrica GAMA. Arraste para girar e selecione um setor.');container.appendChild(renderer.domElement);
 const camera=new THREE.OrthographicCamera(-25,25,25,-25,.1,200);
 const filmCamera=createFilmCameraRig({camera});
 const ambient=new THREE.HemisphereLight(0xf6ffff,0x809496,2.6);scene.add(ambient);
 const sun=new THREE.DirectionalLight(0xfff5df,3.3);sun.position.set(-18,36,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-32,right:32,top:28,bottom:-28,near:1,far:100});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;scene.add(sun);
 const fill=new THREE.DirectionalLight(0xdbe8ff,1.25);fill.position.set(20,15,-20);scene.add(fill);
 const world=new THREE.Group();scene.add(world);const selectables=[];const floatingSigns=[];const sectorLabels=[];const sectorPads=new Map();const movers=[];const machineGroups=[];const bufferPallets=[];let currentSnapshot=null,clock=0,selected='overview',drag=false,lastX=0,lastY=0,downX=0,downY=0;
 let angle=.70,targetAngle=.70,span=64,targetSpan=64;const target=new THREE.Vector3(0,0,-.5),targetGoal=target.clone();
 function mark(obj,id){obj.userData.sector=id;selectables.push(obj);return obj;}
 function box(parent,x,y,z,w,h,d,color,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color,opts));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function housing(parent,x,y,z,w,h,d,color){const r=.09,shape=new THREE.Shape();shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const geom=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,curveSegments:2,steps:1});geom.translate(0,0,-d/2);const m=new THREE.Mesh(geom,material(color,{roughness:.46,metalness:.2}));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function cyl(parent,x,y,z,r,h,color,axis='y',segments=16){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),material(color,{metalness:.35}));m.position.set(x,y,z);if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function ball(parent,x,y,z,r,color){const m=new THREE.Mesh(new THREE.SphereGeometry(r,12,8),material(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
 function textSprite(text,w=6,color='#273e4a',background='#f7faf8',fontSize=82){const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(background){ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(0,8,1024,112,22);ctx.fill();}ctx.fillStyle=color;ctx.font=`700 ${Math.max(74,fontSize)}px Arial,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,65,975);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:true,transparent:true}));sp.scale.set(w,w/8,1);if(w>1)floatingSigns.push(sp);return sp;}
 function label(id,w=6,y=3.2){const [x,z]=POS[id];const sp=textSprite(NAMES[id],w,'#f2f6ef','#37515e');sp.position.set(x,y,z+2.2);world.add(sp);mark(sp,id);sp.userData.labelWidth=w;sectorLabels.push(sp);return sp;}
 function edgeLine(x,z,w,d,col=0xe7bb36){for(const sign of [-1,1]){box(world,x,.035,z+sign*d/2,w,.025,.07,col);box(world,x+sign*w/2,.035,z,.07,.025,d,col);}}
 function sector(id,w=7,d=5){const [x,z]=POS[id];const color=COLORS[id]||0x8494a0;const pad=box(world,x,.015,z,w,.05,d,color,{transparent:true,opacity:.19});mark(pad,id);sectorPads.set(id,pad);edgeLine(x,z,w,d,0xe9e8db);for(const dx of [-w/2,w/2])for(const dz of [-d/2,d/2]){box(world,x+dx,.066,z+dz,.1,.035,.6,0xf8f5e8);box(world,x+dx,.066,z+dz,.6,.035,.1,0xf8f5e8);}for(let dx=-w/2+.25;dx<w/2;dx+=.6)box(world,x+dx,.052,z+d/2-.13,.35,.016,.19,0xf1c648);label(id,w-.1);}
 function shadow(x,z,w,d){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0x405159,transparent:true,opacity:.09,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.034,z);world.add(m);}
 function arrow(x,z,rotation=0,color=0xf5f4eb){const g=new THREE.Group();g.position.set(x,.065,z);g.rotation.y=rotation;box(g,0,0,.12,.12,.025,.68,color);const shape=new THREE.Shape();shape.moveTo(-.28,0);shape.lineTo(.28,0);shape.lineTo(0,-.4);shape.closePath();const a=new THREE.Mesh(new THREE.ShapeGeometry(shape),material(color));a.rotation.x=-Math.PI/2;a.position.z=-.22;g.add(a);world.add(g);}
 // Cast concrete slab, expansion joints, and a separate loading apron.
 box(world,0,-.45,-.75,44.5,.9,30.5,0xc6cece);box(world,0,-.025,-.75,44,.09,30,0xaeb9ba);box(world,0,-.54,-.75,44.8,.12,30.9,0x8b999d);
 for(let x=-21;x<=21;x+=3)box(world,x,.023,-.75,.015,.008,29.5,0x97a5a7);for(let z=-14;z<=13;z+=3)box(world,0,.023,z,44,.008,.015,0x97a5a7);
 // Partial walls and roof beams preserve a readable cutaway.
 box(world,0,1.6,-15.5,44,.0+3.2,.25,0xe5e8e4);box(world,-22,1.1,-.75,.25,2.2,29.5,0xe4e8e4);
 for(let x=-20;x<=20;x+=4){box(world,x,2.05,-15.32,2.6,1.15,.06,0x76999e,{metalness:.2,roughness:.15});box(world,x,2.05,-15.27,.07,1.15,.04,0xf4f5ec);box(world,x,2.05,-15.26,2.6,.06,.04,0xf4f5ec);}
 for(const x of [-21,0,21]){box(world,x,2.1,-14.8,.32,4.2,.32,0xf0eee7);box(world,x,.5,-14.8,.42,1,.42,0xe8ba3e);}
 box(world,0,4.3,-14.8,43,.45,.55,0x637d87);
 // Structural services, segmented glazing and overhead lights on the rear wall.
 cyl(world,0,3.55,-15.05,.1,35.5,0x7a929b,'x');cyl(world,0,3.8,-15.05,.065,35.5,0xd5ad58,'x');
 for(let x=-20;x<=20;x+=4){box(world,x,3.25,-14.1,2.2,.12,.5,0x455e69);box(world,x,3.17,-14.1,2.05,.035,.35,0xf5efd9,{emissive:0xedd9ab,emissiveIntensity:.45});box(world,x,3.55,-14.45,.07,.6,.07,0x69838e);}
 for(let x=-16;x<=16;x+=8){box(world,x,.12,-14.4,1.5,.24,.6,0x647c83);box(world,x,1,-14.6,1.4,1.55,.3,0xd2d8d2);box(world,x,1.1,-14.41,.65,.8,.035,0xa8b8ba);ball(world,x+.45,1.1,-14.38,.045,0x4c6974);}
 // Separate, unobstructed traffic lanes. Bay outlines come from the same
 // geometry contract used to route the forklift and each station operator.
 for(const z of [-2.8,3.9,11.1]){box(world,0,.027,z,43,.009,2.1,0x899da0);for(const dz of [-1.05,1.05])box(world,0,.034,z+dz,43,.015,.065,0xe8c76a);for(let x=-20;x<21;x+=3)arrow(x,z,Math.PI/2,0xd5e0d9);}
 box(world,19.8,.028,1.35,2.1,.01,29.2,0x899da0);for(const dx of [-1.05,1.05])box(world,19.8+dx,.035,1.35,.065,.015,29.2,0xe8c76a);
 box(world,17.6,.027,-12.2,6.5,.009,2.1,0x899da0);for(const dz of [-1.05,1.05])box(world,17.6,.034,-12.2+dz,6.5,.015,.065,0xe8c76a);
 box(world,10.4,.03,-5.65,7.8,.014,.6,0x809f95);
 for(const z of [1.35,8.35]){box(world,4,.03,z,29,.014,.6,0x809f95);for(let x=-9;x<18;x+=2)box(world,x,.043,z,.34,.014,.045,0xe1ede1);}
 for(const [id,bays] of Object.entries(DBR_BAYS)){if(['truck','dispatch','lap','rosq','buffer','m1','m2','insp'].includes(id))continue;for(const [x,z] of bays){edgeLine(x,z,1.2,1.2,COLORS[id]||0xf1ce68);box(world,x,.04,z+.62,.36,.018,.065,0xf4f4e8);}}
 for(const [id,w,d] of [['torno',7,5],['us1',7,5],['us2',7,5],['stock',4.1,4.3],['lap',5.8,4.4],['rosq',6,5],['buffer',8.2,5.8],['m1',6,4.8],['m2',6,4.8],['insp',5.5,4.8]])sector(id,w,d);
 // Machine details share geometry language while retaining each operation's silhouette.
 function machine(id,x,z,type,index){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);const c=COLORS[id];mark(g,id);shadow(x,z,2.2,1.8);box(g,0,.16,0,1.85,.28,1.55,0x465d65);housing(g,0,.62,0,1.7,.72,1.38,c);box(g,0,1.02,0,1.85,.12,1.5,0xe4e7e2);const moving=new THREE.Group();g.add(moving);const part=new THREE.Group();g.add(part);
  if(type==='lathe'){
   box(g,-.67,1.45,0,.48,.76,1.25,c);box(g,.65,1.25,0,.24,.42,1.05,c);cyl(g,0,1.28,-.32,.055,1.3,0xc9d1d1,'x');cyl(g,0,1.28,.32,.055,1.3,0xc9d1d1,'x');moving.position.set(-.35,1.5,0);cyl(moving,0,0,0,.23,.72,0xc2cdd0,'x');for(let a=0;a<3;a++){const ang=a*Math.PI*2/3;box(moving,-.33,Math.cos(ang)*.15,Math.sin(ang)*.15,.12,.08,.12,0x4e6671);}box(part,.2,1.4,.27,.18,.15,.32,0x354f59);box(g,-.5,1.98,0,.1,.1,.1,0x75d6a1);
  } else if(type==='mill'){
   box(g,-.72,1.7,-.44,.28,1.4,.35,c);box(g,.72,1.7,-.44,.28,1.4,.35,c);box(g,0,2.3,-.4,1.7,.3,.7,c);box(g,0,1.6,-.63,1.6,1.1,.1,0x587480);box(g,0,1.2,0,1.2,.12,1,0xaebabc);moving.position.set(0,1.8,0);cyl(moving,0,0,0,.16,.6,0xc6d2d5);cyl(moving,0,-.4,0,.055,.3,0x4b6774);cyl(part,0,1.32,0,.2,.15,0xe1d8b4);
  } else if(type==='lap'){
   box(g,0,1.6,-.5,1.5,1,.25,c);cyl(g,0,1.15,.2,.69,.16,0x67828c);moving.position.set(0,1.28,.2);cyl(moving,0,0,0,.64,.1,0xc4ccd1);for(let a=0;a<4;a++)cyl(moving,Math.cos(a*Math.PI/2)*.27,.08,Math.sin(a*Math.PI/2)*.27,.11,.1,0xe4d4a1);box(g,0,1.9,-.12,.35,.3,.7,0xe3e7e4);box(part,0,1.55,.06,.17,.3,.17,0x547084);
  } else if(type==='thread'){
   box(g,-.55,1.65,-.28,.35,1.3,.4,c);box(g,0,2.25,-.25,1.45,.28,.55,c);moving.position.set(.2,1.8,.55);cyl(moving,0,0,0,.2,.6,0x6a808b);cyl(moving,0,-.4,0,.08,.35,0xe5e5db);cyl(part,.2,1.2,.55,.25,.22,0xc9d3d7);for(let n=0;n<5;n++)cyl(part,.2,1.12+n*.035,.55,.26,.012,0x718a92);
  } else if(type==='assembly'){
   box(g,0,1.1,-.45,1.7,.12,.3,0x354f5d);box(g,-.68,1.5,-.55,.07,.9,.07,0x708b96);box(g,.68,1.5,-.55,.07,.9,.07,0x708b96);box(g,0,1.95,-.55,1.5,.08,.1,0xd5e3e2);box(g,0,2.03,-.55,1.4,.04,.12,0xfdf5cd,{emissive:0xf3e3ae,emissiveIntensity:.3});for(let i=0;i<4;i++)box(g,-.57+i*.37,1.23,-.4,.28,.2,.28,i%2?0xd3a748:0x8aaebd);moving.position.set(.22,1.34,.55);compressor(moving,0,0,0,.6,id==='m2');box(g,-.53,1.4,.05,.11,.4,.12,0x3f5768);
  } else {
   box(g,-.7,1.6,0,.15,1.05,.3,0xe4eee9);box(g,.7,1.6,0,.15,1.05,.3,0xe4eee9);box(g,0,2.12,0,1.6,.15,.35,c);box(g,0,2.03,0,1.4,.03,.13,0x8be3d0,{emissive:0x3bbfa6,emissiveIntensity:.6});moving.position.set(0,1.27,.55);compressor(moving,0,0,0,.6,true);box(g,-.5,1.24,0,.15,.05,.6,0xe5bd41);
  }
  // Physical guards and service details distinguish the production equipment.
  let guard=null;
  if(['mill','lathe','thread'].includes(type)){
   guard=new THREE.Group();if(type==='thread')guard.position.z=.31;g.add(guard);
   box(guard,0,1.65,.58,type==='mill'?1.45:1.15,.8,.035,0x97c3c6,{transparent:true,opacity:.28,roughness:.1,metalness:.05});
   for(const x of [-.6,.6])box(guard,x,1.65,.59,.045,.84,.05,0x607d87);box(guard,0,2.07,.59,1.25,.045,.05,0x607d87);
   box(guard,.48,1.6,.63,.07,.24,.04,0x253f50);box(g,-.42,.65,.72,.65,.05,.035,0x325b70);
  }
  if(type==='lathe'){cyl(g,.35,1.23,.78,.15,.07,0x496776,'z');cyl(g,.35,1.23,.83,.06,.09,0xd2d8d2,'z');box(g,-.22,.28,.72,.48,.12,.07,0x99adb3);}
  if(type==='assembly'){box(g,.46,1.4,-.46,.55,.42,.055,0x78949d);for(let t=0;t<3;t++)box(g,.27+t*.16,1.43,-.42,.06,.24,.035,0xd7dfd6);cyl(g,-.56,1.7,-.34,.025,.45,0x3a555f);box(g,-.56,1.44,-.34,.11,.14,.12,0xd7b04e);}
  if(type==='inspection'){box(g,.72,1.5,-.15,.25,.42,.6,0xf2f2e6);box(g,.86,1.55,.18,.16,.25,.035,0x3b6a77);}
  const fixtureConfig=STATION_HANDLING[id];
  if(fixtureConfig&&index===fixtureConfig.machineIndex&&['thread','assembly','inspection'].includes(type)){
   const fx=fixtureConfig.fixture[0]-x,fz=fixtureConfig.fixture[2]-z,top=fixtureConfig.fixture[1];
   box(g,fx,1.045,.65,.9,.09,.46,0x6c8790);box(g,fx,(1.09+top)/2,fz,.64,Math.max(.03,top-1.09),.58,0x9aadb3);
   for(const dx of [-.28,.28])box(g,fx+dx,top+.035,fz,.055,.07,.45,0x4f7180);
  }
  // Control panel, emergency stop, status mast and lower vents.
  box(g,.81,1.41,.48,.24,.46,.36,0xf0eee3);box(g,.82,1.47,.68,.17,.2,.025,0x254b61,{emissive:0x2b6476,emissiveIntensity:.2});ball(g,.81,1.23,.68,.055,0xd76954);cyl(g,-.76,2.2,-.5,.035,.36,0x5b7280);const lamp=cyl(g,-.76,2.43,-.5,.075,.16,0x67bf92);for(let v=0;v<4;v++)box(g,-.45+v*.2,.65,.7,.11,.035,.015,0x496873);const sampleObjects=type==='lap'?moving.children.slice(1):['assembly','inspection'].includes(type)?[moving]:['thread','mill'].includes(type)?[part]:[];machineGroups.push({g,id,type,moving,part,lamp,index,guard,sampleObjects,baseY:moving.position.y});return g;
 }
 function compressor(parent,x,y,z,scale=1,finished=false){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);cyl(g,0,.25,0,.28,.5,finished?0x708b9b:0xb9c9c9);for(let i=0;i<4;i++)cyl(g,0,.12+i*.09,0,.33,.025,0x8ea5af);box(g,0,.54,0,.44,.1,.42,finished?0x3e6074:0xc1cccc);cyl(g,.29,.45,0,.07,.2,0xceb16d,'x');box(g,0,-.02,0,.65,.1,.56,0x526c7d);return g;}
 // Counts match the provisional dedicated personalized line from the workbook.
 for(let i=0;i<2;i++)machine('torno',-13.5+i*3,-7,'lathe',i);
 for(let i=0;i<4;i++)machine('us1',-5.5+(i%2)*2.7,-8.1+Math.floor(i/2)*2.4,'mill',i);
 for(let i=0;i<3;i++)machine('us2',2+i*2,-7,'mill',i);
 for(let i=0;i<2;i++)machine('lap',STATION_HANDLING.lap.fixture[0]+(i-1)*2.5,STATION_HANDLING.lap.fixture[2]-.55,'lap',i);
 for(let i=0;i<3;i++)machine('rosq',3+i*2,0,'thread',i);
 for(let i=0;i<3;i++)machine('m1',-4+i*2,7,'assembly',i);
 for(let i=0;i<3;i++)machine('m2',4+i*2,7,'assembly',i);
 for(let i=0;i<2;i++)machine('insp',11.7+i*2.5,7,'inspection',i);
 // Cell-side cabinets, safety islands and tangible inventory fixtures.
 for(const [x,z,c] of [[-15.4,-8.8,COLORS.torno],[-7.15,-8.8,COLORS.us1],[7.25,-8.8,COLORS.us2],[8.0,-8.65,COLORS.lap],[1.9,-1.3,COLORS.rosq],[1.7,7,COLORS.m1],[9.7,7,COLORS.m2]]){
  housing(world,x,.47,z,.63,.85,.72,c);for(let j=0;j<3;j++){box(world,x,.23+j*.22,z+.37,.54,.025,.025,0x385864);box(world,x,.29+j*.22,z+.4,.22,.025,.035,0xd5dfd9);}box(world,x,.93,z,.7,.07,.78,0x465f6a);
 }
 for(const [x,z] of [[10,-9.7],[16,-9.7]]){cyl(world,x,.42,z,.09,.84,0xe1ba51);cyl(world,x,.52,z,.094,.12,0x52646a);cyl(world,x,.18,z,.2,.12,0x586f76);}
 const drumSign=textSprite('TAMBOR  /  MONTAGEM 1',6.6,'#e9f5f2','#2d6380',78);drumSign.position.set(-2,3.2,5.1);world.add(drumSign);
 const bufferSign=textSprite('ESTOQUE DE PROTEÇÃO',5.6,'#51452a','#f0d68a',80);bufferSign.position.set(-2,2.3,-1.9);world.add(bufferSign);
 const bufferInventorySign=textSprite('PULMÃO  ·  0 un',5.6,'#51452a','#f0d68a',80);bufferInventorySign.position.set(-3.3,3.7,-1.9);bufferInventorySign.visible=false;world.add(bufferInventorySign);let bufferInventoryText='';
 function paintSprite(sp,text,color,background){const canvas=sp.material.map.image,ctx=canvas.getContext('2d');ctx.clearRect(0,0,1024,128);ctx.fillStyle=background;ctx.beginPath();ctx.roundRect(0,8,1024,112,22);ctx.fill();ctx.fillStyle=color;ctx.font='700 82px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,65,975);sp.material.map.needsUpdate=true;}
 function updateBufferSign(buffer){const units=Number(buffer?.units)||0,lots=Number(buffer?.lotCount??buffer?.palletCount)||0,zone=String(buffer?.zone||'').toLowerCase(),palette=['green','verde'].includes(zone)?{floor:0x69b58a,bg:'#bdddc8'}:['red','vermelho','vermelha'].includes(zone)?{floor:0xda7468,bg:'#e7b4aa'}:{floor:0xe5c45b,bg:'#f0d68a'},text=`PULMÃO · ${units.toLocaleString('pt-BR',{maximumFractionDigits:2})} un · ${lots} ${lots===1?'pallet':'pallets'}`;const floor=sectorPads.get('buffer');if(floor)floor.material=material(palette.floor,{transparent:true,opacity:.34});if(text+zone===bufferInventoryText)return;bufferInventoryText=text+zone;paintSprite(bufferInventorySign,text,'#314a3f',palette.bg);}
 function pallet(x,z,parent=world,load=true,stage='raw'){const g=new THREE.Group();g.position.set(x,.05,z);parent.add(g);for(let i=0;i<3;i++)box(g,-.45+i*.45,.06,0,.12,.12,1.1,0xa28159);for(let i=0;i<5;i++)box(g,0,.15,-.46+i*.23,1.1,.08,.17,0xc3a47a);if(load){for(let i=0;i<4;i++){if(stage==='finished')compressor(g,-.26+(i%2)*.5,.23,-.26+Math.floor(i/2)*.5,.65,true);else cyl(g,-.26+(i%2)*.5,.41,-.26+Math.floor(i/2)*.5,.18,.48,stage==='buffer'?0xb7c7cf:0xc9bc9a);}}return g;}
 // Buffer inventory is rendered only from the physical stock snapshot.
 function rack(x,z,id){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);mark(g,id);for(const dx of [-1.6,1.6])for(const dz of [-.55,.55])box(g,dx,1.4,dz,.09,2.8,.09,0x3f6b84);for(const y of [.25,1.25,2.25]){box(g,0,y,0,3.35,.08,1.3,0xd29a49);for(let j=0;j<3;j++){box(g,-1.08+j*1.05,y+.28,0,.82,.48,.85,id==='stock'?0xb7c4c5:0xb7a188);box(g,-1.08+j*1.05,y+.3,.434,.4,.16,.01,0xf0ecdc);}}return g;}
 const bodyRacks=[rack(17.2,-8,'stock'),rack(17.2,-6.4,'stock')];const bodyBoxes=bodyRacks.map(r=>r.children.filter(o=>o.geometry?.parameters?.width===.82));const bodySigns=['GENÉRICOS','Z3'].map((n,i)=>{const sp=textSprite(n,5);sp.position.set(17.2,3.1,-8+i*1.6);world.add(sp);return sp;});let bodySignKey='';rack(-11.5,-.4,'components');rack(-15.5,-.4,'components');label('components',6,3.4);
 const meetingRoom=createMeetingRoom({world,box,textSprite});mark(meetingRoom.group,'office');
 label('office',7,3.7);
 // Humans and walking motion. Workers are visual representatives, not extra capacity.
 const stationWorkers=new Map();
 const upstreamHandling={torno:{stand:[-13.5,-5.9],fixture:[-13.5,1.45,-7]},us1:{stand:[-5.5,-4.65],fixture:[-5.5,1.4,-5.7]},us2:{stand:[2,-5.9],fixture:[2,1.4,-7]}};
 for(const [id,cfg] of Object.entries({...upstreamHandling,...STATION_HANDLING,buffer:{...DBR_BUFFER_OPERATOR,fixture:[...DBR_BUFFER_OPERATOR.stand.slice(0,1),.3,DBR_BUFFER_OPERATOR.stand[1]],stancePoints:[...TransportLayout.STAGING_BAYS.buffer.map(p=>[p[0],p[1]-.95]),...DBR_HANDLING_BAYS.map(p=>[p[0],p[1]+.95]),DBR_BUFFER_OPERATOR.stand]}})){const rig=createWorkerRig({shirt:COLORS[id],helmet:id==='insp'?0xf0eee2:0xe7c65b});world.add(rig.group);mark(rig.group,id);rig.pose({position:cfg.stand,direction:[0,-1]});stationWorkers.set(id,{rig,cfg,workClock:0});}
 for(const stage of ['lap','rosq','m1','m2','insp'])for(let i=1;i<DBR_LAYOUT[stage].length;i++){const f=DBR_LAYOUT[stage][i],cfg={machineIndex:i,fixture:f,stand:[f[0],f[2]+.8],workStand:dbrWorkStand(stage,i)};const rig=createWorkerRig({shirt:COLORS[stage],helmet:0xe7c65b});world.add(rig.group);stationWorkers.set(`${stage}:${i}`,{rig,cfg,workClock:0});}
 const pcpRig=createWorkerRig({shirt:0xd7e3de,showHelmet:false,vestColor:0x526d84});world.add(pcpRig.group);mark(pcpRig.group,'office');pcpRig.pose({position:[-14.7,7.95],direction:[0,-1]});
 // Mount A1's real docks, charging parks, road, platform and truck template.
 const logisticsScene=createLogisticsScene({world,textSprite,makeBrand:createBrand,physicalSigns:signage==='physical'}),truck=logisticsScene.truckTemplate;
 label('dispatch',6,3.6);
 // Live status marker, rope line and selected-sector halo.
 const halo=new THREE.Mesh(new THREE.RingGeometry(2.85,2.95,64),new THREE.MeshBasicMaterial({color:0xf8fff7,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.11;halo.visible=false;world.add(halo);
 const lapSignal=STATION_HANDLING.lap.fixture;const ropeCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(-14.7,2.5,7.1),new THREE.Vector3(-8.7,3.8,6),new THREE.Vector3(-8.7,3.8,-3.8),new THREE.Vector3(lapSignal[0],3.8,-3.8),new THREE.Vector3(lapSignal[0],2.7,lapSignal[2])],false,'centripetal');
 const rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints(ropeCurve.getPoints(80)),new THREE.LineDashedMaterial({color:0x4b91a9,dashSize:.3,gapSize:.2,transparent:true,opacity:.55}));rope.computeLineDistances();world.add(rope);rope.visible=false;const ropeCardsVisual=new Map();
 const handlingMarker=new THREE.Group();world.add(handlingMarker);for(const [x,z]of DBR_HANDLING_BAYS){for(const side of [-1,1]){box(handlingMarker,x,.06,z+side*.62,1.25,.025,.055,0x88c2c5);box(handlingMarker,x+side*.62,.06,z,.055,.025,1.25,0x88c2c5);}}const handlingSign=textSprite('MANUSEIO  /  ILUSTRATIVO',5.6,'#335a63','#d0e6e4');handlingSign.position.set(11.2,2.35,.65);handlingMarker.add(handlingSign);handlingMarker.visible=false;
 const drumMeter=new THREE.Group();world.add(drumMeter);box(drumMeter,-2,2.7,5.1,3,.12,.16,0x31586b);const drumFill=box(drumMeter,-2,2.71,5.21,2.8,.08,.035,0xe3c25c),drumBeat=ball(drumMeter,-3.75,2.73,5.1,.13,0x6cbd8c);drumMeter.visible=false;
 const authBoard=textSprite('AUTORIZADO PELA CORDA · 0 LOTES',6,'#ecf4ed','#355c63');authBoard.position.set(11,3.1,-4.6);world.add(authBoard);const pcpSignal=textSprite('CORDA · AGUARDANDO',4,'#e6f2eb','#355c63');pcpSignal.position.set(-15.3,3.1,10.05);world.add(pcpSignal);let signalText='';
 function renderDbrControls(snapshot,isDbr,isReference){const now=Number(snapshot.animationTime??snapshot.elapsed)||0;rope.visible=false;handlingMarker.visible=false;const active=new Set();authBoard.visible=isDbr;pcpSignal.visible=isDbr;if(isDbr){const r=snapshot.dbr?.rope||{},flash=[...(snapshot.dbr?.ropeCards||[]),...(snapshot.initialStockDraws||[])].some(c=>now>=c.time&&now<c.time+1),n=r.authorizedLots||0,key=`${n}:${r.status}:${flash}`;if(key!==signalText){signalText=key;const bg=r.status==='priority'?'#efd186':flash?'#c2e9c6':'#355c63',fg=flash||r.status==='priority'?'#314b3c':'#edf4ef';paintSprite(authBoard,snapshot.scenario&&r.status==='disabled'?'CORDA DESLIGADA':`AUTORIZADO PELA CORDA · ${n} LOTES`,fg,bg);paintSprite(pcpSignal,snapshot.scenario&&r.status==='disabled'?'PRODUÇÃO EMPURRADA':flash?'CORDA · LIBERAÇÃO AUTORIZADA':r.status==='priority'?'CORDA · PRIORIDADE':'CORDA · MONITORANDO',fg,bg);}const priority=snapshot.dbr?.rope?.status==='priority',stopped=snapshot.dbr?.rope?.status==='stop';rope.material.color.setHex(stopped?0x97a8aa:priority?0xd69c3e:0x4b91a9);for(const card of snapshot.dbr?.ropeCards||[]){if(!card.animate)continue;const at=Number(card.time??card.releaseAt);if(!Number.isFinite(at)||now<at||now>=at+2.4)continue;active.add(card.id);let sp=ropeCardsVisual.get(card.id);if(!sp){const qty=Number(card.quantity).toLocaleString('pt-BR',{maximumFractionDigits:2});sp=textSprite(`LIBERAR ${qty} un`,3.6,'#254b62',card.priority?'#f2d389':'#e0edf0');mark(sp,'lap');world.add(sp);ropeCardsVisual.set(card.id,sp);}sp.position.copy(ropeCurve.getPoint(Math.max(0,Math.min(1,(now-at)/2.4))));}}
  for(const [id,sp] of ropeCardsVisual)if(!active.has(id)){releaseGroup(sp);ropeCardsVisual.delete(id);}drumMeter.visible=(isDbr||isReference)&&!(span<24&&(selected==='m1'||selected==='buffer'));const st=snapshot.stations?.find(s=>s.id==='m1'),progress=Math.max(0,Math.min(1,Number(st?.progress)||0));drumFill.scale.x=Math.max(.001,progress);drumFill.position.x=-3.4+1.4*progress;drumBeat.material=material(st?.status==='Produzindo'?0x6cbd8c:0x9ba8a6,{emissive:st?.status==='Produzindo'?0x417659:0x000000,emissiveIntensity:.18});
 }

 // Physical logistics: the seated forklift driver collects grounded pallets.
 // Cargo is rigidly attached to the lifting vehicle during each real transfer.
 const legacyTransports=new TransportController();let transports=legacyTransports;const batchLoads=new Map();let resetSeen=transports.resetCount,autoFollowTransport=false,followedStation=null;
 const forkliftRig=createForklift({color:LOGISTICS_LAYOUT.fleet[0].color,number:1}),cart=forkliftRig.group;world.add(cart);
 forkliftRig.setPose({position:TRANSPORT_STOPS.stock,direction:[0,-1]});
 const logisticsBadge=textSprite('EMPILHADEIRA 01',3.4,'#2b4957','#e7f0e9',80);logisticsBadge.position.set(0,2.45,1.15);cart.add(logisticsBadge);
 function releaseGroup(group){group.removeFromParent();const idx=selectables.indexOf(group);if(idx>=0)selectables.splice(idx,1);group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.isSprite){o.material.map?.dispose();o.material.dispose();}});}
 function batchTitle(load){if(load.demonstration)return 'DEMO-PALLET · EXEMPLO DIDÁTICO';const quantity=Number(load.quantity||0).toLocaleString('pt-BR',{maximumFractionDigits:2}),product=load.product?`${load.product} · `:'';return load.inventoryLabel?`${quantity} un`:load.compactLabel?`${load.batchId||load.lotId} · ${load.product}`:load.shortLabel?`${load.batchId||load.lotId} · ${product}${quantity} un`:`${load.orderId||load.batchId||load.id} · ${product}${quantity} un`;}
 function updateBatchLabel(visual,load){const title=batchTitle(load);if(visual.labelKey===title)return;visual.labelKey=title;paintSprite(visual.badge,title,load.illustrative?'#40558a':'#2b4654',load.illustrative?'#e6e9ff':'#fff0bd');}
 function makeBatchLoad(load){
  const g=new THREE.Group();world.add(g);pallet(0,0,g,false);const parts=new THREE.Group();world.add(parts);
  const title=batchTitle(load);
  const badge=textSprite(title,load.shortLabel?4.2:4.6,load.illustrative?'#40558a':'#2b4654',load.illustrative?'#e6e9ff':'#fff0bd',82);badge.position.set(0,1.55,0);g.add(badge);mark(g,load.stage);mark(parts,load.stage);
  return {g,parts,badge,style:null,labelKey:title};
 }
 function styleBatch(visual,stage){
  if(visual.style===stage)return;while(visual.parts.children.length){const child=visual.parts.children[0];if(child===visual.badge){visual.g.add(child);continue;}releaseGroup(child);}
  if(['m1','m2','insp','dispatch','truck'].includes(stage)){compressor(visual.parts,0,.06,0,.85,stage!=='m1');if(['insp','dispatch','truck'].includes(stage))ball(visual.parts,.23,.42,.19,.055,0x60b788);}
  else {cyl(visual.parts,0,.25,0,.23,.48,stage==='stock'?0xc6bc9e:0xbfcfd5);if(['rosq','buffer'].includes(stage))for(let j=0;j<4;j++)cyl(visual.parts,0,.14+j*.08,0,.25,.022,0x718e9b);}
  visual.style=stage;visual.g.userData.sector=stage;visual.parts.userData.sector=stage;
 }
 function resetWorkers(){for(const [id,w] of stationWorkers){w.workClock=0;w.rig.pose({position:w.cfg.stand,direction:[0,-1]});}}
 let mpsState=null;const mpsLogistics={loads:new Map(),operators:new Map(),machineOccupants:new Map(),getStationAction(id){return mpsState?.stationActions?.get(id)||null;},getTransportState(){return this.getStationAction(selected)||mpsState?.stationActions?.values().next().value||null;},isTransporting(){return false;}};
 const mpsVisuals=createMPSVisuals({world,firstForklift:forkliftRig,truck,makeBatchLoad,updateBatchLabel,styleBatch,releaseGroup});mpsVisuals.setVisible(false);cart.visible=true;
 const filmCast=createFilmCast({world,workers:stationWorkers,pcpRig,textSprite});
 const demoCart=demonstration?.createCart();if(demoCart){world.add(demoCart.group);demoCart.group.visible=false;}
 const fadedObjects=new WeakSet();
 function exampleOpacity(group,opacity){group.traverse(o=>{if(!o.material)return;if(!fadedObjects.has(o)){o.material=o.material.clone();o.userData.exampleBaseOpacity=o.material.opacity;fadedObjects.add(o);}o.material.transparent=true;o.material.opacity=o.userData.exampleBaseOpacity*opacity;});}
 function renderExample(s){
  if(!demoCart)return;demoCart.group.visible=false;
  const d=mpsState?.demonstration;if(!d)return;
  const pose=mpsState.carriers.find(c=>c.id===d.carrierId);if(pose){demoCart.update(pose);demoCart.group.visible=d.opacity>0;exampleOpacity(demoCart.group,d.opacity);}
  const pallet=mpsVisuals.loads.get('DEMO-PALLET');if(pallet){exampleOpacity(pallet.g,d.opacity);exampleOpacity(pallet.parts,d.opacity);}
 }
 function demonstrationState(){
  const d=mpsState?.demonstration;if(!d)return null;
  const pallet=mpsVisuals.loads.get('DEMO-PALLET'),operator=stationWorkers.get(d.operatorId)||stationWorkers.get(d.operatorId.replace(':0',''));
  const project=p=>{camera.updateMatrixWorld(true);const v=new THREE.Vector3(...p).project(camera);return {x:v.x,y:v.y,visible:Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&v.z>=-1&&v.z<=1};};
  const boundsInFrame=object=>{const b=new THREE.Box3().setFromObject(object);return !b.isEmpty()&&[b.min.x,b.max.x].every(x=>[b.min.y,b.max.y].every(y=>[b.min.z,b.max.z].every(z=>project([x,y,z]).visible)));};
  const palletPosition=pallet?.g.getWorldPosition(new THREE.Vector3()).toArray(),operatorPosition=operator?.rig.group.getWorldPosition(new THREE.Vector3()).toArray();
  return {...d,palletPosition,operatorPosition,carrierPosition:demoCart.group.position.toArray(),carrierInFrame:boundsInFrame(demoCart.group),carrierPark:demonstration.plan.missions[0].carrier.position,operatorHome:demonstration.plan.missions[0].operator.position,palletInFrame:palletPosition?project(palletPosition).visible:false,operatorInFrame:operatorPosition?project(operatorPosition).visible:false,operatorInstances:[...stationWorkers.values()].filter(w=>w.rig===operator?.rig).length,palletVisible:!!pallet?.g.visible,carrierVisible:demoCart.group.visible,industrialHours:currentSnapshot?.dbr?.workHours};
 }
 // Read the rendered transforms for integration QA; never advance the planner here.
 function operationalState(){
  const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
  const pose=o=>({position:o.getWorldPosition(new THREE.Vector3()).toArray(),yaw:o.rotation.y,visible:visible(o)});
  const carriers=[];world.traverse(o=>{if(o.children.some(c=>c.isMesh&&c.geometry?.type==='CylinderGeometry'&&c.geometry.parameters.radiusTop===.035&&c.geometry.parameters.height===.78))carriers.push(pose(o));});
  return {complete:!!currentSnapshot?.internalAllocation?.complete,internalCount:currentSnapshot?.internalAllocation?.assignments.length||0,logisticsMounted:!!world.getObjectByName('gama-logistics'),conveyorGroups:world.getObjectByName('DBR roller conveyors')?1:0,
   carriers:carriers.filter(p=>p.visible),forklifts:mpsVisuals.rigs.map(r=>pose(r.group)),operators:[...stationWorkers].map(([id,w])=>({id:id.includes(':')?id:`${id}:0`,...pose(w.rig.group)})),
   trucks:[mpsVisuals.truck,...mpsVisuals.extraTrucks.map(t=>t.truck)].map(pose).filter(p=>p.visible)};
 }

 if(signage==='physical')createPhysicalSignage(world,machineGroups);
 const cinematic=createFactoryCinematic({world,scene,camera,ambient,sun,fill,renderer,box,textSprite,machines:machineGroups,workers:stationWorkers,pcp:pcpRig,movers});
 function stationState(id){
  const st=currentSnapshot?.stations?.find(v=>v.id===id);if(!st)return {batchId:null,ready:false,handling:false};
  const batchId=st.activeBatchId;const foreground=(currentSnapshot.batches||[]).some(b=>(b.batchId||b.id)===batchId);
  const load=transports.loads.get(batchId);const state=transports.getStationAction?.(id)||transports.getTransportState();
  // DBR pallets and station occupancy share the same causal schedule.
  const ready=currentSnapshot.mode==='dbr'||!foreground||!!(load&&load.partLocation==='machine'&&load.stationId===id);
  const handling=!!state&&state.kind==='station'&&state.stationId===id;
  return {batchId:batchId||null,ready,handling,phase:handling?state.phase:undefined};
 }
 function maintenanceHours(s,id){return s.scenario ? Math.max(0,...(s.breakdowns||[]).filter(stop=>stop.station===id).map(stop=>stop.remainingHours??stop.remaining??stop.duration??0)) : id==='rosq' ? s.breakdownRemaining||0 : 0;}
 const maintenanceSigns=new Map();
 function renderStationWorkers(s,state,dt,playing,advancing){
  const stMap=new Map((s.stations||[]).map(st=>[st.id,st]));
  for(const [id,w] of stationWorkers){if(signage==='floating'&&maintenanceHours(s,id.split(':')[0])>0){w.rig.pose({position:w.cfg.stand,direction:[0,-1]});continue;}w.rig.group.visible=id!=='buffer'||s.mode==='dbr';const fixture=s.mode==='dbr'?DBR_LAYOUT[id.split(':')[0]]?.[Number(id.split(':')[1]||0)]:null,config=fixture?{...w.cfg,fixture,workStand:dbrWorkStand(id.split(':')[0],Number(id.split(':')[1]||0)),stand:[fixture[0],fixture[2]+.8]}:w.cfg,operator=transports.operators?.get(id.includes(':')?id:`${id}:0`)||transports.operators?.get(id),st=stMap.get(id.split(':')[0]),physical=stationState(id.split(':')[0]);
   const handlingState=transports.getStationAction?.(id)||state;const handling=handlingState?.kind==='station'&&handlingState.stationId===id.split(':')[0]&&(!id.includes(':')||handlingState.machineIndex===Number(id.split(':')[1]));
   const working=st?.status==='Produzindo'&&physical.ready&&!handling&&advancing&&playing;
   if(['mps','dbr','dbr-reference'].includes(s.mode))w.workClock=(Number(s.film?.presentationTime??s.animationTime??s.elapsed)||0)*1.6;else if(working)w.workClock+=dt;
   const op=operator||{position:config.stand,direction:[0,-1],distance:0};
   let position=op.position,direction=op.direction,walking=false,gait=op.distance*7,strideScale=1,bend=0,handsWorld=null,handsLocal=null,reach=1,tool=false;
   const missionPose=workerMissionPose(operator);
   if(missionPose){w.rig.pose(missionPose);continue;}
   if(handling){
    const phase=handlingState.phaseKey,t=handlingState.phaseProgress;walking=/approach|carry_in|carry_out|return/.test(phase);
    // Settle the feet before reaching either fixture or grounded pallet.
    // A zero-length approach at the work stand must retain a neutral stance.
    const load=transports.loads.get(handlingState.batchId),bayStand=load?[load.position[0],load.position[1]-.95]:position;
    const stops=config.stancePoints||[config.workStand,bayStand];const endDistance=Math.min(...stops.map(p=>Math.hypot(position[0]-p[0],position[1]-p[1])));
    strideScale=Math.min(1,endDistance/.65);walking=walking&&strideScale>.001;
    const holding=/pick|carry_in|carry_out|place|retreat/.test(phase);
    if(holding){const p=handlingState.partPosition,right=[-direction[1],direction[0]],grip=.17;
     handsWorld=[-1,1].map(sign=>[p[0]+right[0]*grip*sign,p[1]+.16,p[2]+right[1]*grip*sign]);
     bend=Math.max(.16,Math.min(1.1,(1.3-p[1])*1.1));
     if(/pick/.test(phase))reach=Math.min(1,t*4+.15);
     if(phase==='station_retreat')reach=1-t;
    }
   }else if(st?.status==='Produzindo'&&physical.ready){
    // At a staffed fixture hands perform the task; workClock stops exactly on pause.
    const t=w.workClock,cyc=(Math.sin(t*2.4)+1)/2,fixture=config.fixture;
    bend=.22;const f=fixture;
    const represented=!!transports.machineOccupants?.get(id);
    if(!represented){handsLocal=[[-.18,1.15,-.5],[.38,1.2+cyc*.14,-.38]];bend=.12;}
    else if(id==='lap'){handsWorld=[[f[0]-.19,f[1]+.16,f[2]+.15],[f[0]+.42,1.2+cyc*.12,f[2]+.48]];}
    else if(id==='rosq'){handsWorld=[[op.position[0]-.22,1.05,op.position[1]-.12],[f[0]+.52,1.35+cyc*.12,f[2]+.45]];}
    else if(id.split(':')[0]==='m1'){handsWorld=[[f[0]-.19,f[1]+.18+cyc*.07,f[2]+.14],[f[0]+.18,f[1]+.15+(1-cyc)*.1,f[2]+.08]];}
    else if(id==='m2'){handsWorld=[[f[0]-.18,f[1]+.26,f[2]+.1],[f[0]+.2*Math.cos(t*2),f[1]+.32,f[2]+.16+Math.sin(t*2)*.04]];}
    else if(id==='insp'){handsWorld=[[f[0]-.2,f[1]+.15,f[2]+.16],[f[0]+.16,f[1]+.22+cyc*.1,f[2]+.12]];tool=true;}
    else {handsLocal=[[-.18,1.15,-.5],[.38,1.2+cyc*.14,-.38]];bend=.12;}
   }
   // The rig deterministically receives the same pose while paused/modal-open.
   w.rig.pose({position,direction,walking,gait,strideScale,bend,handsWorld,handsLocal,reach,tool});
  }
 }
 function renderTransport(s,realDelta,playing){
  if(typeof s.presentationSerial==='number'||typeof s.movementSerial==='number')transports.ingest(s);
  if(resetSeen!==transports.resetCount){for(const v of batchLoads.values()){releaseGroup(v.parts);releaseGroup(v.g);}batchLoads.clear();resetWorkers();followedStation=null;resetSeen=transports.resetCount;truck.position.x=12;truck.visible=true;}
  transports.advance(realDelta,playing);
  const state=transports.getTransportState();
  const fallbackLift=state?.phaseKey==='loading'?.3*state.phaseProgress:state?.phaseKey==='unloading'?.3*(1-state.phaseProgress):[...transports.loads.values()].some(l=>l.onCart)?.3:0;
  const forkLift=Number.isFinite(transports.forkLift)?transports.forkLift:fallbackLift;
  const groundHeight=Number.isFinite(transports.groundHeight)?transports.groundHeight:0;
  forkliftRig.setPose({position:transports.position,direction:transports.vehicleDirection||transports.direction,distance:transports.distance,forkLift,groundHeight});
  logisticsBadge.visible=!!state&&state.kind!=='station'&&span>=28;
  const liveBatches=new Map((s.batches||[]).map(b=>[b.batchId||b.id,b]));
  for(const [id,load] of transports.loads){let visual=batchLoads.get(id);if(!visual){visual=makeBatchLoad(load);batchLoads.set(id,visual);}styleBatch(visual,load.partStage||load.stage);
   const actual=liveBatches.get(id),inTruck=load.partLocation==='truck';
   if(inTruck){if(visual.g.parent!==truck){const yaw=visual.g.rotation.y+(visual.g.parent===cart?cart.rotation.y:0);truck.add(visual.g);visual.g.rotation.y=yaw;}visual.g.position.set(load.position[0]-12,(load.palletY??.89)-truck.position.y,load.position[1]-19.2);visual.badge.visible=false;visual.g.visible=actual?.stage!=='delivered';if(visual.parts.parent!==truck){const yaw=visual.parts.rotation.y+(visual.parts.parent===cart?cart.rotation.y:0);truck.add(visual.parts);visual.parts.rotation.y=yaw;}visual.parts.position.set(load.partPosition[0]-12,load.partPosition[1]-truck.position.y,load.partPosition[2]-19.2);visual.parts.visible=visual.g.visible;continue;}
   visual.g.visible=true;visual.parts.visible=true;visual.badge.visible=!(autoFollowTransport&&(load.onCart||['hands','machine'].includes(load.partLocation)));
   if(load.onCart){if(visual.g.parent!==cart){const yaw=visual.g.rotation.y;cart.add(visual.g);visual.g.rotation.y=yaw-cart.rotation.y;}visual.g.position.set(0,(load.palletY??.05+forkLift)-groundHeight,0);}
   else {if(visual.g.parent!==world){const yaw=visual.g.rotation.y+(visual.g.parent===cart?cart.rotation.y:0);world.add(visual.g);visual.g.rotation.y=yaw;}visual.g.position.set(load.position[0],load.palletY??.05,load.position[1]);}
   const carried=load.partLocation==='hands',inMachine=load.partLocation==='machine';
   if(load.partLocation==='cart'){
    if(visual.parts.parent!==cart){const yaw=visual.parts.rotation.y;cart.add(visual.parts);visual.parts.rotation.y=yaw-cart.rotation.y;}cart.updateMatrixWorld(true);visual.parts.position.copy(cart.worldToLocal(new THREE.Vector3(...load.partPosition)));
   }else {
    if(visual.parts.parent!==world){const yaw=visual.parts.rotation.y+(visual.parts.parent===cart?cart.rotation.y:0);world.add(visual.parts);visual.parts.rotation.y=yaw;}visual.parts.position.set(...(load.partPosition||[load.position[0],.3,load.position[1]]));
    if(carried){const op=transports.operators?.get(load.stationId);if(op)visual.parts.rotation.y=Math.atan2(-op.direction[0],-op.direction[1]);}
   }
   const badgeParent=(carried||inMachine)?visual.parts:visual.g;if(visual.badge.parent!==badgeParent)badgeParent.add(visual.badge);visual.badge.position.set(0,(carried||inMachine)?1.05:load.onCart?2.7:1.55,0);
  }
  if(autoFollowTransport&&state){
   if(state.kind==='station'){followedStation=state.stationId;const p=state.operatorPosition,cfg=STATION_HANDLING[state.stationId];targetGoal.set((p[0]+cfg.fixture[0])/2,.3,(p[1]+cfg.fixture[2])/2);targetSpan=15;}
   else {targetGoal.set(cart.position.x,0,cart.position.z);targetSpan=22;}
   halo.visible=false;
  }
  return state;
 }
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
 function selectAt(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(selectables,true);if(hits.length){let o=hits[0].object;while(o&&!o.userData.sector)o=o.parent;if(o){focus(o.userData.sector);onSelect(o.userData.sector);}}}
 function down(e){onInteract();autoFollowTransport=false;drag=true;lastX=downX=e.clientX;lastY=downY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId);renderer.domElement.style.cursor='grabbing';}
 function move(e){if(!drag)return;onInteract();const dx=e.clientX-lastX;targetAngle-=dx*.004;targetAngle=Math.max(-.3,Math.min(1.5,targetAngle));lastX=e.clientX;lastY=e.clientY;}
 function up(e){if(drag&&Math.hypot(e.clientX-downX,e.clientY-downY)<5)selectAt(e);drag=false;renderer.domElement.style.cursor='grab';}
 function wheel(e){onInteract();autoFollowTransport=false;e.preventDefault();targetSpan=Math.max(10,Math.min(68,targetSpan*(e.deltaY>0?1.08:.92)));}
 renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('wheel',wheel,{passive:false});
 let width=1,height=1;function resize(){width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);renderer.setSize(width,height,false);}
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 function focus(id){if(id==='truck'||id==='shipping')id='dispatch';if(id==='body-stock')id='stock';if(!POS[id])return;autoFollowTransport=false;selected=id;const [x,z]=POS[id];targetGoal.set(x,0,z);targetSpan=id==='overview'?64:id==='office'?14:id==='buffer'?16:id==='dispatch'?17:15;halo.visible=id!=='overview'&&id!=='buffer';halo.position.x=x;halo.position.z=z;halo.scale.set(1,1,1);}
 let lastTime=null;
 const visualProps=createVisualProps({world,THREE,textSprite,floatingSigns});
 const exterior=createExterior({world,THREE,box});
 // Plano-sequência: a golden tag and floor ring identify the followed pallet.
 const journeyMarker=new THREE.Group();journeyMarker.visible=false;world.add(journeyMarker);let journeyMarkerKey='',journeyTag=null;
 {const ring=new THREE.Mesh(new THREE.RingGeometry(.95,1.12,48),new THREE.MeshBasicMaterial({color:0xf2c14e,transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.09;journeyMarker.add(ring);}
 function updateJourneyMarker(s,handling){
  const j=s?.film?.journey,load=j&&handling?.loads?.get(s.film.trackedLotId);
  journeyMarker.visible=!!load?.position;if(!journeyMarker.visible)return;
  const key=`${j.lotId} · ${j.product} · ${j.quantity} un`;
  if(key!==journeyMarkerKey){if(journeyTag)journeyMarker.remove(journeyTag);journeyTag=textSprite(key,3.6,'#3d2f08','#f2c14e',80);floatingSigns.splice(floatingSigns.indexOf(journeyTag),1);journeyTag.renderOrder=10;journeyTag.material.depthTest=false;journeyTag.position.y=2.55;journeyMarker.add(journeyTag);journeyMarkerKey=key;}
  journeyMarker.position.set(load.position[0],load.palletY??0,load.position[1]);
  journeyTag.position.y=2.55+.12*Math.sin((s.film.presentationTime||0)*3);
 }
 function update(snapshot,deltaSeconds=.016,{transportPlaying=true,playbackStarted=false}={}){currentSnapshot=snapshot||currentSnapshot;const isReference=currentSnapshot?.mode==='dbr-reference',isDbr=currentSnapshot?.mode==='dbr',isMps=currentSnapshot?.mode==='mps'||isReference||isDbr;let s=isMps?{...currentSnapshot,batches:currentSnapshot.lots||[]}:currentSnapshot||{};if(isReference){const ref=referencePresentation(s);s={...s,elapsed:Number(s.hours)||0,animationTime:Number(s.hours)||0,batches:[...ref.loads.values()],buffer:ref.buffer,stations:ref.stations,trips:[]};mpsState=ref;}currentSnapshot=s;const realDelta=Math.min(1,Math.max(0,deltaSeconds));const dt=Math.min(.1,realDelta);let activeTransport;
  if(isMps){clock=Number(s.film?.factoryAnimationTime??s.animationTime??s.elapsed)||0;if(!isReference)mpsState=s.scenario?scenarioPresentation(s):isDbr?pinSpeakingOperators(s,applyJourneyHandling(s,finishedStageAppearance(s,sampleDbrHandling(s,Number(s.animationTime??s.elapsed))))):sampleMpsHandling(s,clock);if(demonstration&&s.film?.demonstration)mpsState=withFilmDemonstration(s,mpsState,demonstration.sample(demonstration.plan,s.film.demonstration.sourceTime??s.elapsed),demonstration);Object.assign(mpsLogistics,{loads:mpsState.loads,operators:mpsState.operators,machineOccupants:mpsState.machineOccupants});transports=mpsLogistics;for(const v of batchLoads.values()){v.g.visible=false;v.parts.visible=false;}logisticsBadge.visible=false;truck.visible=false;mpsVisuals.update({...s,elapsed:Number(s.animationTime??clock),trips:s.scenario?[]:mpsState.visualTrips||s.trips},mpsState,{span});activeTransport=mpsLogistics.getTransportState();}
  else{transports=legacyTransports;mpsVisuals.setVisible(false);cart.visible=true;
 if(transportPlaying)clock+=dt;activeTransport=renderTransport(s,realDelta,transportPlaying);}
 const lerp=1-Math.exp(-dt*3);
 if(s.film){filmCamera.update({elapsed:s.film.presentationTime??s.elapsed,dt:realDelta,width,height});span=s.film.shot.span;angle=s.film.shot.orbit??.7;}
 else {angle+=(targetAngle-angle)*lerp;span+=(targetSpan-span)*lerp;target.lerp(targetGoal,lerp);const aspect=width/height;camera.left=-span/2;camera.right=span/2;camera.top=span/(2*aspect);camera.bottom=-span/(2*aspect);camera.updateProjectionMatrix();camera.position.set(target.x+Math.sin(angle)*38,target.y+35,target.z+Math.cos(angle)*38);camera.lookAt(target.x,target.y,target.z);}
 for(const sp of sectorLabels){const hideLabel=span<24&&(sp.userData.sector===selected||sp.userData.sector===activeTransport?.stationId||(autoFollowTransport&&sp.userData.sector===followedStation));sp.visible=!hideLabel;const w=sp.userData.labelWidth*Math.max(.4,Math.min(1,span/45));sp.scale.set(w,w/8,1);}
  drumSign.visible=!(isMps&&span<24&&(selected==='m1'||selected==='buffer'||mpsState?.stationActions?.has('m1')));bufferSign.visible=!isMps;bufferInventorySign.visible=isMps;if(isMps)updateBufferSign(s.buffer);
  const sampleTime=isMps?Number(s.elapsed):Number(s.time);const advancing=lastTime===null||sampleTime!==lastTime;lastTime=sampleTime;const stMap=new Map((s.stations||[]).map(st=>[st.id,st]));
  const mechanicalClock=s.film?.presentationTime??clock;
  for(const m of machineGroups){const st=stMap.get(m.id),physical=stationState(m.id),cfg=isDbr?{machineIndex:m.index,fixture:DBR_LAYOUT[m.id]?.[m.index]}:STATION_HANDLING[m.id];
   const occupant=[...transports.loads.values()].find(l=>l.stationId===m.id&&l.machineIndex===m.index&&['machine','hands'].includes(l.partLocation));
   const selectedFixture=cfg&&m.index===cfg.machineIndex;const activeForeground=(s.batches||[]).some(b=>(b.batchId||b.id)===st?.activeBatchId);
   const hiddenSample=isDbr||selectedFixture&&(!!occupant||(!isDbr&&activeForeground));for(const sample of m.sampleObjects)sample.visible=!hiddenSample;
   const machineAction=transports.getStationAction?.(isDbr?`${m.id}:${m.index}`:m.id)||(!isDbr?activeTransport:null);const manual=machineAction?.kind==='station'&&machineAction.stationId===m.id&&(!isDbr||machineAction.machineIndex===m.index);
   if(m.guard&&selectedFixture){const open=manual&&machineAction.phaseKey!=='station_retreat';if(isMps)m.guard.position.y=open?.9:0;else if(transportPlaying)m.guard.position.y+=((open?.9:0)-m.guard.position.y)*(1-Math.exp(-realDelta*10));}
   const running=st?((st.processingUnits||0)>0&&String(st.status)==='Produzindo'&&(!isDbr||m.id!=='m1'||st.activeLots?.some(l=>l.machineIndex===m.index&&l.processing))):false,broken=s.scenario?s.breakdowns.some(stop=>stop.station===m.id):m.id==='rosq'&&(s.breakdownRemaining||0)>0;
   const active=running&&physical.ready&&advancing&&transportPlaying&&!broken&&!manual&&(!m.guard||m.guard.position.y<.08);
   if(isMps&&running&&physical.ready&&!broken&&!manual){if(m.type==='lathe')m.moving.rotation.x=mechanicalClock*11;else if(m.type==='lap'){m.moving.rotation.y=mechanicalClock*7;if(selectedFixture&&occupant?.partLocation==='machine'){const v=mpsVisuals.loads.get(occupant.batchId);if(v)v.parts.rotation.y=mechanicalClock*7;}}else if(m.type==='thread'||m.type==='mill'){m.moving.rotation.y=mechanicalClock*10;m.moving.position.y=m.baseY+Math.sin(mechanicalClock*3+m.index)*.13;}else if(!hiddenSample)m.moving.rotation.y=mechanicalClock*.6;}
   else if(active&&!isMps){if(m.type==='lathe')m.moving.rotation.x+=realDelta*11;else if(m.type==='lap'){m.moving.rotation.y+=realDelta*7;if(selectedFixture&&occupant?.partLocation==='machine'){const v=batchLoads.get(occupant.batchId);if(v)v.parts.rotation.y+=realDelta*7;}}else if(m.type==='thread'||m.type==='mill'){m.moving.rotation.y+=realDelta*10;m.moving.position.y=m.baseY+Math.sin(clock*3+m.index)*.13;}else if(!hiddenSample)m.moving.rotation.y+=realDelta*.6;}
   const color=broken?0xd85b46:running&&physical.ready?0x69c29a:0x829398;m.lamp.material=material(color,{emissive:color,emissiveIntensity:broken?.5:.15});
  }
  renderStationWorkers(s,activeTransport,realDelta,transportPlaying,advancing);
  if(signage==='floating'){for(const id of Object.keys(NAMES)){const hours=maintenanceHours(s,id);let v=maintenanceSigns.get(id);if(hours>0&&!v){const label=textSprite('',6,'#ffffff','#9d2626',100);label.position.set(POS[id][0],5,POS[id][1]);world.add(label);const ring=new THREE.Mesh(new THREE.RingGeometry(1.8,2.4,48),new THREE.MeshBasicMaterial({color:0xff2222,transparent:true,opacity:.5,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(POS[id][0],.06,POS[id][1]);world.add(ring);v={label,ring};maintenanceSigns.set(id,v);}if(v){v.label.visible=v.ring.visible=hours>0;if(hours>0){const text=`EM MANUTENÇÃO · ${hours.toLocaleString('pt-BR',{maximumFractionDigits:1})} h`;if(v.text!==text){paintSprite(v.label,text,'#ffffff','#9d2626');v.text=text;}}}}}
  const ratio=Math.max(0,Math.min(1,(s.buffer?.units??3571)/(s.buffer?.target||3571)));for(let i=0;i<bufferPallets.length;i++)bufferPallets[i].visible=!isMps&&i<Math.ceil(ratio*bufferPallets.length);
  for(const p of movers){if(p.type==='walker'){if(!advancing)continue;const t=(Math.sin(clock*.14+p.phase)+1)/2;const [a,b]=p.path;p.g.position.x=a[0]+(b[0]-a[0])*t;p.g.position.z=a[1]+(b[1]-a[1])*t;p.g.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1])+(Math.cos(clock*.14+p.phase)<0?Math.PI:0);p.leg1.rotation.x=Math.sin(clock*7)*.3;p.leg2.rotation.x=-Math.sin(clock*7)*.3;}else{const st=stMap.get(p.id);if(st?.processingUnits&&advancing)p.g.rotation.y=Math.sin(clock+p.phase)*.12;}}
  if(!isMps){const customerOrders=(s.orders||[]).filter(o=>!o.background);const transportOrder=customerOrders.find(o=>/transporte|expedido/i.test(o.status));const done=customerOrders.some(o=>/entregue/i.test(o.status));if(transportOrder){const fraction=Math.max(0,Math.min(1,((s.time||0)-(transportOrder.shippedAt||0))/4));truck.position.x=12-fraction*37;truck.visible=truck.position.x>-23;}else if(!done||customerOrders.some(o=>!o.delivered)){truck.position.x+=(12-truck.position.x)*lerp;truck.visible=true;}else truck.visible=false;}
  halo.material.opacity=.65+Math.sin(clock*2)*.15;
  renderDbrControls(s,isDbr,isReference);
  if(isDbr){const stocks=s.upstream?.bodyStock||{generic:2434,z3:7151},key=`${stocks.generic}:${stocks.z3}`;for(let i=0;i<2;i++){const value=i?stocks.z3:stocks.generic,max=i?7151:2434;bodyBoxes[i].forEach((b,j)=>{b.visible=j<Math.ceil(value/max*bodyBoxes[i].length);b.scale.y=Math.max(.08,Math.min(1,value/max*bodyBoxes[i].length-j));});}if(key!==bodySignKey){bodySignKey=key;paintSprite(bodySigns[0],`GENÉRICOS · ${stocks.generic.toLocaleString('pt-BR')} un`,'#2b4654','#e7eee4');paintSprite(bodySigns[1],`Z3 · ${stocks.z3.toLocaleString('pt-BR')} un`,'#2b4654','#e7eee4');}}
  for(const m of movers)m.g.visible=true;pcpRig.group.visible=true;filmCast.update(s,mpsState);meetingRoom.update(s);logisticsScene.update(s,mpsState);renderExample(s);cinematic.update(s);updateJourneyMarker(s,mpsState);visualProps.update(s);try{exterior.update(s,cinematicState(s.film?.presentationTime??s.elapsed??0,{windows:s.film?.story?.windows}));}catch(error){console.error('exterior',error);}if(signage==='physical')for(const sign of floatingSigns)if(!sign.userData.keepVisible)sign.visible=false;renderer.render(scene,camera);
 }
 renderer.render(scene,camera);
 return {update,focus,direct(shot){if(!shot?.position)return;filmCamera.direct(shot);autoFollowTransport=false;selected=shot.target in POS?shot.target:'overview';targetGoal.set(shot.position[0],.5,shot.position[1]);targetSpan=shot.span;targetAngle=shot.orbit??.7;halo.visible=false;},getOperationalState:operationalState,getDemonstrationState:demonstrationState,getCameraPose(){return {position:camera.position.toArray(),span:camera.right-camera.left};},projectActor(name){return filmCast.project(name,camera,width,height);},projectSector(id){if(id==='truck'||id==='shipping')id='dispatch';const pos=POS[id];if(!pos)return {x:0,y:0,visible:false};camera.updateMatrixWorld(true);const p=new THREE.Vector3(pos[0],id==='office'?2.2:1.8,pos[1]).project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,visible:p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1};},getStationState:stationState,getFollowedSector(){const st=transports.getTransportState();return autoFollowTransport?(st?.kind==='station'?st.stationId:!st?followedStation:null):null;},isTransporting(){return transports.isTransporting();},getTransportState(){return transports.getTransportState();},followTransport(enabled=true){autoFollowTransport=!!enabled;},resetView(){filmCamera.reset();targetAngle=.70;focus('overview');},zoom(delta){autoFollowTransport=false;targetSpan=Math.max(10,Math.min(68,targetSpan+delta));},setOrbit(delta){autoFollowTransport=false;targetAngle=Math.max(-.3,Math.min(1.5,targetAngle+delta));},resize,destroy(){demoCart?.destroy();meetingRoom.destroy();mpsVisuals.destroy();logisticsScene.destroy();observer.disconnect();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointermove',move);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('wheel',wheel);scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material?.map)o.material.map.dispose();});renderer.dispose();renderer.domElement.remove();}};
}
