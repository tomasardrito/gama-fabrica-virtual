import {reviewInternalPilots,measureInternalCycle,compileInternalTransport,prepareInternalAccess,internalSweepReservations,createInternalDemonstration,internalOperatorCandidates,retimeInternalMission,compressEmptyMission} from './internal-motion.js';
import {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles} from './internal-layout.js';
import {LOGISTICS_LAYOUT,truckSlot,boxCorners,boxesOverlap,logisticsSiteObstacles} from './logistics-layout.js';
import {planTruckVisits,externalCycleSweeps,compileExternalCycles,reserveExternalCorridors,createTemporalIndex,coalesceReservations,externalTrafficConflicts,planExternalCirculation} from './logistics-motion.js';
// Screen choreography is compiled only after the industrial schedule is final.
// Buffer arrivals/withdrawals, inspection and departures are immutable anchors.
import {DBR_LAYOUT,DBR_BAYS,dbrRoute,dbrWorkStand,dbrStationAccessRoute,routeLength} from './dbr-layout.js';
import {isConveyorLink,conveyorRoute} from './dbr-conveyors.js';
import {conveyorProgress} from './conveyor-traffic.js';
const EPS = 1e-7;
const sum = xs => xs.reduce((n, x) => n + x, 0);
const clamp = n => Math.max(0, Math.min(1, n));
function timingException(event,exception){(event.presentationExceptions??=[]).push(exception);event.presentationException=exception;}
export function transferProgress(event, seconds) {
  if(event.transportMode==='conveyor')return conveyorProgress(event,seconds);
  const hold = Math.min(.2, (event.end-event.start)*.15);
  return clamp((seconds-event.start-hold)/(event.end-event.start-2*hold));
}
export function transferLift(event, seconds) {
  const hold = Math.min(.2, (event.end-event.start)*.15);
  return .32 * clamp(Math.min((seconds-event.start)/hold, (event.end-seconds)/hold));
}

function fit(events, start, end, transferSeconds) {
  if (!events.length) return;
  const pieces = [];
  let previous = events[0].start;
  for (const event of events) {
    const gap = Math.max(0, event.start - previous);
    if (gap > EPS) pieces.push({minimum: 0, weight: gap});
    const duration = event.end - event.start;
    // Request readable travel on each physical link. Work continues symbolically
    // at the adjacent fixture; partial MPS pallets retain shorter real windows.
    const minimum=event.kind==='transfer'?transferSeconds:Math.min(.1,duration);
    pieces.push({event, minimum, weight: event.kind === 'transfer' ? 0 : duration});
    previous = event.end;
  }
  const span = end - start;
  if (!(span > 0)) throw new Error(`Janela visual inválida: ${events[0].lotId}`);
  const required = sum(pieces.map(p => p.minimum));
  const scale = Math.min(1, span / required);
  const extra = Math.max(0, span - required);
  const weight = sum(pieces.map(p => p.weight));
  let at = start;
  for (const p of pieces) {
    const duration = p.minimum * scale + (weight ? extra * p.weight / weight : 0);
    if (p.event) { p.event.start = at; p.event.end = at + duration;if(p.event.kind==='transfer'&&duration<transferSeconds-EPS)timingException(p.event,{class:'anchored-chain',requested:transferSeconds,available:duration,chainStart:start,chainEnd:end,required,scale}); }
    at += duration;
  }
  events.at(-1).end = end;
}

export function compileDbrPresentation(schedule, {screenAt, transferSeconds, approachSeconds}) {
  const {lots, timeline, trips, bodySupply} = schedule;
  for(const e of timeline.filter(e=>e.kind==='transfer'&&isConveyorLink(e.from,e.to))){
    e.transportMode='conveyor';e.vehicleId=null;e.vehicleIndex=null;
    e.route=conveyorRoute(e.from,e.to,e.fromPosition,e.toPosition);
  }
  for (const lot of lots) {
    const before = lot.timeline.filter(e => e.to === 'lap' || e.station === 'lap' || e.to === 'rosq' || e.station === 'rosq' || e.to === 'buffer');
    if (before.length) fit(before, screenAt(lot.releasedHours), lot.enteredBufferHours == null ? before.at(-1).end : screenAt(lot.enteredBufferHours), transferSeconds);
    const after = lot.timeline.filter(e => ['m1','m2','insp'].includes(e.to) || ['m1','m2','insp'].includes(e.station));
    if (after.length) fit(after, screenAt(lot.bufferReleasedHours), screenAt(lot.inspectionHours), transferSeconds);
  }
  for (const job of bodySupply.jobs) fit(job.timeline, screenAt(job.triggerHours), screenAt(job.completedHours), transferSeconds);

  let previousDeparture = -Infinity;
  for (const trip of trips) {
    const cargo = trip.lotIds.map(id => lots.find(l => l.id === id)).sort((a,b) => a.inspectionHours-b.inspectionHours);
    // A short daily window compresses choreography, never manufacturing time.
    // Include one approach to the dock and one door-closing interval.
    const step = Math.min(transferSeconds, (trip.departAt-previousDeparture)/(cargo.length+1), ...cargo.map((l,i) => (trip.departAt-screenAt(l.inspectionHours))/(cargo.length-i+2)));
    trip.loadEnd = trip.departAt - step;
    trip.loadStart = trip.loadEnd - cargo.length * step;
    for (const [i, lot] of cargo.entries()) {
      const outbound = lot.timeline.find(e => e.to === 'truck');
      outbound.start = trip.loadStart + i * step;
      outbound.end = outbound.start + step;
      if(step<transferSeconds-EPS)timingException(outbound,{class:'daily-collection',tripId:trip.id,requested:transferSeconds,available:step,deadline:trip.departAt});
      const inbound = lot.timeline.find(e => e.to === 'dispatch');
      inbound.start = screenAt(lot.inspectionHours);
      inbound.end = outbound.start - .3;
      if(inbound.end-inbound.start<transferSeconds-EPS)timingException(inbound,{class:'daily-collection',tripId:trip.id,requested:transferSeconds,available:inbound.end-inbound.start,deadline:outbound.start,clearance:.3});
    }
    previousDeparture = trip.departAt;
  }

  planTruckVisits(trips);

  // Distribute overlapping screen process windows over the existing machines.
  // The industrial cell capacity was already fixed before this projection.
  for(const [station,fixtures] of Object.entries(DBR_LAYOUT)) {
    const freeAt=fixtures.map(()=>-Infinity);
    for(const e of timeline.filter(e=>e.kind==='process'&&e.station===station).sort((a,b)=>a.start-b.start)) {
      const machine=freeAt.findIndex(at=>at<=e.start+EPS);
      if(machine<0)throw new Error(`Sem máquina visual livre: ${station}`);
      e.machineIndex=machine;freeAt[machine]=e.end;
      const lot=lots.find(l=>l.id===e.lotId);lot.machineSlots[station]=machine;
      const inbound=lot.timeline.find(x=>x.to===station);
      const outbound=lot.timeline.find(x=>x.from===station);
      if(inbound)inbound.toMachine=fixtures[machine];
      if(outbound)outbound.fromMachine=fixtures[machine];
    }
  }
  const bookings = Array.from({length:LOGISTICS_LAYOUT.fleet.length}, () => []);
  const priority = e => e.lotId.startsWith('DBR-REP-')?0:e.to==='lap'?1:e.to==='truck'?2:3;
  const transfers = timeline.filter(e => e.kind === 'transfer'&&e.transportMode!=='conveyor').sort((a,b) => priority(a)-priority(b) || a.end-b.end);
  for (const e of transfers) {
    const candidates = e.to === 'truck'||e.to==='dispatch' ? [1,4,0,2] : e.lotId.startsWith('DBR-REP-') ? [2,4,0,1] : [0,4,2,1];
    let windows = [];
    const findWindows=()=>{windows=[];
    for (const vi of candidates) {
      let cursor = e.start;
      for (const booking of [...bookings[vi], {start:Infinity,end:Infinity}]) {
        const end = Math.min(e.end, booking.start-approachSeconds);
        if (end >= cursor + .6 && (e.from !== 'buffer' || Math.abs(cursor-e.start)<EPS) && (e.to !== 'buffer' || Math.abs(end-e.end)<EPS)) windows.push({vi,start:cursor,end});
        cursor = Math.max(cursor, booking.end+approachSeconds);
        if (cursor >= e.end) break;
      }
    }
    };findWindows();
    // Reclaim surplus in an earlier reservation before creating a tiny move.
    // All retained loaded travel windows remain at least 600 ms (36 frames).
    if(!windows.length){
      for(const vi of candidates){
        const conflicts=bookings[vi].filter(b=>b.start<e.end+approachSeconds&&b.end>e.start-approachSeconds);
        if(conflicts.length!==1)continue;
        const b=conflicts[0],end=Math.min(b.end,e.end-approachSeconds-.6-1e-6);
        const originalDuration=b.end-b.start;
        if(end-b.start>=.6&&end<b.end)b.end=end;
        else {const start=Math.max(b.start,e.start+.6+approachSeconds+1e-6);if(b.end-start<.6)continue;b.start=start;}
        timingException(b,{class:'shared-resource',originalDuration,minimum:.6,conflict:e.id});
        findWindows();if(windows.length)break;
      }
    }
    windows.sort((a,b) => candidates.indexOf(a.vi)-candidates.indexOf(b.vi) || (b.end-b.start)-(a.end-a.start));
    const window = windows[0];
    if (!window) throw new Error(`Sem janela de transporte visual: ${e.id} ${e.from}>${e.to} ${e.start}-${e.end}: ${JSON.stringify(candidates.map(i=>[i,bookings[i].filter(b=>b.start<e.end+.25&&b.end>e.start-.25).map(b=>[b.id,b.from,b.to,b.start,b.end])]))}`);
    const originalWindow=[e.start,e.end];
    e.start = window.start;
    e.end = e.to==='dispatch'?Math.min(window.end,window.start+transferSeconds):window.end;
    if(e.end-e.start<Math.min(transferSeconds,originalWindow[1]-originalWindow[0])-EPS)timingException(e,{class:'shared-resource',originalWindow,available:e.end-e.start,vehicleId:`forklift-${window.vi+1}`});
    e.vehicleIndex = window.vi;
    e.vehicleId = `forklift-${window.vi+1}`;
    bookings[window.vi].push(e);
    bookings[window.vi].sort((a,b) => a.start-b.start);
  }
  for (const list of bookings) for (let i=0; i<list.length; i++) {
    list[i].approachStart = Math.max(i ? list[i-1].end : 25, list[i].start-approachSeconds/2);
    list[i].returnEnd=list[i].end+approachSeconds/2;
  }
  // A visual work pallet occupies its roller table until its outbound move,
  // even if the industrial clock has already released that staging position.
  for(const stage of ['lap','rosq','m1','m2','insp']){
    const freeAt=DBR_BAYS[stage].map(()=>-Infinity);
    for(const inbound of timeline.filter(e=>e.kind==='transfer'&&e.to===stage).sort((a,b)=>a.end-b.end)){
      const outbound=timeline.find(e=>e.kind==='transfer'&&e.lotId===inbound.lotId&&e.from===stage);
      const eligible=stage==='lap'?(inbound.vehicleIndex===4?[4,3]:[0,1,3,4]):freeAt.map((_,i)=>i);
      const slot=eligible.find(i=>freeAt[i]<=inbound.start+EPS)??-1;
      if(slot<0)throw new Error(`Sem mesa de acumulação: ${stage}`);
      freeAt[slot]=outbound?.end??Infinity;
      inbound.toPosition=[...DBR_BAYS[stage][slot]];
      if(outbound)outbound.fromPosition=[...DBR_BAYS[stage][slot]];
    }
  }
  const bufferFree=DBR_BAYS.buffer.map(()=>-Infinity),bufferClear=DBR_BAYS.buffer.map(()=>-Infinity);
  for(const lot of lots.filter(l=>l.initial)){const outgoing=lot.timeline.find(e=>e.from==='buffer');bufferFree[lot.bufferSlot]=(outgoing?.start??Infinity)+.2;bufferClear[lot.bufferSlot]=outgoing?.end??Infinity;}
  for(const inbound of timeline.filter(e=>e.to==='buffer').sort((a,b)=>a.start-b.start)){
    const available=bufferFree.map((at,i)=>({at,i,clear:bufferClear[i]})).filter(b=>b.at<=inbound.end-.2+EPS).sort((a,b)=>a.clear-b.clear||a.i-b.i),slot=available[0]?.i??-1,lot=lots.find(l=>l.id===inbound.lotId),outbound=lot.timeline.find(e=>e.from==='buffer');
    if(slot<0)throw new Error('Pulmão sem posição visual livre');
    bufferFree[slot]=(outbound?.start??Infinity)+.2;bufferClear[slot]=outbound?.end??Infinity;lot.bufferSlot=slot;
    inbound.toPosition=[...DBR_BAYS.buffer[slot]];if(outbound)outbound.fromPosition=[...DBR_BAYS.buffer[slot]];
  }
  for(const e of timeline.filter(e=>e.to==='stock'&&e.lotId.startsWith('DBR-REP-')))e.toPosition=[19.5,-12];
  const stockFree=LOGISTICS_LAYOUT.stockPickupBays.map(()=>-Infinity);
  for(const e of timeline.filter(e=>e.from==='stock'&&e.to==='lap').sort((a,b)=>a.start-b.start)){
    const slot=stockFree.findIndex(t=>t<=e.start-approachSeconds+EPS);
    if(slot<0)throw new Error(`No distinct stock pickup bay: ${e.id}`);
    stockFree[slot]=e.end;e.fromPosition=[...LOGISTICS_LAYOUT.stockPickupBays[slot]];e.stockPickupSlot=slot;
  }
  // Load deepest slots first in the EFFECTIVE appointment order, not order-list order.
  for(const trip of trips)for(const [i,e]of timeline.filter(e=>e.to==='truck'&&trip.lotIds.includes(e.lotId)).sort((a,b)=>a.start-b.start).entries()){e.toPosition=truckSlot(trip.dockIndex,i);e.dockIndex=trip.dockIndex;}
  for(const e of timeline.filter(e=>e.kind==='transfer'))e.route=(e.transportMode==='conveyor'?conveyorRoute:dbrRoute)(e.from,e.to,e.fromPosition,e.toPosition,e.vehicleIndex);
  timeline.sort((a,b) => a.start-b.start || a.end-b.end);
  for (const lot of lots) lot.timeline.sort((a,b) => a.start-b.start || a.end-b.end);
  return schedule;
}

// Opt-in integration trial: one real event, never a claim about all 535 links.
export function compileInternalTrial(schedule,{link='m1>m2'}={}){
 const pilot=reviewInternalPilots(schedule).find(p=>p.link===link);
 if(!pilot)throw new Error(`Unknown internal pilot: ${link}`);
 return {scope:`prototype-${link.replace('>','-')}`,complete:false,proposedWindow:true,plan:pilot.plan,requirements:pilot.plan.missions.map(m=>({transferId:m.transfer.id,start:m.start,loadedStart:m.transfer.start,loadedEnd:m.transfer.end,end:m.end,originalStart:pilot.raw.start,originalEnd:pilot.raw.end,operatorId:m.operator.id,carrierId:m.carrier.id}))};
}

export function internalWindowRequirements(schedule){
 return schedule.timeline.filter(e=>isConveyorLink(e.from,e.to)).map(e=>{
  const lot=schedule.lots.find(l=>l.id===e.lotId),before=e.to==='rosq'||e.to==='buffer';
  const origin=before?lot.releasedAt:lot.bufferReleasedAt,deadline=before?lot.bufferEnteredAt:lot.completedAt;
  const chain=lot.timeline.filter(x=>x.kind==='transfer'&&(before?['lap','rosq','buffer'].includes(x.to):['m1','m2','insp'].includes(x.to)));
  return {id:e.id,lotId:e.lotId,from:e.from,to:e.to,start:e.start,end:e.end,startHours:e.startHours,endHours:e.endHours,chainOrigin:origin,chainDeadline:deadline,chainBudget:deadline-origin,siblingTransfers:chain.map(x=>x.id),fromPosition:e.fromPosition,toPosition:e.toPosition};
 });
}

// Shared A1/D1 planning contract. D owns measured routes/cycle phases; A1
// compares each assigned bay with immutable anchors. Proposed windows and
// inter-bay access still require D1 validation; they are not a joint agenda.
export function coordinateInternalWindows(schedule){
 const pilots=new Map(INTERNAL_PILOTS.map(p=>[p.link,p]));
 const requirements=internalWindowRequirements(schedule).map(w=>{
  const pilot=pilots.get(`${w.from}>${w.to}`),template=internalPilotInput(w,pilot);
  const slot=(stage,position)=>{const i=(schedule.handlingBays||DBR_BAYS)[stage].findIndex(p=>Math.hypot(p[0]-position[0],p[1]-position[1])<EPS);if(i<0)throw new Error(`Unknown bay: ${w.id} ${stage}`);return i;};
  const fromSlot=slot(w.from,w.fromPosition),toSlot=slot(w.to,w.toPosition),fromPosition=[...INTERNAL_LAYOUT.bays[w.from][fromSlot]],toPosition=[...INTERNAL_LAYOUT.bays[w.to][toSlot]];
  // Keep each D carrier/operator at its single published home. The connector
  // to another source bay is a candidate for D's swept check, not a new rig.
  const operator={...template.operator,approachRoute:template.operator.approachRoute.map(p=>[...p])};
  const carrier={...template.carrier,approachRoute:[template.carrier.position,[template.carrier.position[0],fromPosition[1]-1.2],[fromPosition[0],fromPosition[1]-1.2],fromPosition].filter((p,i,points)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>EPS)};
  const measurementInput={transfer:{...w,fromPosition,toPosition},carrier,operator};
  const r=measureInternalCycle(measurementInput);
  return {...w,fromSlot,toSlot,available:w.end-w.start,before:r.before,loaded:r.loaded,after:r.after,total:r.total,route:r.route,
   proposedFromPosition:fromPosition,proposedToPosition:toPosition,operatorId:operator.id,carrierId:carrier.id,
   deficit:Math.max(0,r.loaded-(w.end-w.start)),measurementInput,
   portPolicy:'D1 ports mapped to current bay indices; fixed D1 homes; inter-bay connector requires swept validation'};
 });
 const byId=new Map(requirements.map(r=>[r.id,r])),chains=[],conflicts=[];
 for(const lot of schedule.lots)for(const side of ['upstream','downstream']){
  const members=requirements.filter(r=>r.lotId===lot.id&&(side==='upstream'?['rosq','buffer'].includes(r.to):['m1','m2','insp'].includes(r.to)));
  if(!members.length)continue;
  const first=members[0],events=lot.timeline.filter(e=>side==='upstream'?['lap','rosq','buffer'].includes(e.to)||['lap','rosq'].includes(e.station):['m1','m2','insp'].includes(e.to)||['m1','m2','insp'].includes(e.station));
  let at=first.chainOrigin;
  for(const e of events){
   const r=byId.get(e.id);
   if(r){r.proposal={start:at,end:at+r.loaded,reserveStart:at-r.before,reserveEnd:at+r.loaded+r.after};at+=r.loaded;}
   else at+=e.kind==='transfer'?e.end-e.start:Math.min(.1,e.end-e.start);
  }
  // Optimistic bound: full-cycle resource occupancy is checked separately;
  // work is reduced to at most 100 ms per process for this diagnostic only.
  const required=at-first.chainOrigin,deficit=Math.max(0,at-first.chainDeadline);
  for(const r of members){r.proposal.fitsChain=deficit<=EPS;r.proposal.deadline=first.chainDeadline;if(r.proposal.reserveStart<25||r.proposal.reserveEnd>510)conflicts.push({type:'production-window',id:r.id,start:r.proposal.reserveStart,end:r.proposal.reserveEnd});}
  const proposals=members.map(r=>({id:r.id,...r.proposal}));
  chains.push({lotId:lot.id,side,origin:first.chainOrigin,deadline:first.chainDeadline,budget:first.chainBudget,required,deficit,candidate:deficit>EPS?null:proposals,earliestProposal:proposals,resourceAllocation:'pending'});
  if(deficit>EPS)conflicts.push({type:'chain-deadline',lotId:lot.id,side,deficit,deadline:first.chainDeadline,proposedEnd:at});
 }
 const overlaps=(a,b)=>a.start<b.end-EPS&&b.start<a.end-EPS;
 const reservation=r=>({start:r.proposal.reserveStart,end:r.proposal.reserveEnd});
 for(const r of requirements)for(const p of schedule.timeline.filter(e=>e.kind==='process'))if(`${p.station}:${p.machineIndex??0}`===r.operatorId&&overlaps(reservation(r),p))conflicts.push({type:'operator-process',id:r.id,operatorId:r.operatorId,processId:p.id,start:p.start,end:p.end});
 for(let i=0;i<requirements.length;i++)for(let j=i+1;j<requirements.length;j++){
  const a=requirements[i],b=requirements[j];
  if(overlaps(reservation(a),reservation(b))){
   if(a.operatorId===b.operatorId)conflicts.push({type:'operator-reservation',ids:[a.id,b.id],operatorId:a.operatorId});
   if(a.carrierId===b.carrierId)conflicts.push({type:'carrier-reservation',ids:[a.id,b.id],carrierId:a.carrierId});
  }
  if(a.lotId===b.lotId&&overlaps(a.proposal,b.proposal))conflicts.push({type:'same-load',ids:[a.id,b.id],lotId:a.lotId});
 }
 return {scope:'D1-assigned-bay-window-review',complete:false,requirements,chains,conflicts,
  externalReservations:[...schedule.timeline.filter(e=>e.transportMode==='forklift'),...(schedule.componentTransfers||[])].map(e=>({id:e.id,vehicleId:e.vehicleId,start:e.approachStart,loadedStart:e.start,loadedEnd:e.end,returnDeadline:e.returnEnd??e.end+(e.returnDelay??0)+(e.returnDuration??2),route:e.route})),
  note:'Earliest proposals expose deadline/resource conflicts; they are not an executable joint agenda. No industrial or presentation event was changed.'};
}

export function validateInternalWindowSpaces(review){
 const results=review.requirements.map(r=>{
  const {carrier,operator}=r.measurementInput,transfer={...r.measurementInput.transfer,start:r.proposal.start,end:r.proposal.end,internalRoute:r.route};
  const layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(transfer)]};
  try{compileInternalTransport({transfers:[transfer],carriers:[carrier],operators:[operator],layout});return {id:r.id,clear:true};}
  catch(error){return {id:r.id,clear:false,reason:error.message};}
 });
 return {scope:'individual-swept-space-review',complete:false,results,note:'Uses D1 collision checker; excludes other moving missions and C1 actors. Individual clearance is not a joint-agenda approval.'};
}

// Isolated Act 2 proposal. B1/C1 select the final cue; D owns the same
// route/phase sampler used for production. No real inventory enters this plan.
export function compileInternalDemonstration(schedule,{id='DBR-E9',start=100,end=130}={}){
 const input=productionInput(schedule,id),plan=createInternalDemonstration({start,end,input,layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(input.transfer)]}});
 const mission=plan.missions[0],trial={scope:'R2-Act-2-demonstration',complete:false,proposedWindow:true,plan};
 return {scope:'R2-Act-2-proposal',notIndustrialSchedule:true,duration:end-start,start,end,trial,segments:mission.segments,lotId:'DEMO-PALLET',notice:'Separate editorial example; final cue and existing operator rig require B1/C1 integration.'};
}
export function sampleDemonstrationTime(demo,seconds){
 const t=Math.max(0,Math.min(demo.duration,seconds)),sourceTime=demo.start+t,segment=demo.segments.find(s=>sourceTime<s.end)||demo.segments.at(-1);
 return {sourceTime,phase:segment.phase,complete:t===demo.duration};
}

// Approved R2 candidates keep the actual loaded windows. This does not call
// the superseded natural-speed chain diagnostic or move an industrial anchor.
function productionInput(schedule,id){
 const raw=schedule.timeline.find(e=>e.id===id);if(!raw||!isConveyorLink(raw.from,raw.to))throw new Error(`Unknown internal transfer: ${id}`);
 const pilot=INTERNAL_PILOTS.find(p=>p.link===`${raw.from}>${raw.to}`),input=internalPilotInput(raw,pilot);
 for(const side of ['from','to']){const stage=raw[side],slot=(schedule.handlingBays||DBR_BAYS)[stage].findIndex(p=>Math.hypot(p[0]-raw[`${side}Position`][0],p[1]-raw[`${side}Position`][1])<EPS);if(slot<0)throw new Error(`Unknown bay: ${id} ${stage}`);input.transfer[`${side}Position`]=[...INTERNAL_LAYOUT.bays[stage][slot]];}
 const prepared=prepareInternalAccess(input);
 if(raw.from==='lap'&&raw.fromPosition[0]<14){
  // Reach the western source bays from the shared southern internal aisle.
  // The eastern approach crosses the external stock-support delivery lane.
  const home=prepared.carrier.position,source=prepared.transfer.fromPosition,cross=prepared.transfer.internalRoute[2],south=prepared.transfer.internalRoute[3],route=[home,[home[0],south[1]],south,cross,[source[0],cross[1]],source].filter((p,i,ps)=>!i||Math.hypot(p[0]-ps[i-1][0],p[1]-ps[i-1][1])>EPS),directions=route.slice(1).map((p,i)=>{const a=route[i],length=Math.hypot(p[0]-a[0],p[1]-a[1]);return [(p[0]-a[0])/length,(p[1]-a[1])/length];});
  prepared.carrier.approachRoute=route;prepared.carrier.approachDirections=directions;prepared.carrier.approachesByTransfer[raw.id]={route,directions};
 }
 if(raw.from==='m1'){
  const position=dbrWorkStand('m1',0);prepared.operator={id:'m1:0',position,approachRoute:[position,...prepared.operator.approachRoute.slice(1)]};
 }else if(raw.from==='m2'){
  const position=dbrWorkStand('m2',2),cabinet=INTERNAL_LAYOUT.obstacles.find(o=>o.id==='cabinet-m2'),inspection=INTERNAL_LAYOUT.obstacles.find(o=>o.id==='insp:0'),aisle=(cabinet.max[0]+inspection.min[0])/2,tail=prepared.operator.approachRoute.slice(-2);
  prepared.operator={id:'m2:2',position,approachRoute:[position,[aisle,position[1]],[aisle,tail[0][1]],...tail]};
 }
 return prepared;
}
export function externalInternalReservations(schedule){
 return externalCycleSweeps(schedule).map(s=>({...s,min:[0,1].map(i=>Math.min(...s.polygon.map(p=>p[i]))),max:[0,1].map(i=>Math.max(...s.polygon.map(p=>p[i])))}));
}
function productionResources(input,operator){
 const homes=[...Object.entries(DBR_LAYOUT).flatMap(([stage,fixtures])=>fixtures.map((_,i)=>({id:`${stage}:${i}`,position:dbrWorkStand(stage,i)}))),INTERNAL_PILOTS.find(p=>p.operator.id==='buffer:0').operator],stands=homes.filter(o=>o.id!==operator.id).map(o=>({id:`stand:${o.id}`,min:o.position.map(v=>v-.3),max:o.position.map(v=>v+.3)}));
 return {carriers:[input.carrier,...INTERNAL_LAYOUT.parking.filter(c=>c.id!==input.carrier.id).map(c=>({...c,links:[]}))],layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(input.transfer),...stands]}};
}
function compileProductionInput(input,processes,externalSweeps=[]){
 let lastError;for(const operator of internalOperatorCandidates(input))try{return compileInternalTransport({transfers:[input.transfer],operators:[operator],...productionResources(input,operator),processes,presentation:{mode:'production',fitProductionStart:true},externalSweeps});}catch(error){lastError=error;}throw lastError;
}
export function compileInternalProductionTrial(schedule,{id='DBR-E9',includeExternal=true}={}){
 const candidate=schedule.scope==='R2-joint-candidate'?schedule:prepareInternalPresentation(schedule),input=productionInput(candidate,id),allocation=allocateInternalProduction(candidate,{ids:[id],includeExternal});if(allocation.unresolved.length)throw new Error(`No feasible complete cycle: ${id}: ${JSON.stringify(allocation.unresolved[0].reasons)}`);const plan=allocation.plan;
 return {scope:'R2-real-window-trial',complete:false,proposedWindow:false,externalChecked:includeExternal,input,plan,sweeps:internalSweepReservations(plan)};
}
export function coordinateInternalProduction(schedule){
 const source=schedule.scope==='R2-joint-candidate'?schedule:prepareInternalPresentation(schedule),externalSweeps=externalInternalReservations(source),candidates=[],conflicts=[],processes=source.timeline.filter(e=>e.kind==='process');
 for(const raw of source.timeline.filter(e=>isConveyorLink(e.from,e.to))){
  const input=productionInput(source,raw.id),c={id:raw.id,lotId:raw.lotId,link:`${raw.from}>${raw.to}`,start:raw.start,end:raw.end,startHours:raw.startHours,endHours:raw.endHours,fromPosition:input.transfer.fromPosition,toPosition:input.transfer.toPosition};candidates.push(c);
  try{
   const plan=compileInternalProductionTrial(source,{id:raw.id,includeExternal:false}).plan,m=plan.missions[0];Object.assign(c,{individualClear:true,reserveStart:m.start,reserveEnd:m.end,pickupStart:m.pickupStart,loadedEnd:m.transfer.end,compressionFactor:m.presentation.compressionFactor,phaseFactors:m.presentation.phaseFactors,effectiveSeconds:m.presentation.effectiveSeconds,operatorId:m.operator.id,carrierId:m.carrier.id});
   const internal=internalSweepReservations(plan),nearby=externalSweeps.filter(s=>s.start<c.reserveEnd&&s.end>c.reserveStart);let hit;
   for(const a of internal){const b=nearby.find(b=>a.start<b.end&&b.start<a.end&&a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1]);if(b){hit={type:'external-corridor',ids:[raw.id,b.id],start:Math.max(a.start,b.start),end:Math.min(a.end,b.end),body:a.body};break;}}
   if(hit)conflicts.push(hit);
  }catch(error){c.individualClear=false;c.reason=error.message;conflicts.push({type:'individual-access',ids:[raw.id],reason:error.message});}
 }
 for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
  const a=candidates[i],b=candidates[j];if(!a.individualClear||!b.individualClear)continue;const start=Math.max(a.reserveStart,b.reserveStart),end=Math.min(a.reserveEnd,b.reserveEnd);if(end<=start+EPS)continue;
  const resources=['operatorId','carrierId'].filter(k=>a[k]===b[k]);if(resources.length)conflicts.push({type:'shared-resource',ids:[a.id,b.id],resources,start,end});
 }
 return {scope:'R2-candidate-windows',complete:false,candidates,conflicts,externalSweeps,note:'Compiler-effective cycles, including opening preparation and explicit relief candidates. No conflicting joint agenda applied.'};
}

// Candidate R2 composition is isolated until joint traffic is valid. Reusing
// legacy conveyor planning with the revised bays would certify the wrong paths.
export function prepareInternalPresentation(schedule,{reserveExternal=true}={}){
 const timeline=schedule.timeline.map(e=>({...e})),byId=new Map(timeline.map(e=>[e.id,e]));
 for(const e of timeline.filter(e=>e.kind==='transfer')){
  if(schedule.internalTransportPlan||schedule.scope==='R2-joint-candidate')continue;
  for(const side of ['from','to']){const stage=e[side];if(!INTERNAL_LAYOUT.bays[stage])continue;const key=`${side}Position`,slot=DBR_BAYS[stage].findIndex(p=>p.every((x,i)=>x===e[key][i]));if(slot<0)throw new Error(`Unknown legacy bay: ${e.id} ${side}`);e[key]=[...INTERNAL_LAYOUT.bays[stage][slot]];}
  e.route=(e.transportMode==='conveyor'?conveyorRoute:dbrRoute)(e.from,e.to,e.fromPosition,e.toPosition,e.vehicleIndex);
 }
 const copy={...schedule,timeline,lots:schedule.lots.map(l=>({...l,timeline:l.timeline.map(e=>byId.get(e.id)||{...e})})),componentTransfers:schedule.componentTransfers.map(e=>({...e})),handlingBays:{...DBR_BAYS,...INTERNAL_LAYOUT.bays},scope:'R2-joint-candidate',complete:false};
 if(schedule.internalTransportPlan||schedule.scope==='R2-joint-candidate')return copy;
 compileExternalCycles(copy,{connectStockCycles:schedule.connectStockCycles});if(reserveExternal&&schedule.logisticsCorridorPlan)reserveExternalCorridors(copy,{passes:1});return copy;
}

// A bay cannot receive its next pallet before the previous pallet leaves.
// Industrial order breaks ties when visual windows overlap after compression.
export function orderInternalTransfers(transfers){
 const pending=[...transfers].sort((a,b)=>a.end-b.end||a.start-b.start),result=[],done=new Set(),dependencies=new Map();
 for(const incoming of pending)dependencies.set(incoming.id,pending.filter(out=>out.id!==incoming.id&&out.lotId!==incoming.lotId&&out.from===incoming.to&&out.fromPosition.every((v,i)=>Math.abs(v-incoming.toPosition[i])<1e-7)&&out.start<incoming.end&&out.end>incoming.start&&out.startHours<incoming.endHours).map(e=>e.id));
 const deadlines=new Map(pending.map(e=>[e.id,e.end]));let changed=true;
 while(changed){changed=false;for(const [id,deps]of dependencies)for(const dep of deps)if(deadlines.get(dep)>deadlines.get(id)){deadlines.set(dep,deadlines.get(id));changed=true;}}
 pending.sort((a,b)=>(b.to==='buffer')-(a.to==='buffer')||(a.to==='buffer'&&b.to==='buffer'?a.end-b.end:deadlines.get(a.id)-deadlines.get(b.id))||a.end-b.end||a.start-b.start);
 while(pending.length){const index=pending.findIndex(e=>dependencies.get(e.id).every(id=>done.has(id)));if(index<0)throw new Error('Cyclic bay dependencies');const [e]=pending.splice(index,1);result.push(e);done.add(e.id);}
 return result;
}

// Keep loaded travel inside its existing presentation window. Empty preparation
// and return reserve additional time in the same operator/carrier calendars.
// Capacity sharing defines a preferred budget and one floor budget; no unbounded speed retries.
export function allocateInternalProduction(schedule,{ids,includeExternal=true,externalPhases=null,clearanceSeconds=0}={}){
 const source=schedule.scope==='R2-joint-candidate'?schedule:prepareInternalPresentation(schedule),processes=source.timeline.filter(e=>e.kind==='process'),eventsById=new Map([...source.timeline,...source.componentTransfers].map(e=>[e.id,e])),external=includeExternal?externalInternalReservations(source).flatMap(s=>{if(!externalPhases||externalPhases.includes(s.phase))return [s];const e=eventsById.get(s.id);if(clearanceSeconds&&e&&s.phase==='return'&&s.start<e.end+clearanceSeconds)return [{...s,end:Math.min(s.end,e.end+clearanceSeconds)}];if(clearanceSeconds&&e&&s.phase==='approach'&&s.end>e.start-clearanceSeconds)return [{...s,start:Math.max(s.start,e.start-clearanceSeconds)}];return [];}):[],allJobs=orderInternalTransfers(source.timeline.filter(e=>isConveyorLink(e.from,e.to))).map(raw=>({raw,input:productionInput(source,raw.id)})),jobs=allJobs.filter(j=>!ids||ids.includes(j.raw.id)),assignments=[],unresolved=[],reserved=[],plans=[];
 const timeIndex=createTemporalIndex(external);
 const overlaps=(a,b)=>a.start<b.end-EPS&&b.start<a.end-EPS;
 const spatial=(a,b)=>a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1];
 function spatialIndex(items){const cells=new Map(),keys=b=>{const out=[];for(let x=Math.floor(b.min[0]/2);x<=Math.floor(b.max[0]/2);x++)for(let y=Math.floor(b.min[1]/2);y<=Math.floor(b.max[1]/2);y++)out.push(`${x}:${y}`);return out;};for(const b of items)for(const k of keys(b)){if(!cells.has(k))cells.set(k,[]);cells.get(k).push(b);}return a=>{const found=new Set();for(const k of keys(a))for(const b of cells.get(k)||[])found.add(b);return found;};}
 function gaps(start,end,busy){const result=[];let at=start;for(const b of busy.filter(b=>b.end>start&&b.start<end).sort((a,b)=>a.start-b.start)){if(b.start>at+EPS)result.push({start:at,end:Math.min(end,b.start)});at=Math.max(at,b.end);}if(at<end-EPS)result.push({start:at,end});return result;}
 for(let index=0;index<jobs.length;index++){
  const {raw,input}=jobs[index],reasons=[];let chosen;
  for(const operator of internalOperatorCandidates(input)){
   const busy=[...processes.filter(p=>`${p.station}:${p.machineIndex??0}`===operator.id),...assignments.filter(a=>a.operatorId===operator.id||a.carrierId===input.carrier.id||a.lotId===raw.lotId)],base=measureInternalCycle({...input,operator}),resources=productionResources(input,operator);
   const competing=allJobs.filter(j=>j.raw.id!==raw.id&&overlaps(j.raw,raw)&&(j.input.carrier.id===input.carrier.id||(['m1','m2'].includes(raw.from)&&['m1','m2'].includes(j.raw.from))||internalOperatorCandidates(j.input).some(o=>o.id===operator.id))).length;
   const minimum=.1*base.total/base.loaded,preferred=Math.max((raw.end-raw.start)/(competing+1),minimum);
   // One bounded fallback retains the approved loaded floor for a newly
   // constrained corridor; no progressively faster retries.
   for(const duration of [...new Set(raw.to==='buffer'?[preferred]:[preferred,minimum])]){
   const scale=duration/base.total;
   const earliest=Math.max(135,raw.start-base.before*scale),latest=Math.min(510,raw.end+base.after*scale+(raw.to==='buffer'?3:0));
   for(const gap of gaps(earliest,latest,busy)){
    if(duration>gap.end-gap.start+EPS){reasons.push({type:'phase-budget',operatorId:operator.id,gap,minimumLoadedSeconds:.1});continue;}
    if(raw.to==='buffer'){
     const anchors=allJobs.filter(j=>j.raw.to==='buffer').map(j=>j.raw.end).sort((a,b)=>a-b),anchorIndex=anchors.indexOf(raw.end),previous=anchors[anchorIndex-1]??135,next=anchors[anchorIndex+1]??510;
     // Pinning placement removes the former ability to borrow a neighbour's
     // arrival window. Budget empty phases separately; loaded floor stays .1 s.
     const emptyScale=Math.min(scale,.1/base.loaded,Math.max(.001,(raw.end-previous)*.45-.1)/base.before,Math.max(.001,(next-raw.end)*.45)/base.after);
     const loadedSeconds=.1,shortStart=raw.end-loadedSeconds-base.before*emptyScale;
     const candidates=[{start:Math.max(gap.start,shortStart),lead:0},{start:Math.max(gap.start,shortStart),lead:Math.max(0,shortStart-gap.start)},{start:gap.start,lead:0}];
     for(const candidate of candidates){
      const pickup=candidate.start+base.before*emptyScale;
      if(raw.end-pickup<loadedSeconds-EPS)continue;
      let delay=0;
      for(let attempt=0;attempt<4;attempt++)try{
       const plan=compileInternalTransport({transfers:[{...input.transfer,start:pickup,end:raw.end,originalWindow:{start:raw.start,end:raw.end}}],operators:[operator],...resources,processes,presentation:{mode:'production',fitProductionStart:true,emptyCompressionFactor:1/emptyScale,operatorReturnDelay:delay,operatorApproachLead:candidate.lead}});
       const m=plan.missions[0],sweeps=internalSweepReservations(plan),hits=sweeps.flatMap(a=>timeIndex.between(a.start,a.end).filter(b=>overlaps(a,b)&&spatial(a,b)).map(b=>({a,b})));
       if(!hits.length&&m.end<=gap.end+EPS){chosen={plan,sweeps,assignment:{id:raw.id,lotId:raw.lotId,operatorId:m.operator.id,carrierId:m.carrier.id,start:m.start,pickupStart:m.pickupStart,loadedEnd:m.transfer.end,end:m.end,originalStart:raw.start,originalEnd:raw.end,startHours:raw.startHours,endHours:raw.endHours,presentation:m.presentation}};break;}
       const walk=m.segments.find(s=>s.phase==='return'&&s.walk);
       if(!walk||!hits.length||hits.some(h=>h.a.start<walk.start-EPS)){reasons.push({type:'anchored-corridor',hits:hits.slice(0,3).map(h=>({otherId:h.b.id,start:h.a.start,end:h.a.end,body:h.a.body}))});break;}
       delay+=Math.max(...hits.map(h=>h.b.end))-walk.start+1e-5;
      }catch(error){reasons.push({type:'anchored-compiler',reason:error.message});break;}
      if(chosen)break;
     }
     if(chosen)break;continue;
    }
    const nearby=timeIndex.between(gap.start,gap.end);
    const makePlan=at=>compileInternalTransport({transfers:[{...input.transfer,start:at+base.before*scale,end:at+(base.before+base.loaded)*scale,originalWindow:{start:raw.start,end:raw.end}}],operators:[operator],...resources,processes,presentation:{mode:'production',fitProductionStart:true}});
    let template;try{template=makePlan(gap.start);}catch(error){reasons.push({type:'compiler',operatorId:operator.id,reason:error.message});continue;}
    // For each spatially intersecting pair, project its occupancy interval
    // onto forbidden cycle START times. Merge once instead of retrying speeds.
    const forbidden=[],query=spatialIndex(nearby);for(const a of internalSweepReservations(template))for(const b of query(a))if(spatial(a,b)){
     const start=b.start-(a.end-gap.start),end=b.end-(a.start-gap.start);
     if(end>gap.start&&start<gap.end-duration)forbidden.push({start,end,otherId:b.id,body:a.body});
    }
    const merged=[];for(const b of forbidden.sort((a,b)=>a.start-b.start)){const last=merged.at(-1);if(last&&b.start<=last.end+EPS){last.end=Math.max(last.end,b.end);last.ids.add(b.otherId);last.bodies.add(b.body);last.pairs++;}else merged.push({start:b.start,end:b.end,ids:new Set([b.otherId]),bodies:new Set([b.body]),pairs:1});}
    let at=gap.start;for(const b of merged)if(b.start<at+EPS&&b.end>at-EPS){reasons.push({type:'corridor',otherIds:[...b.ids],operatorId:operator.id,carrierId:input.carrier.id,start:b.start,end:b.end,bodies:[...b.bodies],pairs:b.pairs,timeDomain:'forbidden-cycle-start'});at=b.end+1e-5;}
    if(at+duration<=gap.end+EPS){
     const plan=at===gap.start?template:makePlan(at),m=plan.missions[0],sweeps=internalSweepReservations(plan);
     chosen={plan,sweeps,assignment:{id:raw.id,lotId:raw.lotId,operatorId:m.operator.id,carrierId:m.carrier.id,start:m.start,pickupStart:m.pickupStart,loadedEnd:m.transfer.end,end:m.end,originalStart:raw.start,originalEnd:raw.end,startHours:raw.startHours,endHours:raw.endHours,presentation:m.presentation}};
    }
    if(chosen)break;
   }
   if(chosen)break;
   }
   if(chosen)break;
  }
  if(chosen){assignments.push(chosen.assignment);reserved.push(...chosen.sweeps);timeIndex.add(chosen.sweeps);plans.push(chosen.plan);}else unresolved.push({id:raw.id,lotId:raw.lotId,window:{start:raw.start,end:raw.end},reasons});
 }
 const plan={missions:plans.flatMap(p=>p.missions),transfers:plans.flatMap(p=>p.transfers),operatorReservations:plans.flatMap(p=>p.operatorReservations),carriers:INTERNAL_LAYOUT.parking.map(c=>({...c}))};
 return {scope:'R2-joint-allocation-candidate',complete:false,externalChecked:includeExternal&&!externalPhases,externalPhases,assignments,unresolved,plan,sweeps:reserved,policy:{loadedWithinOriginalWindow:true,fullCycleWithinOriginalWindow:false,minimumLoadedSeconds:.1,waitsDoNotShortenTravel:true},note:'Partial candidates only; missing moves and fleet conflicts prevent operational promotion.'};
}

// One resource object per real ID. Per-transfer bay approaches remain D's
// contract; combining independent mission objects is not joint certification.
export function compileJointInternalAllocation(schedule,allocation){
 if(allocation.unresolved.length)throw new Error(`Incomplete internal allocation: ${allocation.unresolved.length}`);
 const carriers=new Map(),operators=new Map();
 for(const m of allocation.plan.missions){
  const c=carriers.get(m.carrier.id)||{...m.carrier,approachesByTransfer:{}},o=operators.get(m.operator.id)||{...m.operator,links:[],approachRoutes:{}};
  Object.assign(c.approachesByTransfer,m.carrier.approachesByTransfer);c.links=[`${m.transfer.from}>${m.transfer.to}`];
  const link=`${m.transfer.from}>${m.transfer.to}`;if(!o.links.includes(link))o.links.push(link);o.approachRoutes[c.id]=m.operator.approachRoute;
  carriers.set(c.id,c);operators.set(o.id,o);
 }
 const ordered=[...operators.values()].sort((a,b)=>(a.id==='buffer:0')-(b.id==='buffer:0'));
 return compileInternalTransport({transfers:allocation.plan.missions.map(m=>m.transfer),carriers:[...carriers.values()],operators:ordered,processes:schedule.timeline.filter(e=>e.kind==='process'),layout:INTERNAL_LAYOUT,presentation:{mode:'production',fitProductionStart:true,byTransfer:Object.fromEntries(allocation.plan.missions.map(m=>[m.transfer.id,{emptyCompressionFactor:m.presentation.emptyCompressionFactor,operatorApproachLead:m.presentation.operatorApproachLead,operatorReturnDelay:m.presentation.operatorReturnDelay}]))}});
}


// Same piecewise-linear station walks as the handling adapter. Return is
// completed before the outgoing appointment; only presentation phases move.
export function upstreamOperatorReservations(schedule){
 const out=[];
 for(const p of schedule.timeline.filter(e=>e.kind==='replenishment-process')){
  const inbound=schedule.timeline.find(e=>e.lotId===p.lotId&&e.to===p.station);if(!inbound)continue;
  const route=dbrStationAccessRoute(p.station,p.machineIndex||0,inbound.toPosition),operatorId=`${p.station}:${p.machineIndex||0}`;
  for(const [phaseStart,phaseEnd,path]of [[p.start,p.start+.3,route],[p.start+.3,p.start+.6,[...route].reverse()],[p.end-.6,p.end-.3,route],[p.end-.3,p.end,[...route].reverse()]]){
   const total=routeLength(path);let travelled=0;for(let j=1;j<path.length;j++){const a=path[j-1],b=path[j],distance=Math.hypot(b[0]-a[0],b[1]-a[1]),start=phaseStart+(phaseEnd-phaseStart)*travelled/total,end=phaseStart+(phaseEnd-phaseStart)*(travelled+distance)/total;travelled+=distance;
   const count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.08));
   for(let i=0;i<count;i++){const q=a.map((v,k)=>v+(b[k]-v)*i/count),r=a.map((v,k)=>v+(b[k]-v)*(i+1)/count),min=q.map((v,k)=>Math.min(v,r[k])-.3),max=q.map((v,k)=>Math.max(v,r[k])+.3);out.push({id:`station:${p.id}`,vehicleIndex:`operator:${operatorId}`,operatorId,body:'operator',start:start+(end-start)*i/count,end:start+(end-start)*(i+1)/count,min,max,polygon:boxCorners([0,0],0,{min,max})});}
   }
  }
 }
 return out;
}

export function internalTrafficReservations(plan){
 return plan.missions.flatMap(m=>coalesceReservations(internalSweepReservations({missions:[m]})));
}

export function internalBayOccupancy(schedule,plan){
 const byId=new Map(plan.missions.map(m=>[m.transfer.id,m])),transfers=schedule.timeline.filter(e=>e.kind==='transfer').map(e=>{const m=byId.get(e.id);return {...e,start:m?.pickupStart??e.start,end:m?.transfer.end??e.end};}),occupancy=[];
 for(const lot of [...schedule.lots,...(schedule.bodySupply?.jobs||[])]){
  const sequence=transfers.filter(e=>e.lotId===lot.id).sort((a,b)=>a.start-b.start);
  if(lot.initial)occupancy.push({id:lot.id,stage:'buffer',position:INTERNAL_LAYOUT.bays.buffer[lot.bufferSlot],start:0,end:sequence[0]?.start??600});
  for(let i=0;i<sequence.length;i++){const e=sequence[i];if(DBR_BAYS[e.to]&&e.to!=='stock')occupancy.push({id:lot.id,stage:e.to,position:e.toPosition,start:e.end,end:e.to==='truck'?(schedule.trips.find(t=>t.lotIds.includes(lot.id))?.departAt??600):(sequence[i+1]?.start??600)});}
 }
 return occupancy;
}

// Coarse unions only reject pairs from the broad phase. Every positive pair is
// checked again against D's ORIGINAL continuous envelopes, never frame samples.
export function auditJointCirculation(schedule,plan,{reservations=internalTrafficReservations(plan)}={}){
 const expected=schedule.timeline.filter(e=>isConveyorLink(e.from,e.to)),byMission=new Map(plan.missions.map(m=>[m.transfer.id,m])),missing=expected.filter(e=>!byMission.has(e.id)).map(e=>e.id),duplicates=plan.missions.filter((m,i,ms)=>ms.findIndex(x=>x.transfer.id===m.transfer.id)!==i).map(m=>m.transfer.id);
 const external=externalCycleSweeps(schedule),upstream=upstreamOperatorReservations(schedule),byExternal=new Map();for(const sweep of [...external,...upstream]){if(!byExternal.has(sweep.id))byExternal.set(sweep.id,[]);byExternal.get(sweep.id).push(sweep);}
 const parks=INTERNAL_LAYOUT.parking.map(c=>({id:c.id,start:0,end:600,polygon:boxCorners(c.position,Math.atan2(-c.direction[0],-c.direction[1]),{min:[-.35,-.575],max:[.35,1.075]})})),coarse=externalTrafficConflicts([...external,...reservations,...upstream,...parks]),conflicts=[];let originalPairs=0;
 for(const candidate of coarse){
  const mission=candidate.ids.map(id=>byMission.get(id)).find(Boolean);
  if(!mission){conflicts.push(candidate);continue;}
  const other=candidate.ids.find(id=>id!==mission.transfer.id),index=createTemporalIndex(byExternal.get(other)||[]);let hit;
  for(const a of internalSweepReservations({missions:[mission]})){
   const polygon=boxCorners([0,0],0,a);
   for(const b of index.between(a.start,a.end)){if(a.start>=b.end-1e-8||b.start>=a.end-1e-8)continue;originalPairs++;if(boxesOverlap(polygon,b.polygon)){hit={ids:candidate.ids,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end),body:a.body,externalPhase:b.phase};break;}}
   if(hit)break;
  }
  if(hit)conflicts.push(hit);
 }
 const occupancy=internalBayOccupancy(schedule,plan),bayConflicts=[];
 for(let i=0;i<occupancy.length;i++)for(const b of occupancy.slice(i+1)){const a=occupancy[i];if(a.id!==b.id&&a.position.every((v,k)=>v===b.position[k])&&a.start<b.end-EPS&&b.start<a.end-EPS)bayConflicts.push({ids:[a.id,b.id],position:a.position,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)});}
 const stands=Object.entries(DBR_LAYOUT).flatMap(([stage,fixtures])=>fixtures.map((_,i)=>{const p=dbrWorkStand(stage,i);return {id:`stand:${stage}:${i}`,min:p.map(v=>v-.3),max:p.map(v=>v+.3)};})),obstacles=[...INTERNAL_LAYOUT.obstacles,...logisticsSiteObstacles(),...stands].map(o=>({...o,polygon:boxCorners([0,0],0,o)})),staticHits=new Map();
 for(const a of [...external,...upstream])for(const b of obstacles.filter(b=>b.id!==`stand:${a.operatorId}`))if(boxesOverlap(a.polygon,b.polygon))staticHits.set(`${a.id}/${b.id}`,{id:a.id,phase:a.phase,obstacle:b.id,start:a.start,end:a.end});
 const staticConflicts=[...staticHits.values()],palletHits=new Map(),palletIndex=createTemporalIndex(occupancy.map(o=>({...o,polygon:boxCorners(o.position,0,{min:[-.55,-.55],max:[.55,.55]})})));
 // Forks enter pallet pockets during pickup. The chassis never enters a load,
 // including its own source/destination and every occupied dispatch position.
 for(const a of externalCycleSweeps(schedule,{bounds:{min:[-.6,.6],max:[.6,1.8]}}))for(const b of palletIndex.between(a.start,a.end))if(boxesOverlap(a.polygon,b.polygon))palletHits.set(`${a.id}/${b.id}`,{id:a.id,lotId:b.id,phase:a.phase,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)});
 const palletConflicts=[...palletHits.values()],unexpected=plan.missions.filter(m=>!expected.some(e=>e.id===m.transfer.id)).map(m=>m.transfer.id);
 return {complete:!missing.length&&!duplicates.length&&!conflicts.length&&!bayConflicts.length&&!staticConflicts.length&&!palletConflicts.length&&!unexpected.length,missing,duplicates,unexpected,conflicts,bayConflicts,staticConflicts,palletConflicts,externalSweeps:external.length,internalEnvelopes:reservations.length,coarseCandidates:coarse.length,originalPairs,parkedCarriers:parks.length,upstreamOperatorEnvelopes:upstream.length,interval:[0,600]};
}

// A single executable contract. Original display windows and all industrial
// fields stay intact; pickup/loadedEnd/cycleStart/cycleEnd are D's effective times.
export function compileOperationalHandling(schedule,{onCandidate}={}){
 const allocation=allocateInternalProduction(schedule,{externalPhases:['loaded','handling'],clearanceSeconds:.4});
 if(allocation.unresolved.length){const error=new Error(`Unallocated internal moves: ${allocation.unresolved.map(x=>x.id).join(',')}`);error.cases=allocation.unresolved;throw error;}
 const plan=compileJointInternalAllocation(schedule,allocation);allocation.sweeps.length=0;
 onCandidate?.({schedule,plan,policy:allocation.policy});
 return finishOperationalHandling(schedule,plan,allocation.policy);
}
export function auditFixedExternalCirculation(schedule){
 const sweeps=externalCycleSweeps(schedule),conflicts=externalTrafficConflicts(sweeps);
 const events=[...schedule.timeline.filter(e=>e.transportMode==='forklift'),...schedule.componentTransfers];
 const missing=events.filter(e=>!sweeps.some(s=>s.id===e.id));
 const invalid=events.filter(e=>!Number.isFinite(e.approachStart)||!Number.isFinite(e.returnEnd)||e.approachStart>e.start||e.start>=e.end||e.returnEnd<e.end);
 return {complete:!conflicts.length&&!missing.length&&!invalid.length,conflicts,missing:missing.map(e=>e.id),invalid:invalid.map(e=>e.id),sweeps:sweeps.length,interval:[0,600]};
}
export function finishOperationalHandling(schedule,plan,policy,{externalMode='compile'}={}){
 const reservations=internalTrafficReservations(plan),failures=[],external=externalMode==='validate-fixed'?auditFixedExternalCirculation(schedule):planExternalCirculation(schedule,{backgroundSweeps:[...reservations,...upstreamOperatorReservations(schedule)],onFailure:(task,others)=>failures.push({kind:task.kind,previous:task.previous?.id,next:task.next?.id,start:task.start,end:task.end,blockers:others.map(b=>({id:b.id,start:b.start,end:b.end,body:b.body}))})});
 if(!external.complete){const error=new Error(`Unresolved external connectors: ${JSON.stringify(external.unresolved)}`);error.cases=failures;throw error;}
 const audit=auditJointCirculation(schedule,plan,{reservations});if(!audit.complete)throw new Error(`Joint circulation failed: ${JSON.stringify(audit)}`);
 const events=new Map(schedule.timeline.map(e=>[e.id,e]));
 for(const out of plan.transfers){const event=events.get(out.id),{start,end,startHours,endHours}=event;Object.assign(event,out,{start,end,startHours,endHours,loadedEnd:out.end,cycleStart:out.approachStart,cycleEnd:out.returnEnd,originalWindow:{start,end}});}
 const assignments=plan.missions.map(m=>({id:m.transfer.id,lotId:m.transfer.lotId,operatorId:m.operator.id,carrierId:m.carrier.id,start:m.start,pickupStart:m.pickupStart,loadedEnd:m.transfer.end,end:m.end,originalWindow:m.transfer.originalWindow,startHours:m.transfer.startHours,endHours:m.transfer.endHours,presentation:m.presentation}));
 schedule.componentPlan.complete=true;schedule.componentPlan.scope='R3-operational';
 schedule.internalTransportPlan=plan;schedule.internalAllocation={complete:true,assignments,unresolved:[],policy,audit};schedule.scope='R3-operational';schedule.complete=true;return schedule;
}

// Repair at most three local timing contacts; every candidate is fully audited.
// Fixed external routes get a NEW external/external audit, never an old flag.
export function reconcileFixedRoutes(schedule,initialPlan,policy){
 let plan=initialPlan,audit=auditJointCirculation(schedule,plan);const attempts=[];
 for(let attempt=0;!audit.complete&&attempt<3;attempt++){
  if(audit.bayConflicts.length||audit.staticConflicts.length||audit.palletConflicts.length)break;
  const contact=audit.conflicts[0],mission=plan.missions.find(m=>contact.ids.includes(m.transfer.id)&&m.transfer.to!=='buffer');
  if(!mission)break;
  let improved=false;
  for(const choice of [{ratio:1.01},{ratio:1.05},{ratio:1.25},{ratio:1.5},{ratio:2},{delta:.01},{delta:-.01}])try{
   const candidate=choice.ratio?compressEmptyMission(plan,mission.transfer.id,choice.ratio):retimeInternalMission(plan,mission.transfer.id,choice.delta,{processes:schedule.timeline.filter(e=>e.kind==='process')});
   const next=auditJointCirculation(schedule,candidate);
   if(!next.bayConflicts.length&&!next.staticConflicts.length&&!next.palletConflicts.length&&next.conflicts.length<audit.conflicts.length){plan=candidate;audit=next;improved=true;break;}
  }catch(error){attempts.push({id:mission.transfer.id,choice,error:error.message});}
  if(!improved)break;
 }
 if(!audit.complete){const error=new Error(`Fixed-route reconciliation failed: ${JSON.stringify(audit.conflicts)}`);error.cases={audit,attempts};throw error;}
 return finishOperationalHandling(schedule,plan,policy,{externalMode:'validate-fixed'});
}
