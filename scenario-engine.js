import { DBR_PARAMETERS as BASE, dbrScreen, drumConsumed } from './dbr-simulation.js';
import { MPS_PLAN, MPS_PARAMETERS as M } from './mps-simulation.js';
import { DbrBodySupply, upstreamWorkStart, upstreamWorkEnd } from './dbr-upstream.js';
import { DBR_LAYOUT, DBR_BAYS, dbrRoute } from './dbr-layout.js';
import { FILM_EXCEL as X } from './film-excel.js';

const EPS = 1e-7, PRODUCTS = ['Z', 'Z1', 'Z2', 'Z3'];
const IDS = ['lap', 'rosq', 'm1', 'm2', 'insp'];
const UPSTREAM = ['torno', 'us1', 'us2'];
export const STATION_NAMES = Object.freeze({ torno: 'Tornearia', us1: 'Usinagem 1', us2: 'Usinagem 2', lap: 'Lapidação', rosq: 'Rosqueadora', m1: 'Montagem 1', m2: 'Montagem 2', insp: 'Inspeção' });
// Enunciado, Tabela 2: MTTR in operational hours.
export const REPAIR_HOURS = Object.freeze({ torno: 8, us1: 8, us2: 8, lap: 8, rosq: 16, m1: 8, m2: 8, insp: 1 });
const sum = values => values.reduce((total, value) => total + value, 0);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const DEFAULT_SCENARIO_PARAMS = freeze({
  breakdowns: [{ station: 'rosq', start: (X.breakdown.week - 1) * BASE.weekHours + X.breakdown.offsetHours, duration: X.breakdown.durationHours }],
  bufferPallets: 7, bufferFactor: 1, urgentOrders: [], peaks: [], rope: true
});
export const SCENARIO_PRESETS = freeze([
  { id: 'drum-breakdown', name: 'Quebra no tambor', params: { breakdowns: [{ station: 'm1', start: 640, duration: 16 }] } },
  { id: 'half-buffer', name: 'Pulmão reduzido', params: { bufferPallets: 3 } },
  { id: 'urgent-s3', name: 'Pedido urgente na S3', params: { urgentOrders: [{ week: 3, quantity: 2000 }] } },
  { id: 'push', name: 'GAMA hoje: sem corda', params: { rope: false } }
]);

export function normalizeScenarioParams(input = {}) {
  const params = structuredClone({ ...DEFAULT_SCENARIO_PARAMS, ...input });
  if (![.25, .5, .75, 1, 1.25, 1.5].includes(params.bufferFactor)) throw new Error('Pulmão: escolha de 25% a 150%, em passos de 25%.');
  if (input.bufferPallets !== undefined && (!Number.isInteger(input.bufferPallets) || input.bufferPallets < 3 || input.bufferPallets > 10)) throw new Error('Escolha de 3 a 10 pallets.');
  if (input.bufferPallets === undefined && input.bufferFactor !== undefined) params.bufferPallets = Math.max(3, Math.min(10, Math.floor(BASE.target * input.bufferFactor / 500)));
  if (typeof params.rope !== 'boolean') throw new Error('Selecione o estado da corda.');
  if (!Array.isArray(params.breakdowns) || params.breakdowns.length > 3) throw new Error('Informe no máximo três quebras.');
  for (const stop of params.breakdowns) {
    if (!(stop.station in STATION_NAMES) || !Number.isFinite(stop.start) || stop.start < 0 || stop.start >= BASE.workHours || !Number.isFinite(stop.duration) || stop.duration <= 0) throw new Error('Quebra inválida: confira máquina, início e duração positiva.');
  }
  for (const field of ['urgentOrders', 'peaks']) {
    if (!Array.isArray(params[field]) || params[field].length > 1) throw new Error('Informe no máximo um pedido urgente e um pico.');
    for (const order of params[field]) {
      if (!Number.isInteger(order.week) || order.week < 1 || order.week > BASE.weeks) throw new Error('A semana deve estar entre 1 e 8.');
      if (field === 'urgentOrders' && (!Number.isInteger(order.quantity) || order.quantity < 0 || order.quantity > 3000 || order.quantity % M.lotSize !== 0)) throw new Error('Pedido urgente: de 0 a 3.000 un, em passos de 500.');
      if (field === 'peaks' && ![20, 40].includes(order.percent)) throw new Error('Pico de demanda: escolha 20% ou 40%.');
    }
  }
  params.urgentOrders = params.urgentOrders.filter(order => order.quantity > 0);
  return params;
}

export function mergeBreakdowns(breakdowns, station) {
  const result = [];
  for (const stop of breakdowns.filter(item => item.station === station).map(item => ({ start: item.start, end: item.start + item.duration })).sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1);
    if (previous && stop.start <= previous.end) previous.end = Math.max(previous.end, stop.end);
    else result.push({ ...stop });
  }
  return result;
}

export function shiftHours(start, end, dailyHours) {
  let total = 0;
  for (let day = Math.floor(start / 24); day < Math.ceil(end / 24); day++) total += Math.max(0, Math.min(end, day * 24 + dailyHours) - Math.max(start, day * 24));
  return total;
}

export function productiveHours(start, end, dailyHours, stops = []) {
  if (end <= start) return 0;
  return shiftHours(start, end, dailyHours) - sum(stops.map(stop => shiftHours(Math.max(start, stop.start), Math.min(end, stop.end), dailyHours)));
}

function workStart(time, shift, stops) {
  let at = upstreamWorkStart(time, shift);
  for (;;) {
    const stop = stops.find(item => at >= item.start - EPS && at < item.end - EPS);
    if (!stop) return at;
    at = upstreamWorkStart(stop.end, shift);
  }
}

function workEnd(start, duration, shift, stops) {
  let at = start, left = duration;
  while (left > EPS) {
    const day = Math.floor((at + EPS) / 24), hour = at - day * 24;
    if (hour >= shift - EPS) { at = (day + 1) * 24; continue; }
    const current = stops.find(stop => at >= stop.start - EPS && at < stop.end - EPS);
    if (current) { at = current.end; continue; }
    const next = stops.find(stop => stop.start > at);
    const stop = Math.min(day * 24 + shift, next?.start ?? Infinity), used = Math.min(left, stop - at);
    at += used; left -= used;
    if (used < EPS) at += EPS * 2;
  }
  return at;
}

// Same replenishment scheduling as DbrBodySupply; only repair intervals differ.
class ScenarioBodySupply extends DbrBodySupply {
  constructor(options, stops) { super(options); this.stops = stops; }
  schedule(body, hours) {
    const quantity = this.policy.replenishmentLot;
    const job = { id: `DBR-REP-${this.jobs.length + 1}`, body, quantity, triggerHours: hours, triggerAt: this.toScreen(hours), timeline: [] };
    let ready = hours, from = 'raw';
    for (const [index, station] of UPSTREAM.entries()) {
      const dailyHours = M.shifts[station] * 8;
      const processingHours = quantity * M.nominalTimes[body === 'z3' ? 'Z3' : 'Z'][index] / M.machines[station];
      const setupHours = this.policy.setupHours[station], nominalHours = setupHours + processingHours;
      const transfer = this.moveJob?.(job, from, station, Math.max(ready, this.resources[station]));
      if (transfer) ready = transfer.endHours;
      const stops = this.stops[station];
      const startHours = workStart(Math.max(ready, this.resources[station]), dailyHours, stops);
      const endHours = stops.length ? workEnd(startHours, nominalHours, dailyHours, stops) : upstreamWorkEnd(startHours, nominalHours, dailyHours);
      job.timeline.push({ id: `${job.id}-${station}`, lotId: job.id, kind: 'replenishment-process', station, stage: station, body, quantity,
        startHours, endHours, start: this.toScreen(startHours), end: this.toScreen(endHours), nominalHours, processingHours, setupHours, dailyHours });
      ready = endHours; this.resources[station] = endHours; from = station;
    }
    const finalTransfer = this.moveJob?.(job, 'us2', 'stock', ready);
    if (finalTransfer) ready = finalTransfer.endHours;
    job.completedHours = ready; job.completedAt = this.toScreen(ready); this.jobs.push(job); return job;
  }
}

export function scenarioConsumed(lot, hours, stops) {
  if (!stops.length) return drumConsumed(lot, hours);
  if (lot.m1StartHours == null || hours <= lot.m1StartHours) return 0;
  if (hours >= lot.m1EndHours) return lot.quantity;
  return lot.quantity * productiveHours(lot.m1StartHours, hours, BASE.shifts.m1, stops)
    / productiveHours(lot.m1StartHours, lot.m1EndHours, BASE.shifts.m1, stops);
}

export function scenarioBufferAt(result, hours) {
  const pallets = result.lots.filter(lot => (lot.initial || lot.enteredBufferHours != null && lot.enteredBufferHours <= hours + EPS) && !(lot.m1EndHours <= hours + EPS))
    .map(lot => { const quantity = lot.quantity - scenarioConsumed(lot, hours, result.stops.m1); return { id: lot.id, product: lot.product, quantity, remaining: quantity, initial: lot.initial, slot: lot.bufferSlot, feeding: lot.bufferReleasedHours <= hours + EPS }; });
  const units = sum(pallets.map(lot => lot.quantity));
  const { target, min, red } = result.parameters;
  return { units, pallets, lotCount: pallets.length, target, min, red, initialUnits: target, zone: units >= min ? 'green' : units >= red ? 'yellow' : 'red' };
}

function makeOrders(params) {
  const plan = MPS_PLAN.map(week => ({ ...week, products: { ...week.products } }));
  for (const peak of params.peaks) plan[peak.week - 1].products.Z3 *= 1 + peak.percent / 100;
  const orders = plan.flatMap(week => PRODUCTS.map(product => ({ id: `MPS-S${week.week}-${product}`, week: week.week, product, quantity: week.products[product], dueHours: week.week * BASE.weekHours,
    availableHours: Math.max(0, (week.week - 2) * BASE.weekHours), releaseAvailableHours: Math.max(0, (week.week - 3) * BASE.weekHours) })));
  for (const [index, urgent] of params.urgentOrders.entries()) orders.push({ id: `EXTRA-S${urgent.week}-${index + 1}`, week: urgent.week, product: 'Z3', quantity: urgent.quantity,
    availableHours: (urgent.week - 1) * BASE.weekHours, releaseAvailableHours: (urgent.week - 1) * BASE.weekHours, dueHours: urgent.week * BASE.weekHours, extra: true });
  return orders;
}

// Industrial loop is copied from dbr-simulation.buildSchedule. Physical bay
// and forklift reservations intentionally remain; presentation compilation does not.
export function runScenario(input = {}) {
 const params=normalizeScenarioParams(input),breakdowns=params.breakdowns;
 const stops=Object.fromEntries(Object.keys(STATION_NAMES).map(id=>[id,mergeBreakdowns(breakdowns,id)]));
 const target=params.bufferPallets*500+71.3125;
 const P={...BASE,target,min:target*.7,red:target*.35,initialBufferUnits:target};
 const transferSeconds=P.transferSeconds,orders=makeOrders(params),initialPallets=Math.floor(P.target/M.lotSize);
 const consumed=(lot,h)=>scenarioConsumed(lot,h,stops.m1);
 const broken=(id,h)=>stops[id].some(stop=>h>=stop.start-EPS&&h<stop.end-EPS);

 const lots=[],timeline=[],ropeCards=[],events=[],trips=[],bufferLedger=[],draws=[],poolPallets=[],drumRuns=[],pending=[],buffer=[],bufferWait=[],queue={lap:[],rosq:[],m2:[],insp:[]};
 let initialLeft=initialPallets*M.lotSize,serial=0,t=0,credit=0,nextDrum=0,id=0;
 for(const o of orders){let left=o.quantity;while(left>EPS){const initial=!o.extra&&o.week>1&&o.product==='Z3'&&initialLeft>=500&&left>=500;const quantity=Math.min(500,left);const lot={id:initial?`BUF-INI-${initialPallets+1-initialLeft/500}`:`DBR-${String(++id).padStart(3,'0')}`,orderId:o.id,week:o.week,product:o.product,quantity,initial,...(o.extra?{extra:true}:{}),dueHours:o.dueHours,availableHours:o.availableHours,releaseAvailableHours:o.releaseAvailableHours,releasedHours:initial?null:Infinity,timeline:[],initialDraws:[],stage:initial?'buffer':'planned',enteredBufferHours:initial?0:null,bufferSlot:initial?initialPallets-initialLeft/500:null};
 if(initial){initialLeft-=500;buffer.push(lot);poolPallets.push({...lot,initialQuantity:500});}else pending.push(lot);lots.push(lot);left-=quantity;}}
 pending.sort((a,b)=>Number(!!a.extra)-Number(!!b.extra)||(a.week-b.week)||((a.product==='Z3'?0:1)-(b.product==='Z3'?0:1)));
 pending.sort((a,b)=>a.dueHours-b.dueHours);
 // As in Simulação DBR, upstream starts empty. The S1 Z3 is a new release.
 const reserve={id:'BUF-RESERVE',orderId:'INITIAL-PROTECTION',week:9,product:'Z3',quantity:P.initialBufferUnits-initialPallets*M.lotSize,initial:true,protection:true,dueHours:Infinity,availableHours:Infinity,releaseAvailableHours:Infinity,releasedHours:null,timeline:[],initialDraws:[],stage:'buffer',enteredBufferHours:0,bufferSlot:10};
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
  if(to==='m1'&&broken('m1',startHours)){const repair=stops.m1.find(stop=>startHours>=stop.start-EPS&&startHours<stop.end-EPS);return move(lot,from,to,repair.end,{slot,fromSlot,vehicle,fromMachine,toMachine});}
  const fromPosition=DBR_BAYS[from][fromSlot%DBR_BAYS[from].length],toPosition=DBR_BAYS[to][slot%DBR_BAYS[to].length];
  const e=add(lot,{kind:'transfer',transportMode:'forklift',visualDuration:transferSeconds,from,to,fromSlot,toSlot:slot,vehicleId:`forklift-${vi+1}`,vehicleIndex:vi,busyStart,startHours,endHours,hours:startHours,start:dbrScreen(startHours),end:dbrScreen(endHours),approachStart:dbrScreen(busyStart),fromPosition:[...fromPosition],toPosition:[...toPosition],fromMachine,toMachine,route:dbrRoute(from,to,fromPosition,toPosition)});motions[vi].push(e);return e;
 }
 const bodySupply=new ScenarioBodySupply({screenAt:dbrScreen,moveJob:(job,from,to,h)=>move(job,from,to,h,{vehicle:3})},stops);
 // N(t)=N(t-1)+inflow-consumption in Simulação DBR. Committing a pallet
 // to the cell authorizes the rope, but its units are consumed progressively.
 const bufferUnits=()=>sum(buffer.map(l=>l.quantity))+sum(slots.m1.filter(l=>l&&!buffer.includes(l)).map(l=>l.quantity-consumed(l,t)));
 function stationEnd(start,duration,shift,station){return workEnd(start,duration,shift,stops[station]);}
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
   const inbound=timeline.filter(e=>e.kind==='transfer'&&e.to==='buffer'&&e.endHours>t).reduce((n,e)=>n+e.quantity,0);if(params.rope&&bufferUnits()+inbound+lot.quantity>P.target+EPS)continue;
   const b=bufferSlots.findIndex(x=>x===null);if(b<0)continue;bufferWait.splice(bufferWait.indexOf(lot),1);bufferSlots[b]=lot.id;lot.bufferSlot=b;
   const tr=move(lot,'rosq','buffer',t,{fromSlot:lot.stageBays.rosq,slot:b,fromMachine:DBR_LAYOUT.rosq[lot.machineSlots.rosq]});lot.enteredBufferHours=tr.endHours;push(tr.startHours,()=>{stageBays.rosq[lot.stageBays.rosq]=null;});
   push(tr.endHours,()=>{buffer.push(lot);bufferLedger.push({hours:tr.endHours,units:bufferUnits(),type:'arrival',lotId:lot.id,quantity:lot.quantity});});
  }
 }
 function release(){
  if(t<0||(params.rope&&(bufferUnits()>P.target+EPS||credit<EPS)))return false;
  const eligible=l=>l.releaseAvailableHours<=t+EPS&&(!params.rope||credit+EPS>=l.quantity)&&bodySupply.earliestAvailability(l.product==='Z3'?'z3':'generic',l.quantity,t)<=t+EPS;
  let index=pending.findIndex(eligible);
  let l=index>=0?pending[index]:null;
  if(params.rope&&!l&&pending.length===0){const quantity=Math.min(500,credit);l={id:`PROT-${String(lots.filter(l=>l.protection).length+1).padStart(3,'0')}`,orderId:'REPOSICAO-PULMAO',week:9,product:'Z3',quantity,protection:true,initial:false,dueHours:Infinity,availableHours:Infinity,releaseAvailableHours:0,releasedHours:Infinity,timeline:[],initialDraws:[],enteredBufferHours:null};}
  if(!l)return false;const result=bodySupply.tryRelease(l,t);if(!result.accepted)return false;
  if(index>=0)pending.splice(index,1);else lots.push(l);if(params.rope)credit-=l.quantity;l.releasedHours=t;l.plannedDrumHours=t+P.advanceHours;queue.lap.push(l);
  const priority=bufferUnits()<P.min,card={id:`CORDA-${ropeCards.length+1}`,time:dbrScreen(t),hours:t,quantity:l.quantity,lotIds:[l.id],priority,animate:ropeCards.length===0,bufferUnits:bufferUnits(),status:'Liberado'};if(params.rope){ropeCards.push(card);l.ropeCardId=card.id;}
  events.push({time:dbrScreen(t),hours:t,type:params.rope?'rope-release':'push-release',text:`${params.rope?'Corda autoriza':'Produção empurrada libera'} ${l.id} · ${l.product} · ${l.quantity} un${priority?' com prioridade':''}.`});return true;
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
 for(const stop of breakdowns)for(const [h,type]of [[stop.start,'breakdown-start'],[stop.start+stop.duration,'breakdown-end']])events.push({time:dbrScreen(h),hours:h,type,station:stop.station,text:`${STATION_NAMES[stop.station]}: ${type==='breakdown-start'?'início da manutenção':'manutenção concluída'}.`});
 for(let h=P.collectionHours;h<=P.workHours;h+=P.collectionHours)push(h-6,()=>collect(h));
 let guard=0;
 while(t<P.workHours+4*24-EPS&&guard++<100000){
  const due=tasks.filter(x=>x.hours<=t+EPS);for(const x of due){tasks.splice(tasks.indexOf(x),1);x.fn();}
  deliverBuffer();while(release()){}
  for(const id of ['m1','lap','rosq','m2','insp']){
   for(let m=0;m<slots[id].length;m++){
    if((id==='m1'&&(t<0||t<nextDrum-EPS))||broken(id,t)||slots[id][m]||!stageBays[id].includes(null)||((t%24)+24)%24>=P.shifts[id]-EPS)continue;
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
 const result={params,parameters:P,breakdowns,stops,orders,lots,timeline,ropeCards,events,trips,bufferLedger,draws,poolPallets,drumRuns,bodySupply,motions};
 const hours=new Set(Array.from({length:P.workHours+1},(_,i)=>i));
 for(const stop of breakdowns)for(const h of [stop.start,stop.start+stop.duration])if(h>=0&&h<=P.workHours)hours.add(h);
 for(const l of lots)for(const h of [l.enteredBufferHours,l.m1StartHours,l.m1EndHours])if(h!=null&&h>=0&&h<=P.workHours){hours.add(h);if(h>1e-5)hours.add(h-1e-5);}
 bufferLedger.splice(0,bufferLedger.length,...[...hours].sort((a,b)=>a-b).map(h=>({hours:h,units:scenarioBufferAt(result,h).units,type:h===0?'opening':'balance'})));
 for(const l of lots){l.releasedAt=l.initial?0:dbrScreen(l.releasedHours);l.completedAt=l.inspectionHours==null?Infinity:dbrScreen(l.inspectionHours);l.shippedAt=l.shippedHours==null?Infinity:dbrScreen(l.shippedHours);l.bufferEnteredAt=l.enteredBufferHours==null?Infinity:dbrScreen(l.enteredBufferHours);l.bufferReleasedAt=l.bufferReleasedHours==null?Infinity:dbrScreen(l.bufferReleasedHours);l.plannedDrumHours=l.initial?l.availableHours:l.releasedHours+P.advanceHours;l.plannedReleaseHours=l.releaseAvailableHours;}
 for(const job of bodySupply.jobs)timeline.push(...job.timeline.filter(e=>e.kind==='replenishment-process'));
 timeline.sort((a,b)=>a.start-b.start||a.end-b.end);for(const l of lots)l.timeline.sort((a,b)=>a.start-b.start);
 result.kpis=scenarioKpis(result);
 return result;
}


export function scenarioKpis(result) {
  const horizon = BASE.workHours, demand = result.lots.filter(lot => !lot.protection);
  const planned = sum(demand.map(lot => lot.quantity));
  const onTimeUnits = sum(demand.filter(lot => Number.isFinite(lot.shippedHours) && lot.shippedHours <= Math.min(horizon, lot.dueHours) + EPS).map(lot => lot.quantity));
  const shippedUnits = sum(demand.filter(lot => Number.isFinite(lot.shippedHours) && lot.shippedHours <= horizon + EPS).map(lot => lot.quantity));
  const boundaries = new Set([0, horizon]);
  const add = value => { if (Number.isFinite(value) && value > 0 && value < horizon) boundaries.add(value); };
  for (let hour = 0; hour <= horizon; hour += 24) { add(hour); add(hour + BASE.shifts.m1); }
  for (const lot of result.lots) [lot.enteredBufferHours, lot.m1StartHours, lot.m1EndHours, lot.availableHours].forEach(add);
  for (const stop of result.stops.m1) { add(stop.start); add(stop.end); }
  const points = [...boundaries].sort((a, b) => a - b);
  let drumStarvedHours = 0, bufferMin = Infinity, yellowHours = 0, redHours = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1], b = points[index], mid = (a + b) / 2;
    const broken = result.stops.m1.some(stop => mid >= stop.start && mid < stop.end);
    const active = result.lots.some(lot => lot.m1StartHours != null && lot.m1StartHours <= mid && lot.m1EndHours > mid);
    const waiting = demand.some(lot => lot.availableHours <= mid && !(lot.m1EndHours <= mid));
    if (!broken && !active && waiting) drumStarvedHours += shiftHours(a, b, BASE.shifts.m1);
    const first = scenarioBufferAt(result, a).units;
    const last = first - sum(result.lots.map(lot => scenarioConsumed(lot, b, result.stops.m1) - scenarioConsumed(lot, a, result.stops.m1)));
    bufferMin = Math.min(bufferMin, first, last);
    const cuts = [0, 1];
    for (const limit of [result.parameters.min, result.parameters.red]) {
      const crossing = (limit - first) / (last - first);
      if (crossing > 0 && crossing < 1) cuts.push(crossing);
    }
    cuts.sort((x, y) => x - y);
    for (let part = 1; part < cuts.length; part++) {
      const value = first + (last - first) * (cuts[part] + cuts[part - 1]) / 2;
      const hours = (b - a) * (cuts[part] - cuts[part - 1]);
      if (value < result.parameters.red) redHours += hours;
      else if (value < result.parameters.min) yellowHours += hours;
    }
  }
  let wipArea = 0, completedArea = 0, completedCohortUnits = 0, leadArea = 0;
  for (const lot of result.lots) {
    const released = lot.initial ? 0 : lot.releasedHours;
    if (!Number.isFinite(released) || released >= horizon) continue;
    const end = Math.min(horizon, lot.inspectionHours ?? Infinity), area = lot.quantity * Math.max(0, end - released);
    wipArea += area;
    if (!lot.initial && Number.isFinite(lot.inspectionHours) && lot.inspectionHours <= horizon) {
      completedArea += area; completedCohortUnits += lot.quantity; leadArea += lot.quantity * (lot.inspectionHours - released);
    }
  }
  const meanLeadDays = completedCohortUnits ? leadArea / completedCohortUnits / 24 : null;
  const throughput = sum(demand.filter(lot => Number.isFinite(lot.inspectionHours) && lot.inspectionHours <= horizon).map(lot => lot.quantity)) / horizon;
  const breakdowns = result.breakdowns.map(stop => {
    const start = Math.max(0, stop.start), end = Math.min(horizon, stop.start + stop.duration);
    return { ...stop, hours: Math.max(0, end - start), shiftHours: shiftHours(start, end, M.shifts[stop.station] * 8) };
  });
  const drumBreakdownHours = sum(result.stops.m1.map(stop => shiftHours(Math.max(0, stop.start), Math.min(horizon, stop.end), BASE.shifts.m1)));
  return { planned, onTimeUnits, onTimePercent: onTimeUnits / planned * 100, shippedUnits, lateUnits: planned - onTimeUnits, unshippedUnits: planned - shippedUnits,
    drumStarvedHours, drumBreakdownHours, breakdowns, bufferMin: Math.min(bufferMin, scenarioBufferAt(result, horizon).units), yellowHours, redHours,
    averageWip: wipArea / horizon, meanLeadDays, throughput,
    little: { cohortThroughput: completedCohortUnits / horizon, completedContribution: completedArea / horizon, boundaryContribution: (wipArea - completedArea) / horizon,
      relativeGap: wipArea ? (wipArea - completedArea) / wipArea : 0 },
    unrealizedGain: (planned - shippedUnits) * X.comparison.B.lostGain / X.comparison.B.lostUnits };
}
