import {DbrSimulation,DBR_PARAMETERS as P,dbrScreen} from './dbr-simulation.js';
import {createEditorialClock,selectFilmHighlights} from './film-highlights.js';
import {sampleLogisticsTruck} from './logistics-motion.js';
import {MPS_PLAN} from './mps-simulation.js';
import {FILM_EXCEL as X} from './film-excel.js';
import {FILM_TIMING as T,createFilmStory} from './film-story.js';
import {sampleDbrHandling} from './dbr-handling.js';
import {transferProgress} from './dbr-presentation.js';
import {sampleRoute,DBR_LAYOUT} from './dbr-layout.js';
import {CAMERA_CENTRES as centres,buildCameraCues,buildEditorialCues,physicalSector,speakerSector,sampleCameraFlow,sampleAct2Demonstration} from './film-camera.js';
import {sampleFilmActors} from './film-actors.js';
import {visualWindows,sampleVisual,ropeCardPosition} from './film-visuals.js';
const sum=a=>a.reduce((n,x)=>n+x,0),EPS=1e-6;
function reportsFor(S){return MPS_PLAN.map((plan,i)=>{const lo=i*120,hi=(i+1)*120,trips=S.trips.filter(t=>t.scheduledHours>lo&&t.scheduledHours<=hi),issuedAt=Math.max(dbrScreen(hi),...trips.map(t=>t.departAt)),endHours=hi+(issuedAt-dbrScreen(hi))*120/P.weekSeconds;
 const ledger=S.bufferLedger.filter(e=>e.hours>=lo&&e.hours<=hi),before=S.bufferLedger.filter(e=>e.hours<=lo).at(-1)?.units??3500,points=[{hours:lo,units:before},...ledger,{hours:hi,units:S.bufferLedger.filter(e=>e.hours<=hi).at(-1)?.units??before}];
 const inspected=S.lots.filter(l=>!l.initial&&!l.preloaded&&!l.protection&&l.inspectionHours>lo&&l.inspectionHours<=hi),observed=inspected.map(l=>(l.inspectionHours-l.releasedHours)/24),busy=sum(S.lots.filter(l=>!l.protection&&l.m1StartHours!=null).map(l=>Math.max(0,Math.min(hi,l.m1EndHours)-Math.max(lo,l.m1StartHours)))),backlog=sum(S.lots.filter(l=>!l.protection&&l.dueHours<=hi&&l.shippedAt>issuedAt+EPS).map(l=>l.quantity));
 return {week:i+1,issuedAt,planned:plan.planned,shipped:sum(trips.map(t=>t.quantity)),backlog,demandShipped:sum(S.lots.filter(l=>l.week===i+1&&l.shippedAt<=issuedAt).map(l=>l.quantity)),occupancyPlanned:X.plannedOccupancy[i],occupancyActual:busy/120,buffer:{min:Math.min(...points.map(p=>p.units)),max:Math.max(...points.map(p=>p.units)),points},ropeLots:S.ropeCards.filter(c=>c.hours>lo-EPS&&c.hours<=hi).length,collections:trips.length,pallets:sum(trips.map(t=>t.pallets)),bodies:{generic:S.bodySupply.jobs.filter(j=>j.body==='generic'&&j.triggerHours>=lo&&j.triggerHours<hi).length,z3:S.bodySupply.jobs.filter(j=>j.body==='z3'&&j.triggerHours>=lo&&j.triggerHours<hi).length},leadMean:observed.length?sum(observed)/observed.length:null,leadPlanned:X.lead,components:X.components.map(row=>row[i]),sources:X.sources,endHours};});}
function buildFilm(S,options={}){
 const story=createFilmStory(options),selection=selectFilmHighlights(S),clock=createEditorialClock(S,selection,options.audioDurations);
 // Speeches follow the uniform clock. When a trigger arrives while the previous
 // speech is still on screen, the new one starts right after it (F20 → F19).
 let nextFree=-Infinity;
 for(const trigger of selection.triggers)nextFree=story.addWeekly(trigger.id,Math.max(clock.inverse(trigger.operationTime),nextFree));
 if(nextFree>story.windows.results[0]+9)throw new Error('Falas da produção invadem o Ato 4.');
 story.speeches.sort((a,b)=>a.start-b.start);
 const reports=reportsFor(S).map(r=>({...r,operationIssuedAt:r.issuedAt,issuedAt:clock.inverse(r.issuedAt)}));
 for(const h of selection.highlights.filter(h=>h.block==='results')){const speech=story.speeches.find(s=>s.id===(h.id==='H09'?'F27':'F28'));h.presentation=[speech.start,speech.end];h.operation=h.presentation.map(t=>clock.sample(t).sourceTime);}
 return {story,clock,selection,visuals:visualWindows(story),cues:buildEditorialCues({story,clock,selection}),reports,trackedLotId:selection.tracked.id};
}
const JOURNEY_STEPS=[['stock','Supermercado de corpos'],['lap','Lapidação · personalização'],['rosq','Rosqueadora'],['buffer','Pulmão · espera protegendo o tambor'],['m1','Montagem 1 · tambor'],['m2','Montagem 2'],['insp','Inspeção'],['dispatch','Doca de expedição'],['truck','No caminhão']];
// Quebra da Rosqueadora: real buffer and drum from the schedule; the
// no-buffer counter is the Excel scenario B (Simulação DBR) on the same clock.
export function breakdownStatus(s){
 const h=s.dbr?.workHours??0,start=s.breakdown?.start??520,end=s.breakdown?.end??536,B=X.comparison.B;
 const ghost=Math.max(0,Math.min(B.idleHours,h-start)),units=s.buffer?.units??0;
 return {hours:h,phase:h<start?'before':h<end?'broken':'recovering',brokenHours:Math.max(0,Math.min(end,h)-start),repairHours:end-start,
  buffer:units,zone:units>=2500?'green':units>=1250?'yellow':'red',drumIdle:X.comparison.A.idleHours,
  ghostIdle:ghost,ghostLost:B.lostUnits*ghost/B.idleHours,ghostTotal:B.idleHours,ghostLostTotal:B.lostUnits,ghostGain:B.lostGain};
}
export function journeyStep(lot,load,op){
 let key=load?.stage==='transport'?(load.to==='truck'?'truck':load.to):load?.stage;
 if(key==='transport'||!key)key='stock';
 if(load?.stage==='transport'&&load.from==='stock')key='stock';
 const index=Math.max(0,JOURNEY_STEPS.findIndex(s=>s[0]===key));
 const moving=load?.stage==='transport'&&load.from!=='stock';
 return {lotId:lot.id,product:lot.product,quantity:lot.quantity,index:index+1,total:JOURNEY_STEPS.length,label:key==='truck'&&moving?'Carregando o caminhão':(moving?'A caminho: ':'')+JOURNEY_STEPS[index][1],hours:Math.max(0,(op-T.productionStart)*120/P.weekSeconds)};
}
// Legacy timeline estimate retained for callers. Film shots use handling.loads below.
export function trackedPosition(lot,t,snapshot){
 if(snapshot)return sampleDbrHandling(snapshot,t).loads.get(lot?.id)?.position??null;
 if(!lot)return centres.buffer;
 const tr=lot.timeline.find(e=>e.kind==='transfer'&&e.start<=t&&e.end>t);
 if(tr)return sampleRoute(tr.route,transferProgress(tr,t)).position;
 const e=lot.timeline.filter(e=>e.end<=t).at(-1);
 if(e?.kind==='process')return [DBR_LAYOUT[e.station][e.machineIndex||0][0],DBR_LAYOUT[e.station][e.machineIndex||0][2]];
 return e?.toPosition??centres.stock;
}
export class FactoryFilm{
 constructor(options){this.engine=new DbrSimulation(options);this.plan=buildFilm(this.engine.schedule,options);this.schedule=this.engine.schedule;this.presentationTime=0;this.operationTime=0;this.preparedDemonstration=options?.preparedDemonstration;}
 reset(){this.presentationTime=0;this.operationTime=0;this.engine.reset();return this.snapshot();}
 seek(t){this.engine.seek(t);this.operationTime=this.engine.snapshot().elapsed;this.presentationTime=this.plan.clock.inverse(this.operationTime);return this.snapshot();}
 seekPresentation(t){this.presentationTime=Math.max(0,Math.min(600,t));this.operationTime=this.plan.clock.sample(this.presentationTime).sourceTime;this.engine.seek(this.operationTime);return this.snapshot();}
 advancePresentation(dt){return this.seekPresentation(this.presentationTime+dt);}
 advance(dt){return this.seek(this.operationTime+dt);}
 snapshot(){const raw=this.engine.snapshot(),op=raw.elapsed,t=this.presentationTime,film=this.plan;
 const animationTime=Math.max(T.productionStart-1e-5,Math.min(op,Math.max(T.productionEnd,...raw.trips.map(tr=>tr.exitAt??tr.departAt+3))));
 const s={...raw,animationTime,trips:raw.trips.map(tr=>({...tr,rearOpenSeconds:tr.rearOpenSeconds??.4,departureSeconds:tr.departureSeconds??1.2})),film:{factoryAnimationTime:Math.max(T.productionStart-1e-5,Math.min(op,T.productionEnd))}};
 const full=film.story.speeches.find(f=>t>=f.start&&t<f.end),speech=full?{...full,segmentId:full.id}:null;
 const [demoStart,demoEnd]=film.story.windows.demonstration;
 const handling=sampleDbrHandling(s),actors=sampleFilmActors(t,speech,{handling,story:film.story,operationTime:op}),cue=film.cues.find(c=>t>=c.t&&t<c.t+c.duration)||film.cues.at(-1),load=handling.loads.get(film.trackedLotId);
 const flow=cue.target==='flow'?sampleCameraFlow(t,cue.flowStart,cue.flowEnd):null;
 const truck=cue.target==='truck'?sampleLogisticsTruck([film.selection.truck],op):null;
 const exitComplete=Object.values(actors).every(a=>a.exitPhase==='exited');
 const visual=sampleVisual(film.visuals,t);
 const position=cue.visualId==='corda'&&visual?.id==='corda'?ropeCardPosition(visual.progress):cue.fixedPosition?cue.fixedPosition:cue.followTracked?load?.position??centres.overview:cue.target==='exit'?[-12,10.5]:truck?[truck.position[0],truck.position[2]]:flow?flow.position:cue.speaker?actors[cue.speaker].position:cue.followTour?actors.Rafael.position:cue.target==='tracked'?load?.position??centres.overview:centres[cue.target]??centres.overview;
 const sector=cue.followTracked?physicalSector(load):truck?'dispatch':flow?flow.sector:cue.speaker?speakerSector({id:cue.speechId},actors[cue.speaker]):cue.target==='tracked'?physicalSector(load):cue.sector;
 return {...s,animationTime,dialogue:null,film:{...T,factoryAnimationTime:Math.max(T.productionStart-1e-5,Math.min(op,T.productionEnd)),exitComplete,audioSpeech:full,presentationTime:t,operationTime:op,story:film.story,highlights:film.selection.highlights,pace:film.clock.sample(t).segment.rate,act:t<25?'opening':t<94?'problem':t<194?'solution':t<481?'weeks':t<film.story.windows.closing[0]?'results':'closing',speech,actors,demonstration:t>=demoStart&&t<demoEnd?{...sampleAct2Demonstration(79),start:demoStart,end:demoEnd,elapsed:t-demoStart,progress:(t-demoStart)/(demoEnd-demoStart),sourceTime:(this.preparedDemonstration?.sourceStart??79)+(t-demoStart)/(demoEnd-demoStart)*((this.preparedDemonstration?.sourceEnd??94.6)-(this.preparedDemonstration?.sourceStart??79))}:null,cueSheet:film.cues,shot:{...cue,target:flow?flow.sector:cue.target,position,sector,span:cue.span??(cue.type==='geral'?62:cue.type==='travelling'?22:cue.target==='tracked'?16:cue.speaker?14:18),orbit:cue.orbit??.7},trackedLotId:film.trackedLotId,journey:cue.followTracked?journeyStep(film.selection.tracked,load,op):null,breakdownSequence:cue.type==='sequencia-quebra'?breakdownStatus(s):null,visual,report:film.reports.find(r=>t>=r.issuedAt&&t<r.issuedAt+6)||null,reports:film.reports.filter(r=>r.issuedAt<=t),allReports:film.reports,showFinal:t>=film.story.windows.results[0]&&t<film.story.windows.results[1],comparison:full?.id==='F27'?X.comparison:null,mct:full?.id==='F28'?X.mct:null},source:s.source};}
}
