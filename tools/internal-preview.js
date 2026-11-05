import * as THREE from '../vendor/three.module.js';
import {DBR_BAYS} from '../dbr-layout.js';
import {FactoryFilm} from '../factory-film.js';
import {compileInternalTransport,sampleInternalTransport,prepareInternalAccess,createInternalDemonstration,internalOperatorCandidates} from '../internal-motion.js';
import {createInternalTransportScene} from '../internal-scene.js';
import {createWorkerRig} from '../worker-rig.js';
import {reviewInternalPilots} from '../internal-motion.js';
import {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles} from '../internal-layout.js';
const film=new FactoryFilm(),pilots=reviewInternalPilots(film.schedule);
const raw=film.schedule.timeline.find(e=>e.from==='m1'&&e.to==='m2');
const input=prepareInternalAccess(internalPilotInput(raw,INTERNAL_PILOTS[3]));
const layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(input.transfer)]};
const accelerated=compileInternalTransport({transfers:[input.transfer],carriers:[input.carrier],operators:[input.operator],layout,processes:film.schedule.timeline.filter(e=>e.kind==='process'),presentation:{mode:'production'}});
const demonstration=createInternalDemonstration({start:100,end:130,input,layout});
for(const [link,plan] of [['R2 · M1 → M2 · produção acelerada',accelerated],['R2 · M1 → M2 · demonstração Ato 2',demonstration]])pilots.push({link,raw,transfer:plan.transfers[0],plan,request:plan.missions[0].request,operator:input.operator});
for(const id of ['DBR-E1','DBR-E5','DBR-E66','DBR-E900']){
 const raw=film.schedule.timeline.find(e=>e.id===id),pilot=INTERNAL_PILOTS.find(p=>p.link===`${raw.from}>${raw.to}`);
 const source=DBR_BAYS[raw.from].findIndex(p=>p[0]===raw.fromPosition[0]&&p[1]===raw.fromPosition[1]);
 const destination=DBR_BAYS[raw.to].findIndex(p=>p[0]===raw.toPosition[0]&&p[1]===raw.toPosition[1]);
 const input=prepareInternalAccess(internalPilotInput(raw,{...pilot,source,destination}));
 const plan=compileInternalTransport({transfers:[input.transfer],carriers:[input.carrier],operators:internalOperatorCandidates(input),processes:film.schedule.timeline.filter(e=>e.kind==='process'),layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(input.transfer)]},presentation:{mode:'production',fitProductionStart:true}});
 pilots.push({link:`Acessos corrigidos · ${id} · ${pilot.link}`,raw,transfer:plan.transfers[0],plan,request:plan.missions[0].request,operator:plan.missions[0].operator});
}
let active=pilots[0],event=active.transfer,plan=active.plan,mission=plan.missions[0];
const world=new THREE.Scene();world.background=new THREE.Color(0xb5c8d1);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,150);camera.position.set(5,15,25);camera.lookAt(-1,0,9);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(devicePixelRatio);document.body.append(renderer.domElement);
world.add(new THREE.HemisphereLight(0xffffff,0x698198,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-5,12,10);world.add(light);
const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.7});
function box(parent,x,y,z,w,h,d,c){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);parent.add(m);return m;}
box(world,0,-.12,4,42,.2,28,0xa0b0af);
for(const o of INTERNAL_LAYOUT.obstacles){const x=(o.min[0]+o.max[0])/2,z=(o.min[1]+o.max[1])/2,w=o.max[0]-o.min[0],d=o.max[1]-o.min[1];box(world,x,.6,z,w,1.2,d,0x648c9e);}
const staged=[];for(const points of Object.values(INTERNAL_LAYOUT.bays))for(const p of points){const g=new THREE.Group();g.position.set(p[0],.05,p[1]);box(g,0,.1,0,1.1,.2,1.1,0xa98a57);box(g,0,.4,0,.85,.4,.85,0x8d9ea5);world.add(g);staged.push({p,g});}
const scene=createInternalTransportScene({world}),rig=createWorkerRig({shirt:0x498dce});world.add(rig.group);
const pallet=new THREE.Group();world.add(pallet);for(const x of [-.4,0,.4])box(pallet,x,.05,0,.16,.1,1.1,0x98744a);for(const z of [-.4,-.2,0,.2,.4])box(pallet,0,.15,z,1.1,.07,.16,0xb79362);for(const x of [-.26,.26])for(const z of [-.26,.26])box(pallet,x,.34,z,.38,.3,.38,0x739198);
let elapsed=mission.start-.3,speed=1,close=false,playing=true,last=performance.now();
function render(t){
 const p=sampleInternalTransport(plan,t),c=p.carriers[0];scene.update({},p);
 rig.group.visible=!!c;pallet.visible=!!c;
 if(c){
  const op=p.operators.get(active.operator.id);rig.pose(op||{position:active.operator.position});
  const load=p.loads.get(event.lotId),frame=t<event.start?mission.request.frames.push[0]:mission.request.frames.push.at(-1);
  const pos=load?.position||(t<event.start?event.fromPosition:event.toPosition);
  pallet.position.set(pos[0],load?.palletY??.05,pos[1]);pallet.rotation.y=load?.yaw??Math.atan2(frame.direction[0],frame.direction[1]);
  if(close){camera.position.set(c.position[0]+3,3.4,c.position[1]+4.5);camera.lookAt(c.position[0],1.3,c.position[1]);}
 }
 document.querySelector('#status').textContent=`${speed===1?'REPRODUÇÃO 1×':'INSPEÇÃO LENTA 0,1×'} · t=${t.toFixed(2)} s · ${c?.phase??'fora da demonstração'} · carga ${mission.presentation.loaded.toFixed(2)} s`;
 renderer.render(world,camera);return p;
}
function tick(now){if(playing){elapsed+=(now-last)/1000*speed;if(elapsed>mission.end+.5)elapsed=mission.start-.3;}last=now;render(elapsed);requestAnimationFrame(tick);}requestAnimationFrame(tick);
document.querySelector('#slow').onclick=()=>{speed=.1;elapsed=mission.start-.3;playing=true;};document.querySelector('#real').onclick=()=>{speed=1;elapsed=mission.start-.3;playing=true;};document.querySelector('#close').onclick=()=>{close=true;};document.querySelector('#wide').onclick=()=>{close=false;camera.position.set(5,15,25);camera.lookAt(-1,0,9);};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function choose(index){active=pilots[index];event=active.transfer;plan=active.plan;mission=plan.missions[0];elapsed=mission.start-.3;playing=true;
 const r=mission.presentation;document.querySelector('#identity').textContent=plan.demonstration?`${plan.demonstration.label} · DEMO-PALLET · ${active.operator.id} · relógio industrial 0 h`:`${event.lotId} · ${event.product} · ${event.quantity} un · ${active.operator.id}`;
 document.querySelector('#timing').textContent=`Base ${r.baseSeconds.toFixed(2)} s → ciclo ${r.effectiveSeconds.toFixed(2)} s · compressão ${r.compressionFactor.toFixed(2)}× | aproximação ${r.before.toFixed(2)} s · carga ${r.loaded.toFixed(2)} s · retorno ${r.after.toFixed(2)} s`;
 for(const {p,g} of staged)g.visible=![event.fromPosition,event.toPosition].some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<.01);
 const mid=[(event.fromPosition[0]+event.toPosition[0])/2,(event.fromPosition[1]+event.toPosition[1])/2];camera.position.set(mid[0]+6,18,mid[1]+18);camera.lookAt(mid[0],0,mid[1]);render(elapsed);
}
const select=document.querySelector('#link');pilots.forEach((p,i)=>{const option=document.createElement('option');option.value=i;option.textContent=p.link;select.append(option);});select.onchange=()=>choose(Number(select.value));select.value=5;choose(5);
window.internalPreview={resume(){speed=1;playing=true;last=performance.now();},get plan(){return plan;},get event(){return event;},pilots,choose(index){select.value=index;choose(index);},seek(t){playing=false;elapsed=t;render(t);return {phase:sampleInternalTransport(plan,t).carriers[0]?.phase??'hidden'};}};
