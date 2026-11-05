import {sampleRoute,routeLength,DBR_BAYS} from './dbr-layout.js';
import {hasConveyorPort} from './dbr-conveyors.js';
const EPS=1e-7;
export function conveyorProgress(e,t){return Math.max(0,Math.min(1,(t-(e.travelStart??e.start))/((e.travelEnd??e.end)-(e.travelStart??e.start))));}

// Stop gates reserve shared transfer tables. Waiting consumes screen time only.
export function planConveyorTraffic(schedule,pass=0){
 const transfers=schedule.timeline.filter(e=>e.kind==='transfer'),sequences=new Map(schedule.lots.map(l=>[l.id,transfers.filter(e=>e.lotId===l.id).sort((a,b)=>a.start-b.start)]));
 const lots=new Map(schedule.lots.map(l=>[l.id,l]));
 const booked=new Set();
 function position(id,t,candidate){
  const seq=sequences.get(id),active=seq.find(e=>e.start<=t+EPS&&e.end>t+EPS);
  if(active){if(active.transportMode!=='conveyor'||active!==candidate&&!booked.has(active))return null;return sampleRoute(active.route,conveyorProgress(active,t)).position;}
  const last=seq.filter(e=>e.end<=t+EPS).at(-1);
  if(last)return hasConveyorPort(last.to)?last.toPosition:null;
  const lot=lots.get(id);
  return lot.initial?(seq[0]?.fromPosition??DBR_BAYS.buffer[lot.bufferSlot]):null;
 }
 function corners(event){
  const points=[event.start,event.end],duration=(event.travelEnd??event.end)-(event.travelStart??event.start);
  if(event.transportMode!=='conveyor')return points;
  const length=routeLength(event.route);let distance=0;
  for(let i=0;i<event.route.length;i++){
   if(i)distance+=Math.hypot(event.route[i][0]-event.route[i-1][0],event.route[i][1]-event.route[i-1][1]);
   points.push((event.travelStart??event.start)+duration*distance/length);
  }
  return points;
 }
 function clear(event){
  // Motion is linear between route corners and gate times. Intersect the
  // swept boxes on every such interval, including sub-frame crossings.
  for(const [id,seq]of sequences){
   if(id===event.lotId)continue;
   const times=[...new Set([...corners(event),...seq.filter(e=>e.end>=event.start&&e.start<=event.end).flatMap(corners)].filter(t=>t>=event.start&&t<=event.end))].sort((a,b)=>a-b);
   for(let i=1;i<times.length;i++){
    const a=times[i-1]+EPS*2,b=times[i]-EPS*2;if(b<=a)continue;
    const p=position(event.lotId,a,event),q=position(id,a,event),r=position(event.lotId,b,event),s=position(id,b,event);
    if(!p||!q||!r||!s)continue;
    let enter=0,leave=1;
    for(let axis=0;axis<2;axis++){
     const start=p[axis]-q[axis],delta=r[axis]-s[axis]-start;
     if(Math.abs(delta)<EPS){if(Math.abs(start)>=1.12){leave=-1;break;}}
     else {const u=(-1.12-start)/delta,v=(1.12-start)/delta;enter=Math.max(enter,Math.min(u,v));leave=Math.min(leave,Math.max(u,v));}
    }
    if(enter<leave){event.conflict={t:a+(b-a)*(enter+leave)/2,other:id};return false;}
   }
  }
  return true;
 }
 // Earlier arrival anchors reserve first; a later deadline may wait upstream.
 const events=transfers.filter(e=>e.transportMode==='conveyor').sort((a,b)=>Number(b.from==='buffer')-Number(a.from==='buffer')||a.end-b.end||a.start-b.start);
 const unresolved=[];
 for(const e of events){
  e.travelStart=e.start;e.travelEnd=e.start+(e.end-e.start)*(e.clearanceRatio??1);
  let found=clear(e);
  for(let ratio=.95;!found&&ratio>=.099;ratio-=.05){
   const duration=(e.end-e.start)*ratio,slack=e.end-e.start-duration;if(duration<.45)break;
   for(let fraction=0;!found&&fraction<=1.001;fraction+=.1){
    if(e.to==='buffer'&&fraction<.999)continue;
    e.travelStart=e.start+slack*fraction;e.travelEnd=e.travelStart+duration;
    found=clear(e);
   }
  }
  if(!found){unresolved.push({id:e.id,lot:e.lotId,from:e.from,to:e.to,start:e.start,end:e.end,...e.conflict});e.travelStart=e.start;e.travelEnd=e.end;}
  booked.add(e);
 }
 if(unresolved.length&&pass<4){
  for(const conflict of unresolved){
   const blocking=events.find(e=>e.lotId===conflict.other&&e.from==='buffer'&&e.start<=conflict.t&&e.end>=conflict.t);
   if(blocking)blocking.clearanceRatio=Math.max(.5,(blocking.clearanceRatio??1)-.15);
  }
  return planConveyorTraffic(schedule,pass+1);
 }
 schedule.conveyorConflicts=unresolved;
 if(unresolved.length)throw new Error(`Conveyor collision: ${JSON.stringify(unresolved)}`);
 for(const event of events)delete event.conflict;
 return schedule;
}
