import {compileComponentSupply,componentTransfers,planExternalCirculation} from './logistics-motion.js';
import {logisticsMetrics} from './logistics-metrics.js';
import {MPS_PLAN} from './mps-simulation.js';
import {DbrBodySupply,dbrWorkToCalendar} from './dbr-upstream.js';
import {DBR_LAYOUT,DBR_BAYS,dbrRoute} from './dbr-layout.js';
import {OPERATION_TIMING} from './dbr-timing.js';
import {validatePreparedSchedule} from './film-prepared.js';
import {FILM_EXCEL} from './film-excel.js';
import {compileDbrPresentation,prepareInternalPresentation,compileOperationalHandling} from './dbr-presentation.js';
const EPS=1e-7,PRODUCTS=['Z','Z1','Z2','Z3'],sum=a=>a.reduce((n,x)=>n+x,0);
export const DBR_PARAMETERS={...OPERATION_TIMING,weeks:8,workHours:960,weekHours:120,initialBufferUnits:3571.3125,target:3571.3125,min:2499.91875,red:1249.959375,
 drumRate:46.692708333333336,drumProcessingRate:500/(.4137310300290604*24),ropeIntervalHours:10.70831009481316,advanceHours:76.48544339096486,
 rates:{lap:90.4390579424015,rosq:97.51423197702731,m1:500/(.4137310300290604*24),m2:81.42857142857142,insp:178.98305084745763},shifts:{lap:24,rosq:16,m1:24,m2:24,insp:16},
 plannedLeadTimeDays:4.45128162519944,shippingDelayDays:.25,collectionHours:24,truckPallets:10,transferSeconds:2,approachSeconds:.25,transferHours:12/60,
 source:'DBR Personalizado; Factory Physics Personalizado; RCCP (TOC) Personalizado!J11:Q14; MCT Personalizado!B7',
 assumptions:['Pulmão inicial de 3.571,3125 unidades equivalentes, conforme Simulação DBR!B8: sete pallets de 500 e um saldo de 71,3125. A composição Z3 é uma hipótese visual; não há WIP adicional a montante.','Centros modelados pela taxa efetiva conjunta do Excel. As três máquinas M1 somam 50,3548 un/h; um lote de 500 requer 9,9295 h de processamento, depois de chegar ao centro.','Antecedência RCCP: M1, M2 e inspeção uma semana; Lapidação e Rosqueadora duas semanas. EDD entre ordens disponíveis.','A retirada de um pallet autoriza sua reposição. O saldo de proteção diminui conforme suas unidades são consumidas, como N(t)=N(t-1)+entrada-consumo no Excel. Inclui o restante do pallet em alimentação.','Coletas diárias com saída no horário marcado, carga elegível pelo menos 6 h depois da inspeção e até 10 pallets. Sem carga, a viagem é dispensada.','Transporte industrial de 12 min por missão, premissa logística da apresentação. O tempo de animação é independente e cabe entre eventos industriais fixos.','Frota interna existente de cinco empilhadeiras; missões externas de 12 min, 80 h/semana e 80% de disponibilidade. O cenário de comparação reproduz a semana média do Excel; o MPS variável tem seus próprios saldos e períodos amarelos.']};
export const dbrScreen=h=>DBR_PARAMETERS.productionStart+h*DBR_PARAMETERS.weekSeconds/120;
const work=s=>(s-DBR_PARAMETERS.productionStart)*120/DBR_PARAMETERS.weekSeconds;
const IDS=['lap','rosq','m1','m2','insp'];
const NAMES={lap:'Lapidação',rosq:'Rosqueadora',m1:'Montagem 1 — tambor',m2:'Montagem 2',insp:'Inspeção',torno:'Tornearia',us1:'Usinagem 1',us2:'Usinagem 2'};
export const drumConsumed=(lot,hours)=>lot.m1StartHours==null||hours<=lot.m1StartHours?0:lot.quantity*Math.min(1,(hours-lot.m1StartHours)/(lot.m1EndHours-lot.m1StartHours));
export function bufferPalletsAt(lots,hours){
 return lots.filter(l=>(l.initial||l.enteredBufferHours!=null&&l.enteredBufferHours<=hours+EPS)&&!(l.m1EndHours<=hours+EPS)).map(l=>({id:l.id,product:l.product,quantity:l.quantity-drumConsumed(l,hours),remaining:l.quantity-drumConsumed(l,hours),initial:l.initial,slot:l.bufferSlot,feeding:l.bufferReleasedHours<=hours+EPS}));
}
function buildSchedule({transferSeconds=DBR_PARAMETERS.transferSeconds,onOperationalCandidate}={}){
 const P=DBR_PARAMETERS,BREAK_START=480+FILM_EXCEL.breakdown.offsetHours,BREAK_END=BREAK_START+FILM_EXCEL.breakdown.durationHours,orders=MPS_PLAN.flatMap(p=>PRODUCTS.map(product=>({id:`MPS-S${p.week}-${product}`,week:p.week,product,quantity:p.products[product],dueHours:p.week*120,availableHours:Math.max(0,(p.week-2)*120),releaseAvailableHours:Math.max(0,(p.week-3)*120)})));
 const lots=[],timeline=[],ropeCards=[],events=[],trips=[],bufferLedger=[],draws=[],poolPallets=[],drumRuns=[],pending=[],buffer=[],bufferWait=[],queue={lap:[],rosq:[],m2:[],insp:[]};
 let initialLeft=3500,serial=0,t=0,credit=0,nextDrum=0,id=0;
 for(const o of orders){let left=o.quantity;while(left>EPS){const initial=o.week>1&&o.product==='Z3'&&initialLeft>=500&&left>=500;const quantity=Math.min(500,left);const lot={id:initial?`BUF-INI-${8-initialLeft/500}`:`DBR-${String(++id).padStart(3,'0')}`,orderId:o.id,week:o.week,product:o.product,quantity,initial,dueHours:o.dueHours,availableHours:o.availableHours,releaseAvailableHours:o.releaseAvailableHours,releasedHours:initial?null:Infinity,timeline:[],initialDraws:[],stage:initial?'buffer':'planned',enteredBufferHours:initial?0:null,bufferSlot:initial?7-initialLeft/500:null};
 if(initial){initialLeft-=500;buffer.push(lot);poolPallets.push({...lot,initialQuantity:500});}else pending.push(lot);lots.push(lot);left-=quantity;}}
 pending.sort((a,b)=>(a.week-b.week)||((a.product==='Z3'?0:1)-(b.product==='Z3'?0:1)));
 // As in Simulação DBR, upstream starts empty. The S1 Z3 is a new release.
 const reserve={id:'BUF-RESERVE',orderId:'INITIAL-PROTECTION',week:9,product:'Z3',quantity:P.initialBufferUnits-3500,initial:true,protection:true,dueHours:Infinity,availableHours:Infinity,releaseAvailableHours:Infinity,releasedHours:null,timeline:[],initialDraws:[],stage:'buffer',enteredBufferHours:0,bufferSlot:10};
 lots.push(reserve);buffer.push(reserve);poolPallets.push({...reserve,initialQuantity:reserve.quantity});

 const slots=Object.fromEntries(IDS.map(s=>[s,Array.from({length:{lap:1,rosq:1,m1:1,m2:1,insp:1}[s]},()=>null)]));
 const stageBays=Object.fromEntries(IDS.map(id=>[id,Array(5).fill(null)]));
 const bufferSlots=Array(DBR_BAYS.buffer.length).fill(null),dispatchSlots=Array(10).fill(null);for(const l of buffer)bufferSlots[l.bufferSlot]=l.id;
 const motions=Array.from({length:9},()=>[]),tasks=[];
 const push=(hours,fn)=>{tasks.push({hours,fn});};
 const earliest=(vi,h,d)=>{let at=h;for(const e of motions[vi].slice().sort((a,b)=>a.busyStart-b.busyStart)){if(at+d<=e.busyStart+EPS)break;if(at<e.endHours+EPS&&at+d>e.busyStart-EPS)at=e.endHours;}return at;};
 const add=(lot,e)=>{const item={id:`DBR-E${++serial}`,lotId:lot.id,batchId:lot.id,orderId:lot.orderId,product:lot.product,body:lot.body,quantity:lot.quantity,week:lot.week,...e};timeline.push(item);lot.timeline.push(item);return item;};
 function move(lot,from,to,h,{slot=0,fromSlot=0,vehicle=null,fromMachine=null,toMachine=null}={}){
  const candidates=vehicle!==null?[vehicle]:to==='truck'?[2]:to==='m1'?[6,7,8]:[0,1,4,5];const duration=P.transferHours,approach=0;
  const vi=candidates.reduce((best,i)=>earliest(i,h,duration+approach)<earliest(best,h,duration+approach)?i:best,candidates[0]);
  const busyStart=earliest(vi,Math.max(lot.preloaded?-P.advanceHours:0,h-approach),duration+approach),startHours=busyStart+approach,endHours=startHours+duration;
  const fromPosition=DBR_BAYS[from][fromSlot%DBR_BAYS[from].length],toPosition=DBR_BAYS[to][slot%DBR_BAYS[to].length];
  const e=add(lot,{kind:'transfer',transportMode:'forklift',visualDuration:transferSeconds,from,to,fromSlot,toSlot:slot,vehicleId:`forklift-${vi+1}`,vehicleIndex:vi,busyStart,startHours,endHours,hours:startHours,start:dbrScreen(startHours),end:dbrScreen(endHours),approachStart:dbrScreen(busyStart),fromPosition:[...fromPosition],toPosition:[...toPosition],fromMachine,toMachine,route:dbrRoute(from,to,fromPosition,toPosition)});motions[vi].push(e);return e;
 }
 const bodySupply=new DbrBodySupply({screenAt:dbrScreen,moveJob:(job,from,to,h)=>move(job,from,to,h,{vehicle:3})});
 // N(t)=N(t-1)+inflow-consumption in Simulação DBR. Committing a pallet
 // to the cell authorizes the rope, but its units are consumed progressively.
 const bufferUnits=()=>sum(buffer.map(l=>l.quantity))+sum(slots.m1.filter(l=>l&&!buffer.includes(l)).map(l=>l.quantity-drumConsumed(l,t)));
 function stationEnd(start,duration,shift,station){
  let at=start,left=duration;while(left>EPS){const day=Math.floor((at+EPS)/24),hour=at-day*24;if(hour>=shift-EPS){at=(day+1)*24;continue;}if(station==='rosq'&&at>=BREAK_START-EPS&&at<BREAK_END-EPS){at=BREAK_END;continue;}const stop=station==='rosq'&&at<BREAK_START?Math.min(day*24+shift,BREAK_START):day*24+shift,used=Math.min(left,stop-at);at+=used;left-=used;if(used<EPS)at+=EPS*2;}return at;
 }
 function start(id,lot,machine,h){
  const from=id==='lap'?'stock':id==='rosq'?'lap':id==='m1'?'buffer':id==='m2'?'m1':'m2';
  const fromSlot=id==='m1'?lot.bufferSlot:lot.stageBays?.[from]||0;
  const bay=stageBays[id].findIndex(x=>x===null);stageBays[id][bay]=lot.id;lot.stageBays??={};lot.stageBays[id]=bay;
  const e=move(lot,from,id,h,{slot:bay,fromSlot,fromMachine:DBR_LAYOUT[from]?.[lot.machineSlots?.[from]||0],toMachine:DBR_LAYOUT[id][machine]});
  slots[id][machine]=lot;
  if(stageBays[from])push(e.startHours,()=>{stageBays[from][fromSlot]=null;});
  lot.machineSlots??={};lot.machineSlots[id]=machine;
  // Material must arrive before processing. Handling has its own industrial
  // duration; the effective processing capacity remains exactly the Excel rate.
  const cycle=lot.quantity/(P.rates[id]/slots[id].length),end=Math.max(e.endHours,stationEnd(e.endHours,cycle,P.shifts[id],id));
  lot[`${id}StartHours`]=e.endHours;lot[`${id}ArrivalHours`]=e.endHours;lot[`${id}EndHours`]=end;
  add(lot,{kind:'process',station:id,stage:id,machineIndex:machine,start:dbrScreen(e.endHours),end:dbrScreen(end),startHours:e.endHours,cycleStartHours:e.endHours,endHours:end});
  if(id==='m1'){
   lot.bufferReleasedHours=e.startHours;nextDrum=draws.length<2?e.startHours+lot.quantity/P.drumProcessingRate:0;
   push(e.startHours,()=>{const ix=buffer.indexOf(lot);if(ix>=0)buffer.splice(ix,1);bufferSlots[lot.bufferSlot]=null;credit+=lot.quantity;draws.push({palletId:lot.id,lotId:lot.id,quantity:lot.quantity,time:e.start,workHours:e.startHours});bufferLedger.push({hours:e.startHours,units:bufferUnits(),type:'withdrawal',lotId:lot.id,quantity:lot.quantity});events.push({time:e.start,hours:e.startHours,type:'buffer-out',lotId:lot.id,text:`Tambor retira ${lot.id}: ${lot.quantity} un inteiras.`});});
   drumRuns.push({loadingStart:e.startHours,start:e.endHours,end,quantity:lot.quantity,lotId:lot.id,machineIndex:machine});
  }
  push(end,()=>{
   slots[id][machine]=null;
   if(id==='lap')queue.rosq.push(lot);
   else if(id==='rosq'){bufferWait.push(lot);
   }else if(id==='m1')queue.m2.push(lot);else if(id==='m2')queue.insp.push(lot);else{
    lot.inspectionHours=end;const b=dispatchSlots.findIndex(x=>x===null);if(b<0)throw new Error(`Expedição sem posição física em ${end}: ${dispatchSlots.join()}`);dispatchSlots[b]=lot.id;lot.dispatchSlot=b;
    const tr=move(lot,'insp','dispatch',end,{fromSlot:lot.stageBays[id],slot:b,fromMachine:DBR_LAYOUT.insp[machine]});lot.dispatchArrivalHours=tr.endHours;push(tr.startHours,()=>{stageBays.insp[lot.stageBays.insp]=null;});
   }
  });
 }
 function deliverBuffer(){
  for(const lot of bufferWait.slice()){
   const inbound=timeline.filter(e=>e.kind==='transfer'&&e.to==='buffer'&&e.endHours>t).reduce((n,e)=>n+e.quantity,0);if(bufferUnits()+inbound+lot.quantity>P.target+EPS)continue;
   const b=bufferSlots.findIndex(x=>x===null);if(b<0)continue;bufferWait.splice(bufferWait.indexOf(lot),1);bufferSlots[b]=lot.id;lot.bufferSlot=b;
   const tr=move(lot,'rosq','buffer',t,{fromSlot:lot.stageBays.rosq,slot:b,fromMachine:DBR_LAYOUT.rosq[lot.machineSlots.rosq]});lot.enteredBufferHours=tr.endHours;push(tr.startHours,()=>{stageBays.rosq[lot.stageBays.rosq]=null;});
   push(tr.endHours,()=>{buffer.push(lot);bufferLedger.push({hours:tr.endHours,units:bufferUnits(),type:'arrival',lotId:lot.id,quantity:lot.quantity});});
  }
 }
 function release(){
  if(t<0||bufferUnits()>P.target+EPS||credit<EPS)return false;
  const eligible=l=>l.releaseAvailableHours<=t+EPS&&credit+EPS>=l.quantity&&bodySupply.earliestAvailability(l.product==='Z3'?'z3':'generic',l.quantity,t)<=t+EPS;
  let index=pending.findIndex(eligible);
  let l=index>=0?pending[index]:null;
  if(!l&&pending.length===0){const quantity=Math.min(500,credit);l={id:`PROT-${String(lots.filter(l=>l.protection).length+1).padStart(3,'0')}`,orderId:'REPOSICAO-PULMAO',week:9,product:'Z3',quantity,protection:true,initial:false,dueHours:Infinity,availableHours:Infinity,releaseAvailableHours:0,releasedHours:Infinity,timeline:[],initialDraws:[],enteredBufferHours:null};}
  if(!l)return false;const result=bodySupply.tryRelease(l,t);if(!result.accepted)return false;
  if(index>=0)pending.splice(index,1);else lots.push(l);credit-=l.quantity;l.releasedHours=t;l.plannedDrumHours=t+P.advanceHours;queue.lap.push(l);
  const priority=bufferUnits()<P.min,card={id:`CORDA-${ropeCards.length+1}`,time:dbrScreen(t),hours:t,quantity:l.quantity,lotIds:[l.id],priority,animate:ropeCards.length===0,bufferUnits:bufferUnits(),status:'Liberado'};ropeCards.push(card);l.ropeCardId=card.id;
  events.push({time:dbrScreen(t),hours:t,type:'rope-release',text:`Corda autoriza ${l.id} · ${l.product} · ${l.quantity} un${priority?' com prioridade':''}.`});return true;
 }
 function collect(h){
  const ready=lots.filter(l=>l.inspectionHours!=null&&l.inspectionHours+6<=h+EPS&&l.dispatchArrivalHours<=h+EPS&&l.shippedHours==null).sort((a,b)=>a.dueHours-b.dueHours||a.inspectionHours-b.inspectionHours).slice(0,P.truckPallets);
  if(!ready.length){events.push({time:dbrScreen(h),hours:h,type:'collection-skipped',text:'Coleta dispensada: sem carga.'});return;}
  const tr={id:`COLETA-${trips.length+1}`,week:Math.min(8,Math.floor((h-EPS)/120)+1),day:Math.floor(h/24)%5+1,scheduledHours:h,scheduledAt:dbrScreen(h),lotIds:[],pallets:ready.length,quantity:sum(ready.map(l=>l.quantity)),loadStart:dbrScreen(h),loadEnd:dbrScreen(h),departAt:dbrScreen(h),departHours:h};
  let at=h-ready.length*P.transferHours;for(const [i,l]of ready.entries()){
   const e=move(l,'dispatch','truck',at,{vehicle:2,fromSlot:l.dispatchSlot,slot:i});at=e.endHours;tr.lotIds.push(l.id);l.truckLoadHours=e.endHours;
   push(e.startHours,()=>{dispatchSlots[l.dispatchSlot]=null;});
  }
  tr.loadStart=dbrScreen(h-ready.length*P.transferHours);tr.loadEnd=dbrScreen(at);tr.departAt=dbrScreen(h);tr.departHours=h;for(const l of ready){l.shippedHours=tr.departHours;l.tripId=tr.id;}trips.push(tr);
 }
 bufferLedger.push({hours:0,units:P.initialBufferUnits,type:'opening'});
 for(const [h,type]of [[BREAK_START,'breakdown-start'],[BREAK_END,'breakdown-end']])events.push({time:dbrScreen(h),hours:h,type,text:type==='breakdown-start'?'Rosqueadora parada: manutenção por 16 h.':'Rosqueadora restabelecida; reposição prioritária do pulmão.'});
 for(let h=24;h<=960;h+=24)push(h-6,()=>collect(h));
 let guard=0;
 while(t<1056-EPS&&guard++<100000){
  const due=tasks.filter(x=>x.hours<=t+EPS);for(const x of due){tasks.splice(tasks.indexOf(x),1);x.fn();}
  deliverBuffer();while(release()){}
  for(const id of ['m1','lap','rosq','m2','insp']){
   for(let m=0;m<slots[id].length;m++){
    if((id==='m1'&&(t<0||t<nextDrum-EPS))||(id==='rosq'&&t>=BREAK_START-EPS&&t<BREAK_END-EPS)||slots[id][m]||!stageBays[id].includes(null)||((t%24)+24)%24>=P.shifts[id]-EPS)continue;
    const q=id==='m1'?buffer:queue[id];q.sort((a,b)=>a.dueHours-b.dueHours);const ix=q.findIndex(l=>(id!=='m1'||!l.bufferReleasedHours&&l.bufferReleasedHours!==0)&&(id!=='m1'||!l.reserved)&&l.availableHours<=(id==='m1'||id==='m2'||id==='insp'?t:Infinity)+EPS);
    if(ix<0)continue;const l=q[ix];if(id==='m1'){l.reserved=true;}else q.splice(ix,1);start(id,l,m,t);
   }
  }
  // Drain simultaneous events before advancing. A render frame (or an
  // unrelated collection) must not shift the production polling phase.
  if(tasks.some(x=>x.hours<=t+EPS))continue;
  const candidates=[(Math.floor((t+EPS)/24)+1)*24,...tasks.map(x=>x.hours).filter(h=>h>t+EPS),...orders.flatMap(o=>[o.availableHours,o.releaseAvailableHours]).filter(h=>h>t+EPS),...bodySupply.jobs.map(j=>j.completedHours).filter(h=>h>t+EPS)];if(nextDrum>t+EPS)candidates.push(nextDrum);
  t=Math.min(...candidates);
 }
 if(guard>=100000)throw new Error('Agenda DBR não convergiu.');
 // Include both sides of arrivals and every consumption boundary: half-second
 // screen sampling alone can miss an industrial minimum.
 const hours=new Set(Array.from({length:P.workHours+1},(_,i)=>i));
 for(const l of lots)for(const h of [l.enteredBufferHours,l.m1StartHours,l.m1EndHours])if(h!=null&&h>=0&&h<=P.workHours){hours.add(h);if(h>1e-5)hours.add(h-1e-5);}
 bufferLedger.splice(0,bufferLedger.length,...[...hours].sort((a,b)=>a-b).map(h=>({hours:h,units:sum(bufferPalletsAt(lots,h).map(p=>p.quantity)),type:h===0?'opening':'balance'})));
 for(const l of lots){l.releasedAt=l.initial?0:dbrScreen(l.releasedHours);l.completedAt=l.inspectionHours==null?Infinity:dbrScreen(l.inspectionHours);l.shippedAt=l.shippedHours==null?Infinity:dbrScreen(l.shippedHours);l.bufferEnteredAt=l.enteredBufferHours==null?Infinity:dbrScreen(l.enteredBufferHours);l.bufferReleasedAt=l.bufferReleasedHours==null?Infinity:dbrScreen(l.bufferReleasedHours);l.plannedDrumHours=l.initial?l.availableHours:l.releasedHours+P.advanceHours;l.plannedReleaseHours=l.releaseAvailableHours;}
 for(const job of bodySupply.jobs)timeline.push(...job.timeline.filter(e=>e.kind==='replenishment-process'));
 timeline.sort((a,b)=>a.start-b.start||a.end-b.end);for(const l of lots)l.timeline.sort((a,b)=>a.start-b.start);
 const schedule=compileDbrPresentation({orders,lots,timeline,ropeCards,draws,poolPallets,bufferLedger,events,trips,drumRuns,bodySupply,motions},{screenAt:dbrScreen,transferSeconds,approachSeconds:P.approachSeconds});
 schedule.componentPlan=compileComponentSupply(schedule);schedule.componentTransfers=componentTransfers(schedule.componentPlan,schedule);
 const candidate=prepareInternalPresentation(schedule,{reserveExternal:false});
 planExternalCirculation(candidate);
 return compileOperationalHandling(candidate,{onCandidate:onOperationalCandidate});
}
let shared;
export function installPreparedSchedule(schedule){shared=validatePreparedSchedule(schedule);return shared;}
export class DbrSimulation{
 constructor(options){this.schedule=options?.preparedSchedule??(options?buildSchedule(options):(shared??=buildSchedule()));this.reset();}
 reset(){this.elapsed=0;return this.snapshot();}
 advance(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Avanço inválido.');return this.seek(Math.min(DBR_PARAMETERS.duration,this.elapsed+seconds));}
 seek(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>DBR_PARAMETERS.duration)throw new Error('Instante inválido.');this.elapsed=seconds;return this.snapshot();}
 snapshot(){
 const P=DBR_PARAMETERS,s=this.schedule,t=this.elapsed,h=t<P.productionStart?-1:Math.min(960,work(t)),now=Math.max(0,h),phase=t<P.openingSeconds?'opening':t<P.productionStart?'intro':t<P.productionEnd?'production':t<P.closingStart?'summary':'closing',week=Math.min(8,Math.max(1,Math.floor(now/120)+1));
 const done=l=>l.inspectionHours!=null&&l.inspectionHours<=h+EPS,sent=l=>l.shippedAt!=null&&l.shippedAt<=t+EPS;
 const stage=l=>{if(sent(l))return 'shipped';if(l.truckLoadHours<=h)return 'truck';if(done(l))return 'dispatch';if((l.initial||l.enteredBufferHours!=null&&l.enteredBufferHours<=h)&&(l.bufferReleasedHours==null||l.bufferReleasedHours>h))return 'buffer';for(const id of ['insp','m2','m1','rosq','lap'])if(l[`${id}StartHours`]<=h)return id;return l.releasedHours<=h?'stock':'planned';};
 const lots=s.lots.map(l=>({...l,stage:stage(l),status:sent(l)?'Expedido':done(l)?'Aprovado':stage(l)==='buffer'?'No pulmão':stage(l)==='planned'?'Programado':'Em processo'}));
 const pallets=bufferPalletsAt(lots,Math.max(0,h));
 const units=sum(pallets.map(l=>l.quantity)),zone=units>=P.min?'green':units>=P.red?'yellow':'red';
 const products=PRODUCTS.map(product=>{const list=lots.filter(l=>!l.protection&&l.product===product),due=list.filter(l=>l.dueHours<=h+EPS),planned=sum(list.map(l=>l.quantity));return {product,planned,completed:sum(list.filter(done).map(l=>l.quantity)),shipped:sum(list.filter(sent).map(l=>l.quantity)),backlog:sum(due.filter(l=>!sent(l)).map(l=>l.quantity))};});
 const weeks=MPS_PLAN.map(p=>{const list=lots.filter(l=>l.week===p.week),q=sum(list.filter(sent).map(l=>l.quantity)),onTime=sum(list.filter(l=>sent(l)&&l.shippedHours<=l.dueHours+EPS).map(l=>l.quantity));return{week:p.week,planned:p.planned,completed:sum(list.filter(done).map(l=>l.quantity)),shipped:q,onTimeShipped:onTime,backlog:p.week*120<=h+EPS?p.planned-q:0,deviation:p.week*120<=h+EPS?onTime-p.planned:null,products:PRODUCTS.map(product=>({product,planned:p.products[product],completed:sum(list.filter(l=>l.product===product&&done(l)).map(l=>l.quantity)),shipped:sum(list.filter(l=>l.product===product&&sent(l)).map(l=>l.quantity))}))};});
 const stations=IDS.map(id=>{const active=lots.filter(l=>l[`${id}StartHours`]<=h+EPS&&l[`${id}EndHours`]>h+EPS),processing=active.filter(l=>l[`${id}ArrivalHours`]<=h+EPS);return{id,name:NAMES[id],status:id==='rosq'&&now>=520&&now<536?'Manutenção':processing.length?(now%24<P.shifts[id]?'Produzindo':'Fora do turno'):active.length?'Carregando':'Aguardando',activeLotId:active[0]?.id,activeBatchId:active[0]?.id,activeLots:active.map(l=>({id:l.id,machineIndex:l.machineSlots[id],processing:l[`${id}ArrivalHours`]<=h,progress:(h-l[`${id}ArrivalHours`])/(l[`${id}EndHours`]-l[`${id}ArrivalHours`])})),processingUnits:sum(processing.map(l=>l.quantity)),progress:active[0]?Math.max(0,(h-active[0][`${id}ArrivalHours`])/(active[0][`${id}EndHours`]-active[0][`${id}ArrivalHours`])):0};});
 const upstream=s.bodySupply.snapshotAt(now);for(const id of ['us2','us1','torno']){const a=upstream.currentProcesses.find(e=>e.station===id);stations.unshift({id,name:NAMES[id],status:a?'Produzindo':'Aguardando',activeBatchId:a?.lotId,processingUnits:a?.quantity||0,progress:a?(now-a.startHours)/(a.endHours-a.startHours):0});}
 const cards=s.ropeCards.filter(c=>c.hours<=h+EPS),consumed=sum(lots.filter(l=>l.bufferReleasedHours<=h+EPS).map(l=>l.quantity)),released=sum(cards.map(c=>c.quantity));
 const completed=sum(products.map(p=>p.completed)),shipped=sum(products.map(p=>p.shipped)),backlog=sum(products.map(p=>p.backlog));
 const trace=lots.filter(l=>l.initial||l.releasedHours<=h+EPS).map(l=>({lotId:l.id,product:l.product,week:l.week,quantity:l.quantity,initial:l.initial,preloaded:l.preloaded||false,releaseHours:l.releasedHours,releaseAt:l.releasedAt,plannedDrumHours:l.plannedDrumHours,actualDrumHours:l.m1StartHours<=h?l.m1StartHours:null,inspectionHours:done(l)?l.inspectionHours:null,inspectionAt:done(l)?l.completedAt:null,shippedHours:sent(l)?l.shippedHours:null,shippedAt:sent(l)?l.shippedAt:null,observedLeadTimeDays:!l.initial&&!l.preloaded&&done(l)?(l.inspectionHours-l.releasedHours)/24:null,shippingDelayDays:sent(l)?(l.shippedHours-l.inspectionHours)/24:null,plannedLeadTimeDays:P.plannedLeadTimeDays}));
 const nextCollection=s.trips.find(tr=>tr.scheduledHours>h+EPS);
 return {mode:'dbr',elapsed:t,presentationElapsed:t,animationTime:Math.max(P.productionStart-1e-5,t),duration:P.duration,presentationDuration:P.duration,phase,week,breakdownRemaining:now>=520&&now<536?536-now:0,breakdown:{start:520,end:536,active:now>=520&&now<536},weekProgress:phase==='production'?(now-(week-1)*120)/120:0,planned:44825,completed,shipped,backlog,outstanding:44825-shipped,wip:P.initialBufferUnits+sum(lots.filter(l=>l.preloaded).map(l=>l.quantity))+released-completed,finishedGoods:completed-shipped,products,weeks,lots,componentPlan:s.componentPlan,componentTransfers:s.componentTransfers,logisticsCycles:s.logisticsCycles,logisticsCorridorPlan:s.logisticsCorridorPlan,handlingBays:s.handlingBays,internalTransportPlan:s.internalTransportPlan,internalAllocation:s.internalAllocation,timeline:s.timeline,trips:s.trips,poolPallets:s.poolPallets,initialStockDraws:s.draws.filter(d=>d.workHours<=h),stations,buffer:{units,pallets,lotCount:pallets.length,target:P.target,min:P.min,red:P.red,zone,initialUnits:P.initialBufferUnits},
 dispatch:{nextCollectionHours:nextCollection?.scheduledHours??null,countdownHours:nextCollection?Math.max(0,nextCollection.scheduledHours-now):0,countdownSeconds:nextCollection?Math.max(0,nextCollection.scheduledAt-t):0,pallets:lots.filter(l=>l.dispatchArrivalHours<=h&&!(l.truckLoadHours<=h)&&!sent(l)),collected:s.trips.filter(tr=>tr.departAt<=t&&tr.pallets>0).length},
 dbr:{logistics:logisticsMetrics([...s.timeline,...s.componentTransfers],now),workHours:now,calendarHours:dbrWorkToCalendar(now),drum:{rate:P.drumProcessingRate,planningRate:P.drumRate,processingRate:P.drumProcessingRate,produced:sum(s.drumRuns.map(r=>h<=r.start?0:h>=r.end?r.quantity:r.quantity*(h-r.start)/(r.end-r.start))),consumedBuffer:consumed,nextStartHours:lots.filter(l=>l.m1StartHours>h).sort((a,b)=>a.m1StartHours-b.m1StartHours)[0]?.m1StartHours??null},rope:{intervalHours:P.ropeIntervalHours,advanceHours:P.advanceHours,credit:consumed-released,authorizedLots:Math.floor((consumed-released)/500),nextReleaseAt:s.lots.filter(l=>l.m1StartHours>h).sort((a,b)=>a.m1StartHours-b.m1StartHours)[0]?.m1StartHours??null,status:units>P.target?'stop':units<P.min?'priority':'normal'},ropeCards:cards,trace,plannedLeadTimeDays:P.plannedLeadTimeDays,shippingDelayDays:.25},upstream,replenishments:upstream.jobs,events:s.events.filter(e=>e.hours<=h).slice(-20).reverse(),cameraHint:cards.length===1&&t<cards[0].time+3?'office':phase==='intro'||phase==='summary'?'office':phase==='opening'||phase==='closing'?'exterior':units<P.min?'buffer':'overview',dialogue:phase==='intro'?{speaker:'PCP GAMA',kind:'phone',text:'MPS conferido. Antecipamos as ordens em uma semana no tambor. Pulmão pronto, corda autorizando a reposição e coletas diárias.'}:phase==='summary'?{speaker:'PCP GAMA',kind:'summary',text:`Expedidas ${shipped.toLocaleString('pt-BR')} unidades. Em atraso: ${backlog.toLocaleString('pt-BR')} unidades.`}:null,source:P.source,assumptions:P.assumptions};
 }
}
