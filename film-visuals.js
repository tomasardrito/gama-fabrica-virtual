// Visual highlights of the 3D model. They are presentation-only: none of them
// changes the industrial schedule. Windows are anchored to the real speeches.
import {sampleRoute,DBR_LAYOUT,dbrStationAccessRoute,dbrWorkStand} from './dbr-layout.js';
export const ROPE_PATH=[[-1.78,7.75],[-6,9.4],[-12,10.6],[-15.3,10.95],[-11,6],[2,-2.5],[10.75,-6.45]];
export const BUFFER_BOARD=Object.freeze({position:[-8.3,.15],rotation:.55,width:2.8,height:1.25,y:1.55});
export const DEFECT_PATH=[[12.95,8.9],[12.95,10.2],[15.6,10.2]];
export const ABRASIVES=[['ÓXIDO DE ALUMÍNIO','Z'],['CARBETO DE SILÍCIO','Z1'],['DIAMANTE','Z2']];
const speech=(story,id)=>story.speeches.find(s=>s.id===id);
export function visualWindows(story){
 const w=[],add=(id,start,end,data)=>{if(Number.isFinite(start)&&end>start)w.push({id,start,end,...data});};
 const f15=speech(story,'F15'),f16=speech(story,'F16'),f17=speech(story,'F17'),f21=speech(story,'F21'),f24=speech(story,'F24');
 if(f16)add('quadro-pulmao',f16.end+1,f16.end+9,{});
 if(f17)add('abrasivo',f17.start-1.5,f17.end+2.5,{});
 // Drone: the whole line is presented right after "Vamos ver oito semanas", before the S1.
 const f12=speech(story,'F12');if(f12&&story.windows.production[0]-.2-(f12.end+.6)>=4)add('drone',f12.end+.6,story.windows.production[0]-.2,{});
 return w;
}
export function sampleVisual(windows,t){
 const v=windows.find(v=>t>=v.start&&t<v.end);
 return v?{id:v.id,progress:(t-v.start)/(v.end-v.start),start:v.start,end:v.end}:null;
}
export function ropeCardPosition(progress){return sampleRoute(ROPE_PATH,Math.max(0,Math.min(1,progress))).position;}
export const VISUAL_SHOTS={
 corda:{type:'corda',target:'rope',sector:'rope',span:24,cameraHeight:17,orbit:.55,caption:'A corda · o tambor autoriza a próxima liberação'},
 'quadro-pulmao':{type:'quadro-pulmao',target:'buffer',sector:'buffer',fixedPosition:[-7.9,-.4],span:10.5,cameraHeight:8,orbit:.55,caption:'Gestão visual do pulmão'},
 abrasivo:{type:'abrasivo',target:'lap',sector:'lap',fixedPosition:[10.75,-6.1],span:12,cameraHeight:10,orbit:.55,caption:'Personalização · troca de abrasivo na Lapidação'},
 refugo:{type:'refugo',target:'insp',sector:'insp',fixedPosition:[13.6,8.8],span:12,cameraHeight:10,orbit:.55,caption:'Inspeção · peça reprovada vai para retrabalho'},
 drone:{type:'drone',target:'flow',sector:'overview',span:15,cameraHeight:10,orbit:.55,caption:'Vista de drone · a linha de personalizados'}
};
export function visualCaption(v){
 if(!v)return null;
 if(v.id==='corda')return {sector:'A CORDA · SINAL DO TAMBOR',detail:v.progress<.45?'A Montagem 1 consumiu um lote do pulmão: o cartão volta ao PCP':v.progress<.6?'PCP recebe o cartão: libera exatamente um novo lote':'O novo lote entra na Lapidação · nada é empurrado sem sinal do tambor'};
 if(v.id==='quadro-pulmao')return {sector:'GESTÃO VISUAL DO PULMÃO',detail:'Verde: segue o plano · Amarelo: prioridade · Vermelho: ação imediata (faixas do DBR Personalizado)'};
 if(v.id==='abrasivo'){const a=ABRASIVES[Math.min(2,Math.floor(v.progress*3))];return {sector:'PERSONALIZAÇÃO · LAPIDAÇÃO',detail:`Mesmo corpo genérico, abrasivo diferente: ${a[0].toLowerCase()} → ${a[1]} (ilustrativo)`};}
 if(v.id==='refugo')return {sector:'INSPEÇÃO · QUALIDADE',detail:'Taxa de defeitos da Inspeção: 1% (Tabela 2) · a peça reprovada sai do fluxo para retrabalho (ilustrativo)'};
 if(v.id==='drone')return {sector:'VISTA DE DRONE',detail:'A linha de personalizados, da Tornearia à Expedição · pronta para as oito semanas'};
 return null;
}
// Three.js props, driven by the snapshot each frame.
export function createVisualProps({world,THREE,textSprite,floatingSigns}){
 const keep=sp=>{const i=floatingSigns.indexOf(sp);if(i>=0)floatingSigns.splice(i,1);sp.renderOrder=10;sp.material.depthTest=false;return sp;};
 const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.6});
 const mesh=(g,w,h,d,c,x=0,y=0,z=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;};
 // Rope card
 const card=new THREE.Group();card.visible=false;world.add(card);mesh(card,.62,.04,.42,0xf2c14e);mesh(card,.5,.045,.08,0x3d2f08,0,.003,-.08);
 const cardTag=keep(textSprite('CARTÃO DA CORDA · 1 LOTE',3.4,'#3d2f08','#f2c14e',80));cardTag.position.y=.75;card.add(cardTag);
 // Buffer board (always on the shop floor)
 const B=BUFFER_BOARD,board=new THREE.Group();board.position.set(B.position[0],0,B.position[1]);board.rotation.y=B.rotation;world.add(board);
 mesh(board,.08,B.y,.08,0x5d6f78,-B.width/2+.2,B.y/2,0);mesh(board,.08,B.y,.08,0x5d6f78,B.width/2-.2,B.y/2,0);
 mesh(board,B.width+.12,B.height+.12,.06,0x2c4450,0,B.y+B.height/2,-.02);
 const zones=[[0xc9564a,.35],[0xe2b544,.35],[0x5fb27a,.30]];let x=-B.width/2+.1;const usable=B.width-.2;
 for(const [c,f] of zones){mesh(board,usable*f,.34,.03,c,x+usable*f/2,B.y+.42,.03);x+=usable*f;}
 const marker=mesh(board,.06,.6,.05,0xffffff,0,B.y+.42,.06);
 const boardTitle=keep(textSprite('PULMÃO · GESTÃO VISUAL',2.6,'#f2f6ef','#2c4450',78));boardTitle.position.set(0,B.y+B.height+.35,0);board.add(boardTitle);
 let boardValue=keep(textSprite('3.571 un · VERDE',2.4,'#24382f','#e8f3ec',80));boardValue.position.set(0,B.y+.98,.05);board.add(boardValue);let boardKey='';
 // Defect crate
 const crate=new THREE.Group();crate.visible=false;world.add(crate);mesh(crate,.5,.4,.5,0xc9564a,0,.2,0);
 const crateTag=keep(textSprite('PEÇA REPROVADA · 1%',2.6,'#ffffff','#a8473d',80));crateTag.position.y=.95;crate.add(crateTag);
 const rework=keep(textSprite('RETRABALHO',2.2,'#ffffff','#a8473d',80));rework.position.set(DEFECT_PATH.at(-1)[0]+.6,1.9,DEFECT_PATH.at(-1)[1]);rework.visible=false;world.add(rework);
 // Abrasive sign over the Lapidação
 const abrasive=new THREE.Group();abrasive.position.set(10.75,0,-6.45);abrasive.visible=false;world.add(abrasive);let abrasiveKey='',abrasiveTag=null;
 function update(s){
  const v=s?.film?.visual,t=s?.film?.presentationTime??0,dbr=s?.mode==='dbr';
  board.visible=dbr;
  if(dbr){const units=s.buffer?.units??0,f=Math.max(0,Math.min(1,units/3571.3)),zone=units>=2500?'VERDE':units>=1250?'AMARELO':'VERMELHO';marker.position.x=-B.width/2+.1+usable*f;
   const key=`${Math.round(units/50)*50}|${zone}`;
   if(key!==boardKey){board.remove(boardValue);boardValue.material.map?.dispose();boardValue.material.dispose();boardValue=keep(textSprite(`${(Math.round(units/50)*50).toLocaleString('pt-BR')} un · ${zone}`,2.4,'#24382f',zone==='VERDE'?'#e8f3ec':zone==='AMARELO'?'#fbefc8':'#f6d6d2',80));boardValue.position.set(0,B.y+.98,.05);board.add(boardValue);boardKey=key;}
  }
  card.visible=v?.id==='corda';if(card.visible){const p=ropeCardPosition(v.progress);card.position.set(p[0],2.1+.25*Math.sin(v.progress*Math.PI),p[1]);card.rotation.y=t*2;}
  crate.visible=v?.id==='refugo';rework.visible=crate.visible;if(crate.visible){const u=Math.max(0,Math.min(1,(v.progress-.15)/.7)),p=sampleRoute(DEFECT_PATH,u).position;crate.position.set(p[0],0,p[1]);crateTag.visible=u<.8;rework.visible=u>=.8;}
  abrasive.visible=v?.id==='abrasivo';if(abrasive.visible){const a=ABRASIVES[Math.min(2,Math.floor(v.progress*3))],key=a[0];if(key!==abrasiveKey){if(abrasiveTag)abrasive.remove(abrasiveTag);abrasiveTag=keep(textSprite(`ABRASIVO: ${a[0]} → ${a[1]}`,3.6,'#2b2350','#e6e1ff',78));abrasiveTag.position.set(1.4,2.35,.6);abrasive.add(abrasiveTag);abrasiveKey=key;}}
 }
 return {update};
}

// Plano-sequência: the operator really loads the tracked lot into each machine
// and returns it to the pallet. Presentation-only override of the sampled
// handling; the industrial schedule and the other lots are untouched.
const clampU=x=>Math.max(0,Math.min(1,x)),mixP=(a,b,u)=>a.map((v,i)=>v+(b[i]-v)*clampU(u));
const towards=(a,b)=>{const d=Math.hypot(b[0]-a[0],b[1]-a[1]);return d>1e-7?[(b[0]-a[0])/d,(b[1]-a[1])/d]:[0,-1];};
const processCache=new WeakMap();
export const JOURNEY_HANDLING=Object.freeze({carryIn:.3,carryOut:.3});
export function applyJourneyHandling(s,handling){
 const id=s?.film?.journey?s.film.trackedLotId:null,load=id&&handling?.loads?.get(id);if(!load)return handling;
 let list=processCache.get(s.timeline);if(!list){list=s.timeline.filter(e=>e.kind==='process');processCache.set(s.timeline,list);}
 const t=handling.elapsed,p=list.find(e=>e.lotId===id&&t>=e.start&&t<e.end&&DBR_LAYOUT[e.station]);if(!p)return handling;
 const station=p.station,idx=p.machineIndex||0,f=DBR_LAYOUT[station][idx]||DBR_LAYOUT[station][0],a=(t-p.start)/(p.end-p.start);
 const pallet=[load.position[0],(load.palletY??.05)+.25,load.position[1]],route=dbrStationAccessRoute(station,idx,load.position),work=dbrWorkStand(station,idx);
 const {carryIn:ci,carryOut:co}=JOURNEY_HANDLING,key=`${station}:${idx}`;
 // The part is carried in front of the body, facing the walking direction:
 // picked up in the first 15% of the carry and set down in the last 15%.
 let part,location,phaseKey=null,u=0,c=0,position=null,direction=null;
 const held=(pos,dir)=>[pos[0]+dir[0]*.45,1.05,pos[1]+dir[1]*.45],ease=x=>{x=clampU(x);return x*x*(3-2*x);};
 if(a<ci||a>=1-co){
  const carryIn=a<ci;c=carryIn?a/ci:(a-(1-co))/co;u=carryIn?1-c:c;phaseKey=carryIn?'station_carry_in':'source_carry_out';location='hands';
  position=sampleRoute(route,clampU(u)).position;
  const from=carryIn?pallet:f,to=carryIn?f:pallet,goal=carryIn?[f[0],f[2]]:[pallet[0],pallet[2]];
  let toGoal=towards(position,goal);if(Math.hypot(goal[0]-position[0],goal[1]-position[1])<.35)toGoal=towards(position,[to[0],to[2]]);
  const toSource=towards(position,[from[0],from[2]]),w=ease((c-.1)/.15),blend=[toSource[0]*(1-w)+toGoal[0]*w,toSource[1]*(1-w)+toGoal[1]*w],len=Math.hypot(...blend);
  direction=len>1e-6?[blend[0]/len,blend[1]/len]:toGoal;
  const hands=held(position,direction);
  part=c<.15?mixP(from,hands,ease(c/.15)):c>.85?mixP(hands,to,ease((c-.85)/.15)):hands;
 }
 else {part=[...f];location='machine';}
 Object.assign(load,{partPosition:part,partLocation:location,stationId:station,machineIndex:idx,partStage:a<1-co?(PREVIOUS_STAGE[station]??station):station});
 handling.machineOccupants?.set(key,id);if(idx===0)handling.machineOccupants?.set(station,id);
 if(phaseKey){
  const pose={stationId:station,machineIndex:idx,position,direction,distance:Math.hypot(position[0]-work[0],position[1]-work[1]),carrying:true};
  const action={id:`JOURNEY-${id}`,kind:'station',stationId:station,machineIndex:idx,batchId:load.batchId,lotId:id,phaseKey,phaseProgress:c,operatorPosition:position,operatorDirection:direction,operatorDistance:pose.distance,partPosition:part,partLocation:'hands',fixture:f,workStand:work};
  handling.operators.set(key,pose);handling.stationActions.set(key,action);if(idx===0){handling.operators.set(station,pose);handling.stationActions.set(station,action);}
 }
 return handling;
}

// A supervisor or operator who is speaking stands at his post for the line
// instead of sprinting through compressed missions; he resumes afterwards.
const SPEAKING_POSTS={Jorge:['m1:0','m1'],André:['lap:0','lap']};
export function pinSpeakingOperators(s,handling){
 const ids=s?.film?.act==='weeks'&&SPEAKING_POSTS[s.film.speech?.speaker];if(!ids||!handling)return handling;
 for(const id of ids){handling.operators?.delete(id);handling.stationActions?.delete(id);}
 return handling;
}

// The part keeps the look of the last finished operation until the current
// machine has finished with it (the pallet arriving does not transform it).
export const PREVIOUS_STAGE={lap:'stock',rosq:'lap',buffer:'rosq',m1:'rosq',m2:'m1',insp:'m2'};
const processIndex=new WeakMap();
export function finishedStageAppearance(s,handling){
 if(!s?.timeline||!handling?.loads)return handling;
 let index=processIndex.get(s.timeline);
 if(!index){index=new Map(s.timeline.filter(e=>e.kind==='process').map(e=>[`${e.lotId}:${e.station}`,e]));processIndex.set(s.timeline,index);}
 const t=handling.elapsed;
 for(const [id,load]of handling.loads){
  const station=load.stage,p=PREVIOUS_STAGE[station]&&index.get(`${id}:${station}`);
  if(p&&t<p.end)load.partStage=PREVIOUS_STAGE[station];
 }
 return handling;
}
