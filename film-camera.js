import {FILM_TIMING as T} from './film-story.js';
import {sampleFilmActors} from './film-actors.js';
import {BREAKDOWN_SEQUENCE as BRK} from './film-highlights.js';
import {visualWindows,VISUAL_SHOTS} from './film-visuals.js';
import {DBR_LAYOUT,DBR_BAYS,DBR_PARKS,sampleRoute,routeLength} from './dbr-layout.js';
const EPS=1e-6,internal=new Set(['lap:rosq','rosq:buffer','buffer:m1','m1:m2','m2:insp']);
const mean=a=>[0,1].map(i=>a.reduce((n,p)=>n+p[i],0)/a.length);
export const CAMERA_CENTRES={overview:[0,-.5],office:[-13,7],rope:[-14.7,7.95],
 stock:mean(DBR_BAYS.stock),buffer:mean(DBR_BAYS.buffer),dispatch:mean(DBR_BAYS.dispatch),
 components:[-13.5,-.4],parking:mean(DBR_PARKS),
 'internal-transport':mean([...DBR_BAYS.m1,...DBR_BAYS.m2]),
 ...Object.fromEntries(Object.entries(DBR_LAYOUT).map(([id,rows])=>[id,mean(rows.map(p=>[p[0],p[2]]))]))};
// R2: educational presentation only. C1/D1 provide the actual shared cycle.
export const ACT2_DEMONSTRATION=Object.freeze({
 id:'ACT2-PALLET-JACK-DEMO',start:79,end:94.6,link:'lap>rosq',
 sourceBay:4,destinationBay:4,operatorId:'lap:1',carrierId:'jack-lap',
 educational:true,affectsIndustry:false,
 caption:'DEMONSTRAÇÃO · paleteira manual · Lapidação → Rosqueadora',
 span:32,cameraHeight:16,orbit:.55,introOrbit:-.55
});
export function sampleAct2Demonstration(t){
 const demo=ACT2_DEMONSTRATION;
 return t>=demo.start&&t<demo.end?{...demo,elapsed:t-demo.start,progress:(t-demo.start)/(demo.end-demo.start)}:null;
}
export const CAMERA_FLOW=['torno','us1','us2','lap','rosq','buffer','m1','m2','insp','dispatch'];
const flowPath=CAMERA_FLOW.map(id=>CAMERA_CENTRES[id]),flowLength=routeLength(flowPath);
export function sampleCameraFlow(t,start,end){
 const u=Math.max(0,Math.min(1,(t-start)/(end-start))),p=sampleRoute(flowPath,u);
 let distance=u*flowLength;
 for(let i=0;i<flowPath.length-1;i++){
  const length=Math.hypot(...flowPath[i+1].map((v,k)=>v-flowPath[i][k]));
  if(distance<=length+EPS)return {position:p.position,sector:CAMERA_FLOW[distance<length/2?i:i+1]};
  distance-=length;
 }
 return {position:p.position,sector:'dispatch'};
}
export function cameraFlowBoundaries(start,end){
 const cuts=[start];let distance=0;
 for(let i=0;i<flowPath.length-1;i++){
  const length=Math.hypot(...flowPath[i+1].map((v,k)=>v-flowPath[i][k]));
  cuts.push(start+(distance+length/2)/flowLength*(end-start));distance+=length;
 }
 return [...cuts,end];
}
export function physicalSector(load){
 if(!load)return 'overview';
 if(load.stage!=='transport')return load.stage==='truck'?'dispatch':load.stage;
 if(internal.has(`${load.from}:${load.to}`))return 'internal-transport';
 return load.to==='truck'||load.to==='dispatch'?'dispatch':load.from==='stock'?'stock':load.to;
}
export function speakerSector(speech,actor){
 if(['F14','F23'].includes(speech.id))return 'dispatch';
 // A moving operator is classified by the physical position, not their job title.
 const choices=['office','lap','m1','stock','rosq','buffer','m2','insp','components'];
 return choices.reduce((best,id)=>Math.hypot(...actor.position.map((v,i)=>v-CAMERA_CENTRES[id][i]))<
  Math.hypot(...actor.position.map((v,i)=>v-CAMERA_CENTRES[best][i]))?id:best,'office');
}
const themes=[
 ['buffer','internal-transport','m2','insp','rosq','components','torno','us1','us2','lap','overview'],
 ['overview','components','buffer','lap','us1','us2','insp','internal-transport','m2','torno','rosq'],
 ['overview','stock','torno','us1','us2','internal-transport','m2','insp','components','lap','buffer'],
 ['internal-transport','rosq','buffer','m1','insp','components','us2','torno','us1','m2','overview'],
 ['overview','rosq','buffer','lap','internal-transport','insp','components','us1','us2','m2','torno'],
 ['components','m1','internal-transport','m2','insp','lap','us2','us1','torno','buffer','overview'],
 ['m2','internal-transport','insp','parking','components','torno','us1','us2','lap','buffer','overview'],
 ['torno','us1','us2','lap','rosq','buffer','m1','m2','insp','internal-transport','overview','components']
];
export function selectCameraEvent(events,t,used=new Set()){
 return events.filter(e=>!used.has(e.id)&&e.t<=t+EPS&&t<e.expiresAt-EPS)
  .sort((a,b)=>b.priority-a.priority||a.t-b.t)[0]??null;
}
export function buildCameraCues({story,tracked,priorities}){
 const cues=[];
 const add=(t,end,data)=>{if(end<=t+EPS)return;const n=Math.ceil((end-t-EPS)/10);
  for(let i=0;i<n;i++)cues.push({id:`TAKE-${cues.length+1}`,t:t+(end-t)*i/n,duration:(end-t)/n,
   target:'overview',sector:'overview',type:'geral',speaker:null,caption:'GAMA · linha de personalizados',
   cameraHeight:35,transitionSeconds:1.2,orbit:.7,...data});};
 const fixedSpeech=s=>({target:['F14','F23'].includes(s.id)?'dispatch':s.sector,
  sector:['F14','F23'].includes(s.id)?'dispatch':s.sector,type:'close',speaker:s.speaker,speechId:s.id,
  caption:`${s.speaker} · ${s.id}`,cameraHeight:12});
 function outside(lo,hi){
  const fixed=[...story.speeches.filter(s=>s.start>=lo&&s.start<hi).map(s=>({t:s.start,end:s.end,data:fixedSpeech(s)})),
   ...story.walks.filter(w=>w.start>=lo&&w.start<hi).map(w=>({t:w.start,end:w.end,data:{target:w.sector,sector:w.sector,type:'travelling',followTour:true,caption:'Rafael e Ricardo · conhecendo o fluxo',cameraHeight:18}}))].sort((a,b)=>a.t-b.t);
  let t=lo;
  for(const c of fixed){
   // Keep the previous composition across the 0.4 s dialogue pauses.
   const prior=cues.at(-1),gap=c.t-t;
   if(gap>EPS&&gap<4&&prior&&prior.t+prior.duration===t&&prior.duration+gap<=10)prior.duration+=gap;
   else add(t,c.t,{target:lo>=510?'office':'overview',sector:lo>=510?'office':'overview'});
   add(c.t,c.end,c.data);t=c.end;
  }
  const prior=cues.at(-1),gap=hi-t;
  if(gap>EPS&&gap<4&&prior&&prior.duration+gap<=10)prior.duration+=gap;
  else add(t,hi,{target:lo===510?'office':'overview',sector:lo===510?'office':'overview'});
 }
 outside(0,25);outside(25,75);outside(75,135);
 // Keep the existing shot boundaries, speakers and tour positions. Only widen
 // the compositions shared with the slow demonstration in the same workspace.
 for(const cue of cues.filter(c=>c.t>=ACT2_DEMONSTRATION.start-EPS&&c.t<ACT2_DEMONSTRATION.end-EPS)){
  Object.assign(cue,{demonstrationId:ACT2_DEMONSTRATION.id,span:ACT2_DEMONSTRATION.span,
   cameraHeight:ACT2_DEMONSTRATION.cameraHeight,orbit:cue.speechId==='F07'?ACT2_DEMONSTRATION.introOrbit:ACT2_DEMONSTRATION.orbit,caption:ACT2_DEMONSTRATION.caption});
 }
 const usedEvents=new Set(),weeklyBudgets=[];
 for(let w=0;w<8;w++){
  const lo=135+w*T.weekSeconds,hi=lo+T.weekSeconds,budget=new Map(),reserved=[];
  const charge=(sector,d)=>budget.set(sector,(budget.get(sector)||0)+d);
  for(const s of story.speeches.filter(s=>s.start>=lo&&s.start<hi)){
   const actor=sampleFilmActors((s.start+s.end)/2,s)[s.speaker];
   const sector=speakerSector(s,actor);
   reserved.push({t:s.start,end:s.end,data:{...fixedSpeech(s),sector,target:sector}});charge(sector,s.end-s.start);
  }
  if(w===0&&tracked){
   const start=reserved[0].end,arrival=tracked.timeline.find(e=>e.kind==='transfer'&&e.to==='m2');
   if(arrival&&arrival.end>start){
    // Follow through complete transfers. This window is <10 s in the baseline.
    const end=Math.min(arrival.end,reserved[1].t);
    reserved.push({t:start,end,data:{target:'tracked',type:'seguir-pallet',sector:'internal-transport',cameraHeight:7,caption:`${tracked.id} · do pulmão à célula de montagem`}});
    // Reserve actual dwell time, including process and buffer stops.
    for(let t=start;t<end;t+=.01){const tr=tracked.timeline.find(e=>e.kind==='transfer'&&e.start<=t&&e.end>t),p=tracked.timeline.find(e=>e.kind==='process'&&e.start<=t&&e.end>t);
     charge(tr?internal.has(`${tr.from}:${tr.to}`)?'internal-transport':tr.to:p?.station??'buffer',Math.min(.01,end-t));}
   }
  }
  if(w===7){
   const start=reserved.at(-1).end,end=start+22,cuts=cameraFlowBoundaries(start,end);
   for(let i=0;i<cuts.length-1;i++)charge(sampleCameraFlow((cuts[i]+cuts[i+1])/2,start,end).sector,cuts[i+1]-cuts[i]);
   reserved.push({t:start,end,data:{target:'flow',sector:'overview',type:'travelling',flowStart:start,flowEnd:end,cameraHeight:19,caption:'S8 · da Tornearia à Expedição'}});
  }
  reserved.sort((a,b)=>a.t-b.t);
  // A small post-roll may make the next composition a full four seconds,
  // provided the same physical sector still fits its weekly allowance.
  const cap=T.weekSeconds*.15;
  for(let i=0;i<reserved.length-1;i++){
   const r=reserved[i],gap=reserved[i+1].t-r.end,extra=gap-cap;
   if(r.data.speechId&&gap>cap&&gap<8&&r.end-r.t+extra<=10&&(budget.get(r.data.sector)||0)+extra<=cap){
    r.end+=extra;charge(r.data.sector,extra);
   }
  }
  const limit=id=>id==='stock'&&w!==2?T.weekSeconds*.08:id==='dispatch'?T.weekSeconds*.12:T.weekSeconds*.15;
  let collectionShown=reserved.some(c=>c.data.sector==='dispatch'||c.data.target==='flow');
  function fill(start,end){
   const length=end-start;if(length<EPS)return;
   const n=Math.max(1,Math.ceil(length/(T.weekSeconds*.15)),Math.min(Math.ceil(length/6),Math.floor(length/4)||1));
   for(let i=0;i<n;i++){
    const t=start+length*i/n,d=length/n;
    const eligibleVisit=priorities.some(e=>e.target==='dispatch'&&!usedEvents.has(e.id)&&e.t<=t&&t<e.expiresAt);
    const pool=[...themes[w],...(!collectionShown&&eligibleVisit?['dispatch']:[])];
    const candidates=pool.filter(id=>(budget.get(id)||0)+d<=limit(id)+EPS);
    const events=priorities.filter(e=>candidates.includes(e.target)&&(!collectionShown||e.target!=='dispatch'));
    const event=selectCameraEvent(events,t,usedEvents);
    let target=event?.target??candidates.find(id=>!budget.has(id))??candidates.sort((a,b)=>(budget.get(a)||0)-(budget.get(b)||0))[0];
    // Dispatch is only eligible for a real visit, stock only for a real replenishment.
    if(!target)throw new Error(`No camera budget in S${w+1} at ${t}`);
    if(event){usedEvents.add(event.id);if(target==='dispatch')collectionShown=true;}
    const type=target==='overview'?'geral':target==='internal-transport'?'travelling':'close';
    add(t,t+d,{target,sector:target,type,cameraHeight:type==='geral'?35:type==='travelling'?9:14,orbit:[.45,.7,.95][cues.length%3],
     ...(event?{eventId:event.id,priority:event.priority}:{}),
     caption:event?.caption??`S${w+1} · ${target==='internal-transport'?'movimentação interna de pallets':target.toUpperCase()}`,
     ...(d<4?{boundaryFragment:true}:{}),});charge(target,d);
   }
  }
  let t=lo;for(const r of reserved){fill(t,r.t);add(r.t,r.end,r.data);t=r.end;}fill(t,hi);
  weeklyBudgets.push(budget);
 }
 // Week boundaries are reporting boundaries, not mandatory camera cuts.
 // Borrow a fraction of a second from a preceding non-tracked shot when safe.
 for(let i=1;i<cues.length;i++){
  const c=cues[i],p=cues[i-1],w=Math.round((c.t-135)/T.weekSeconds),extra=4-c.duration;
  if(w<=0||w>=8||Math.abs(c.t-(135+w*T.weekSeconds))>EPS||extra<=EPS||extra>=1||p.target==='tracked'||p.duration-extra<4)continue;
  const budget=weeklyBudgets[w-1],cap=c.sector==='dispatch'?T.weekSeconds*.12:c.sector==='stock'&&w-1!==2?T.weekSeconds*.08:T.weekSeconds*.15;
  if((budget.get(c.sector)||0)+extra>cap)continue;
  p.duration-=extra;c.t-=extra;c.duration+=extra;delete c.boundaryFragment;
 }
 outside(510,580);outside(580,600);
 return cues.sort((a,b)=>a.t-b.t);
}

export const MEETING_SHOT=Object.freeze({position:[-13,7],span:14,cameraHeight:12,orbit:.55});
// Presentation cues use the editorial clock; industrial samplers keep source time.
export function buildEditorialCues({story,clock,selection}){
 const cues=[],add=(t,end,data)=>{if(end>t)cues.push({id:data?.tripId?`TRUCK-${data.tripId}`:`EDITORIAL-${cues.length}`,t,duration:end-t,target:'overview',sector:'overview',type:'geral',span:77,cameraHeight:53,orbit:.12,transitionSeconds:1.2,caption:'Vista aérea · fluxo da fábrica',...data});};
 const fixed=story.speeches.map(s=>({start:s.start,end:s.end,data:{speaker:s.speaker,speechId:s.id,target:s.sector,sector:s.sector,type:'close',span:18,cameraHeight:14,orbit:.55,caption:`${s.speaker} · ${s.id}`}}));
 for(const w of story.walks)fixed.push({start:w.start,end:w.end,data:{followTour:true,target:w.sector,sector:w.sector,type:'travelling',span:32,cameraHeight:18,orbit:.55,caption:'Conhecendo o fluxo'}});
 for(const stage of selection.highlights[2].stages)fixed.push({start:clock.inverse(stage.start),end:clock.inverse(stage.end),data:{target:stage.station,sector:stage.station,type:'close',span:25,cameraHeight:18,orbit:.55,caption:`Segunda corda · ${stage.id}`}});
 fixed.push({start:clock.inverse(135+520*375/960),end:clock.inverse(135+536*375/960),data:{target:'rosq',sector:'rosq',type:'close',span:25,cameraHeight:18,caption:'EVENTO DE VARIABILIDADE · Rosqueadora parada 16 h'}});
 const m=selection.mission;
 fixed.push({start:clock.inverse(m.pickupStart)-1.2,end:clock.inverse(m.transfer.end)+.2,data:{target:'tracked',sector:'internal-transport',type:'seguir-pallet',span:25,cameraHeight:18,orbit:.3,caption:`${m.transfer.lotId} · retirada, transporte e colocação`,transportId:m.transfer.id}});
 const truck=selection.truck;
 fixed.push({start:clock.inverse(truck.arrivalAt)-1.2,end:clock.inverse(truck.exitAt),data:{target:'truck',sector:'dispatch',type:'travelling',span:60,cameraHeight:35,orbit:-.65,caption:`${truck.id} · entrada, manobra, carregamento e saída`,tripId:truck.id}});
 const journey=selection.journey?[clock.inverse(selection.journey[0]),clock.inverse(selection.journey[1])+1.5]:null;
 const breakdown=[clock.inverse(135+BRK.fromHours*375/960),clock.inverse(135+BRK.toHours*375/960)];
 const visuals=visualWindows(story);
 const firstResult=story.speeches.filter(s=>s.start>=story.windows.results[0]).sort((a,b)=>a.start-b.start)[0],resultsRoom=Math.max(story.windows.results[0],(firstResult?.start??story.windows.results[0])-2);
 const cuts=[...new Set([0,600,resultsRoom,...visuals.flatMap(v=>[v.start,v.end]),...breakdown,...(journey||[]),...story.windows.demonstration,...fixed.flatMap(f=>[Math.max(0,f.start),Math.min(600,f.end)]),...Array.from({length:150},(_,i)=>i*4)])].sort((a,b)=>a-b);
 for(let i=0;i<cuts.length-1;i++){
  const t=cuts[i],end=cuts[i+1],active=fixed.filter(f=>t>=f.start&&t<f.end),speech=active.find(f=>f.data.speaker),transport=active.find(f=>f.data.transportId||f.data.tripId);
  let data=(speech||transport||active[0])?.data;
  if(transport?.data.tripId&&speech)data={...transport.data,speaker:speech.data.speaker,speechId:speech.data.speechId};
  if(t>=story.windows.exit[0]&&t<story.windows.exit[1])data={target:'exit',sector:'office',type:'travelling',span:35,cameraHeight:23,orbit:.5,caption:'Equipe GAMA · saída da reunião'};
  if(!data&&t>=story.windows.production[0]&&t<story.windows.production[1])data={accelerated:true,visibleSectors:CAMERA_FLOW.concat('components'),caption:'TEMPO ACELERADO · oito semanas em operação'};
  // Plano-sequência: one continuous take locked on the tracked Z3 pallet.
  if(journey&&t>=journey[0]-EPS&&t<journey[1])data={...(data?.speaker?{speaker:data.speaker,speechId:data.speechId}:{}),target:'tracked',sector:'journey',type:'plano-sequencia',followTracked:true,...(data?.speaker?{}:{transportId:selection.mission.transfer.id}),span:17,cameraHeight:13,orbit:.62,transitionSeconds:1.2,caption:`Plano-sequência · ${selection.tracked.id} · do supermercado ao caminhão`};
  // Quebra da Rosqueadora: one wide composition of Rosqueadora, pulmão and tambor.
  if(t>=breakdown[0]-EPS&&t<breakdown[1])data={...(data?.speaker?{speaker:data.speaker,speechId:data.speechId}:{}),target:'buffer',sector:'buffer',type:'sequencia-quebra',fixedPosition:BRK.position,span:BRK.span,cameraHeight:BRK.cameraHeight,orbit:BRK.orbit,transitionSeconds:1.4,caption:'Quebra da Rosqueadora · o pulmão protege o tambor'};
  // Visual highlights of the 3D model (presentation only).
  {const v=visuals.find(v=>t>=v.start-EPS&&t<v.end);if(v){const shot=VISUAL_SHOTS[v.id];data={...(data?.speaker?{speaker:data.speaker,speechId:data.speechId}:{}),sector:shot.sector,...shot,visualId:v.id,transitionSeconds:1.3,...(v.id==='drone'?{flowStart:v.start,flowEnd:v.end}:{})};}}
  // Ato 1: a single fixed composition of the meeting room from the first line
  // until Rafael leaves. Speakers are marked by their ring, not by cuts.
  // Results: a flyover of the plant with the closing report, arriving in the
  // room just before the first line, so the meeting never sits in silence.
  if(t>=story.windows.results[0]&&t<resultsRoom)data={target:'overview',sector:'overview',type:'geral',fixedPosition:CAMERA_CENTRES.overview,span:62,cameraHeight:45,orbit:.62,transitionSeconds:1.5,caption:'Fechamento · oito semanas de operação'};
  if((t>=story.windows.problem[0]&&t<(story.walks[0]?.start??story.windows.problem[1]))||(t>=resultsRoom&&t<story.windows.exit[0]))data={...(data?.speaker?{speaker:data.speaker,speechId:data.speechId}:{}),target:'office',sector:'office',type:'geral-sala',fixedPosition:MEETING_SHOT.position,span:MEETING_SHOT.span,cameraHeight:MEETING_SHOT.cameraHeight,orbit:MEETING_SHOT.orbit,transitionSeconds:1.2,caption:'Sala de reunião · Comercial, Diretoria e PCP'};
  if(t>=story.windows.demonstration[0]&&t<story.windows.demonstration[1])data={...data,demonstrationId:ACT2_DEMONSTRATION.id,span:32,cameraHeight:16,orbit:data?.speechId==='F07'?-.55:.55,caption:ACT2_DEMONSTRATION.caption};
  add(t,end,data);
 }
 // Adjacent pieces from the same followed action form one uninterrupted take.
 const merged=[];for(const c of cues){const p=merged.at(-1);if(p&&p.t+p.duration===c.t&&JSON.stringify({...p,id:null,t:null,duration:null})===JSON.stringify({...c,id:null,t:null,duration:null}))p.duration+=c.duration;else merged.push(c);}
 return merged;
}
