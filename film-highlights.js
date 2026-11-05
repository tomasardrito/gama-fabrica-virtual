import {createTimeMap} from './film-time-map.js';
import {STORY_WINDOWS,readingTime,speechChunks} from './film-story.js';
import {FILM_DIALOGUE} from './film-dialogue.js';
const screen=h=>135+h*375/960;
export const HIGHLIGHT_SOURCES={H01:'DBR Personalizado!B18, B52, B54',H02:'Divisão de Máquinas!J28; DBR Personalizado!C13, C69:C76',H03:'DBR Personalizado!J59:L60',H04:'RCCP (TOC) Personalizado!E4:E7; DBR Personalizado!B59:B60',H05:'Simulação DBR!B14:B16, L8:L13',H06:'RCCP (TOC) Personalizado!D78:F78; DBR Personalizado!G13',H07:'MCT Personalizado!B7; agenda de coletas',H08:'RCCP (TOC) Personalizado!B4:I7',H09:'Simulação DBR!L6:M13',H10:'MCT Personalizado!B37:B39; Melhoria 20%!B4:B5'};
export function selectFilmHighlights(schedule){
 const first=schedule.ropeCards.find(c=>schedule.lots.find(l=>l.id===c.lotIds[0])?.product==='Z3'&&c.quantity===500);
 const tracked=schedule.lots.find(l=>l.id===first?.lotIds[0]);
 if(!tracked)throw new Error('Agenda sem lote Z3 rastreável para H01');
 const mission=schedule.internalTransportPlan.missions.find(m=>m.transfer.lotId===tracked.id&&m.transfer.from==='m1'&&m.transfer.to==='m2');
 const replenishment=schedule.bodySupply.jobs.find(j=>j.body==='z3'&&j.triggerHours>=240&&j.triggerHours<360);
 const yellow=schedule.bufferLedger.find(e=>e.hours>=520&&e.units<2500);
 const m1=schedule.lots.find(l=>l.m1EndHours>=720&&l.m1EndHours<840);
 const truck=schedule.trips.find(t=>t.week===7&&t.arrivalAt>screen(m1.m1EndHours)+2);
 if(!truck)throw new Error('Agenda sem coleta S7 após a saída de F22');
 const triggers=[['F13',first.time],['F14',tracked.timeline.find(e=>e.to==='truck').end],['F15',screen(120)+6],['F16',replenishment.triggerAt],['F17',screen(360)+7],['F18',screen(520)],['F19',screen(yellow.hours)],['F20',screen(536)],['F21',screen(600)+5],['F22',screen(m1.m1EndHours)],['F23',truck.departAt],['F24',screen(840)+5]].map(([id,operationTime])=>({id,operationTime})).sort((a,b)=>a.operationTime-b.operationTime);
 const highlights=Array.from({length:8},(_,i)=>({id:`H0${i+1}`,week:i+1,operation:[screen(i*120),screen((i+1)*120)],source:HIGHLIGHT_SOURCES[`H0${i+1}`]}));
 Object.assign(highlights[0],{lotId:tracked.id,eventIds:[first.id,mission.transfer.id],missionId:mission.transfer.id});
 Object.assign(highlights[2],{eventIds:replenishment.timeline.map(e=>e.id),replenishmentId:replenishment.id,stages:replenishment.timeline.filter(e=>e.kind==='replenishment-process').map(e=>({id:e.id,station:e.station,start:e.start,end:e.end}))});
 Object.assign(highlights[4],{events:schedule.events.filter(e=>['breakdown-start','breakdown-end'].includes(e.type)).map(e=>({type:e.type,hours:e.hours,time:e.time})),yellowHours:yellow.hours});
 Object.assign(highlights[6],{tripId:truck.id,lotIds:truck.lotIds,operation:[truck.arrivalAt,truck.exitAt]});
 for(const [index,station]of [[1,'m1'],[3,'lap'],[5,'insp'],[7,'insp']])highlights[index].eventIds=schedule.timeline.filter(e=>e.kind==='process'&&e.station===station&&e.start>=highlights[index].operation[0]&&e.start<highlights[index].operation[1]).map(e=>e.id);
 highlights.push({id:'H09',speechId:'F27',block:'results',source:HIGHLIGHT_SOURCES.H09},{id:'H10',speechId:'F28',block:'results',source:HIGHLIGHT_SOURCES.H10});
 return {highlights,triggers,tracked,mission,truck,journey:journeyWindow(tracked)};
}
export const BREAKDOWN_SEQUENCE=Object.freeze({fromHours:518,toHours:568,duration:34,position:[1.2,-1.6],span:25,cameraHeight:20,orbit:.55});
export const JOURNEY_PACE=Object.freeze({transfer:.5,minProcess:5,maxWait:3});
export function journeyPacing(lot){
 const events=lot.timeline.filter(e=>Number.isFinite(e.start)&&e.end>e.start).sort((a,b)=>a.start-b.start),spans=[];
 for(let i=0;i<events.length;i++){
  const e=events[i],length=e.end-e.start;
  spans.push({from:e.start,to:e.end,duration:e.kind==='process'?Math.max(JOURNEY_PACE.minProcess,length/JOURNEY_PACE.transfer):length/JOURNEY_PACE.transfer,journey:e.kind});
  const next=events[i+1];
  if(next&&next.start>e.end+1e-9){const gap=next.start-e.end;spans.push({from:e.end,to:next.start,duration:Math.min(gap/JOURNEY_PACE.transfer,JOURNEY_PACE.maxWait),journey:'wait'});}
 }
 return spans;
}
export function journeyWindow(lot){const ev=lot.timeline.filter(e=>Number.isFinite(e.start));return [Math.min(...ev.map(e=>e.start)),Math.max(...ev.map(e=>e.end))];}
export function createEditorialClock(schedule,selection=selectFilmHighlights(schedule),audioDurations={}){
 // One uniform pace for the whole production act. Speeches never slow the
 // factory down: they are placed in sequence by buildFilm (a speech whose
 // trigger falls inside the previous one starts right after it). The only
 // close-up kept is the pallet jack M1→M2, at its natural walking duration.
 const holds=[];
 const m=selection.mission;
 const native=m.request.loaded;
 if(!Number.isFinite(native)||native<=0)throw new Error('Missão sem duração nativa válida');
 holds.push({from:m.pickupStart,to:m.transfer.end,duration:native});
 // Plano-sequência: the tracked Z3 lot from the body supermarket to the truck
 // at a readable pace. Transfers and waits keep their real order and length
 // ratio; every machine visit stays on screen long enough to be seen.
 for(const span of journeyPacing(selection.tracked))holds.push(span);
 // Quebra da Rosqueadora: from just before the stop until the buffer is green
 // again, at a pace where the buffer level and the hour counters can be read.
 holds.push({from:screen(BREAKDOWN_SEQUENCE.fromHours),to:screen(BREAKDOWN_SEQUENCE.toHours),duration:BREAKDOWN_SEQUENCE.duration});
 const end=Math.max(510,...schedule.trips.map(t=>t.exitAt),...holds.map(h=>h.to));
 const cuts=[...new Set([135,end,...holds.flatMap(h=>[h.from,h.to])])].sort((a,b)=>a-b);
 const pieces=cuts.slice(0,-1).map((from,i)=>{const to=cuts[i+1],rate=Math.max(0,...holds.filter(h=>h.from<=from+1e-9&&h.to>=to-1e-9).map(h=>h.duration/(h.to-h.from)));return {from,to,duration:(to-from)*rate};});
 const budget=STORY_WINDOWS.production[1]-STORY_WINDOWS.production[0],used=pieces.reduce((n,p)=>n+p.duration,0);
 if(used>=budget)throw new Error(`Orçamento impossível: highlights exigem ${used.toFixed(2)} s; disponíveis ${budget} s`);
 const free=pieces.filter(p=>!p.duration).reduce((n,p)=>n+p.to-p.from,0);
 for(const p of pieces)if(!p.duration)p.duration=(budget-used)*(p.to-p.from)/free;
 const [start,finish]=STORY_WINDOWS.production;
 const preparationStart=Math.min(...schedule.componentTransfers.map(e=>e.approachStart),...schedule.timeline.filter(e=>e.vehicleIndex!=null).map(e=>e.approachStart).filter(Number.isFinite));
 // Opening, meeting and tour: the factory is parked (0 h, all forklifts in
 // their bays). The pre-S1 kit staging is skipped in one camera cut at the
 // start of production, so no aimless motion is shown before the S1.
 const PREP_JUMP=.05;
 const segments=[{from:0,to:preparationStart,duration:start-PREP_JUMP},{from:preparationStart,to:135,duration:PREP_JUMP},...pieces,{from:end,to:580,duration:STORY_WINDOWS.results[1]-finish},{from:580,to:600,duration:600-STORY_WINDOWS.closing[0]}];
 segments.at(-1).duration=600-segments.slice(0,-1).reduce((n,s)=>n+s.duration,0);
 const map=createTimeMap(segments);
 for(const h of selection.highlights){if(h.operation)h.presentation=h.operation.map(t=>map.inverse(t));else h.presentation=null;}
 return map;
}

export function selectPreviewHighlights(schedule){
const mission=schedule.internalTransportPlan.missions.find(m=>m.transfer.from==='m1'&&m.transfer.to==='m2'&&m.pickupStart>150&&m.pickupStart<190&&m.request.loaded<24);
if(!mission)throw new Error('A complete assembly delivery is required');
const trip=schedule.trips.find(t=>t.week===7&&t.pallets>0&&t.arrivalAt>420);
if(!trip)throw new Error('A real S7 collection is required');
const e=mission.transfer;
const loading=schedule.timeline.filter(e=>e.to==='truck'&&trip.lotIds.includes(e.lotId)).sort((a,b)=>a.start-b.start).at(-1);
const segments=[
 {id:'factory',kind:'fast',from:135,to:mission.pickupStart-.01,duration:7,title:'O ritmo da fábrica',detail:'O tempo avança. A produção continua.'},
 {id:'settle',kind:'jack',from:mission.pickupStart-.01,to:mission.pickupStart,duration:2,title:'Entre as montagens',detail:'Montagem 1 → Montagem 2'},
 {id:'jack',kind:'jack',from:mission.pickupStart,to:e.end,duration:mission.request.loaded,title:'Uma entrega completa',detail:'Retirar · transportar · posicionar'},
 {id:'delivered',kind:'jack',from:e.end,to:e.end+.002,duration:2,title:'Pallet entregue',detail:'A próxima operação recebe o lote.'},
 {id:'weeks',kind:'fast',from:e.end+.002,to:trip.arrivalAt,duration:9,title:'As semanas avançam',detail:'Uma visão do fluxo inteiro.'},
 {id:'arrival',kind:'truck',from:trip.arrivalAt,to:trip.reverseAt,duration:11,title:'A coleta chega',detail:'Entrada pelo pátio e alinhamento com a doca.'},
 {id:'reverse',kind:'truck',from:trip.reverseAt,to:trip.loadStart,duration:11,title:'Manobra e abertura',detail:'Ré até a doca. Portas abertas para carregar.'},
 {id:'load-setup',kind:'fast-dock',from:trip.loadStart,to:loading.start,duration:3,title:'A coleta é consolidada',detail:'Os primeiros pallets seguem para a doca.'},
 {id:'loading',kind:'loading',from:loading.start,to:trip.loadEnd,duration:18,title:'Do galpão ao caminhão',detail:'Acompanhe o último pallet desta coleta.'},
 {id:'closing',kind:'loading',from:trip.loadEnd,to:trip.departAt,duration:5,title:'Pronto para sair',detail:'Área liberada. Rampa e portas fecham.'},
 {id:'departure',kind:'truck',from:trip.departAt,to:trip.exitAt,duration:8,title:'Pedido a caminho',detail:'A coleta deixa a fábrica pela pista de saída.'},
];
const duration=segments.reduce((n,s)=>n+s.duration,0);
segments.push({id:'end',kind:'fast',from:trip.exitAt,to:Math.min(509,trip.exitAt+2),duration:Math.max(3,90-duration),title:'O fluxo continua',detail:'Personalização, montagem, inspeção e entrega.'});
return {segments,mission:{id:e.id,lotId:e.lotId,product:e.product,quantity:e.quantity,carrierId:mission.carrier.id,operatorId:mission.operator.id,from:e.fromPosition,to:e.toPosition,pickupStart:mission.pickupStart,end:e.end,naturalSeconds:mission.request.loaded},trip:{...trip,trackedLotId:loading.lotId}};
}
