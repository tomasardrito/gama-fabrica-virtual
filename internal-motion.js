import {INTERNAL_LAYOUT,INTERNAL_LINKS,INTERNAL_GEOMETRY as G,internalRoute,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles,internalApproachRoute,INTERNAL_ACCESS,internalAccessRoute} from './internal-layout.js';
const EPS=1e-8,clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,u)=>a.map((x,i)=>x+(b[i]-x)*u);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const direction=(a,b)=>{const n=distance(a,b);return n>EPS?[(b[0]-a[0])/n,(b[1]-a[1])/n]:[0,1];};
const behind=(p,d)=>[p[0]-d[0]*G.operatorOffset,p[1]-d[1]*G.operatorOffset];
const angle=d=>Math.atan2(d[0],d[1]);
const rotate=(a,b,u)=>{const x=angle(a),delta=Math.atan2(Math.sin(angle(b)-x),Math.cos(angle(b)-x));return [Math.sin(x+delta*u),Math.cos(x+delta*u)];};
const overlap=(a,b)=>a.start<b.end-EPS&&b.start<a.end-EPS;
const length=r=>r.slice(1).reduce((n,p,i)=>n+distance(r[i],p),0);
// Every corner includes a timed turn. The operator follows the handle continuously.
function pathFrames(route,initial,speed=1,turnRate=2,directions=[]){
 const r=route.filter((p,i)=>!i||distance(p,route[i-1])>EPS),frames=[{position:r[0],direction:initial,weight:0}];let d=initial;
 for(let i=1;i<r.length;i++){
  const next=directions[i-1]||direction(r[i-1],r[i]),delta=Math.abs(Math.atan2(Math.sin(angle(next)-angle(d)),Math.cos(angle(next)-angle(d))));
  const turns=Math.ceil(delta/.08);
  for(let j=1;j<=turns;j++)frames.push({position:r[i-1],direction:rotate(d,next,j/turns),weight:delta/turnRate/turns});
  const n=Math.ceil(distance(r[i-1],r[i])/.08);
  for(let j=1;j<=n;j++)frames.push({position:mix(r[i-1],r[i],j/n),direction:next,weight:distance(r[i-1],r[i])/speed/n});d=next;
 }
 let total=0;for(const f of frames){total+=f.weight;f.at=total;}for(const f of frames)f.at=total?f.at/total:0;frames.duration=total;return frames;
}
function atPath(frames,u){if(frames.length===1||u<=EPS)return frames[0];if(u>=1-EPS)return frames.at(-1);const i=frames.findIndex(f=>f.at>=u),a=frames[Math.max(0,i-1)],b=frames[i],v=(u-a.at)/(b.at-a.at||1);return {position:mix(a.position,b.position,v),direction:rotate(a.direction,b.direction,v)};}
function segment(phase,start,end,frames,extra={}){return {phase,start,end,frames,...extra};}
function poseMission(m,t){const s=m.segments.find(s=>t>=s.start-EPS&&t<s.end-EPS)||m.segments.at(-1),u=clamp((t-s.start)/(s.end-s.start)),p=atPath(s.frames,u);let lift=s.phase==='push'?G.lift:s.phase==='pick'?G.lift*u:s.phase==='place'?G.lift*(1-u):0;
 const position=s.walk?m.carrier.position:p.position,d=s.walk?m.carrier.direction:p.direction;
 const op=s.walk?p.position:behind(position,d);
 return {carrier:{id:m.carrier.id,position:[...position],direction:[...d],yaw:angle(d),deckHeight:G.floorHeight+lift,visible:true,phase:s.phase,event:m.transfer},operator:{id:m.operator.id,stationId:m.operator.id.split(':')[0],machineIndex:Number(m.operator.id.split(':')[1]),position:[...op],direction:s.walk?p.direction:d,walking:['approach','push','return'].includes(s.phase),gait:(s.baseStart+(t-s.start)*s.timeScale)*7*(s.reverse?-1:1),bend:s.phase==='pick'?.12:0,handsLocal:s.walk?null:[[-.18,1.05,-.5],[.18,1.05,-.5]],distance:(t-m.start)*m.speed,phase:s.phase,carrierId:m.carrier.id},segment:s};
}
function boxes(m,t){
 const {carrier:c,operator:o}=poseMission(m,t),offset=n=>c.position.map((v,i)=>v-c.direction[i]*n);
 const loaded=['pick','push','place'].includes(c.phase),dx=Math.abs(c.direction[0]),dz=Math.abs(c.direction[1]);
 const half=loaded?[G.palletHalf*(dx+dz),G.palletHalf*(dx+dz)]:[.32*dz+.575*dx,.32*dx+.575*dz];
 return [{p:c.position,r:Math.max(...half),half},{p:offset(.65),r:.38},{p:offset(.95),r:.25},{p:o.position,r:G.operatorRadius}];
}
const spatialOverlap=(a,b)=>a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1];
function sweptClear(m,others,obstacles){
 // Use the same conservative frame/turn envelopes that A1 reserves. A shared
 // corridor is occupied only over each segment's actual interval, including
 // walking and empty return; the full mission is still a resource reservation.
 const sweeps=internalSweepReservations({missions:[m]});
 for(const a of sweeps){
  const hit=obstacles.find(b=>spatialOverlap(a,b));
  if(hit){m.conflict={obstacle:hit.id,time:a.start,body:a.body};return false;}
 }
 for(const other of others.filter(x=>overlap(x,m))){
  const reserved=internalSweepReservations({missions:[other]});let first=0;
  for(const a of sweeps){
   while(first<reserved.length&&reserved[first].end<=a.start+EPS)first++;
   for(let j=first;j<reserved.length&&reserved[j].start<a.end-EPS;j++){
    const b=reserved[j];
    if(overlap(a,b)&&spatialOverlap(a,b)){
     m.conflict={obstacle:`reserved corridor:${other.transfer.id}`,time:Math.max(a.start,b.start),end:Math.min(a.end,b.end),body:a.body,otherBody:b.body};return false;
    }
   }
  }
 }
 return true;
}
// Seconds of presentation, chosen for visual review at 1x, never workbook rates.
export const INTERNAL_TIMING=Object.freeze({loadedSpeed:1.8,emptySpeed:2,walkSpeed:1.6,turnRate:1.8,pick:.45,place:.45});
function reverseFrames(frames){
 const reversed=[...frames].reverse().map(f=>({...f,at:1-f.at}));
 reversed.duration=frames.duration;return reversed;
}
export function measureInternalCycle({transfer:e,carrier:c,operator:o,layout=INTERNAL_LAYOUT,timing=INTERNAL_TIMING}){
 const r=e.internalRoute||(layout===INTERNAL_LAYOUT?internalRoute(e.from,e.to,e.fromPosition,e.toPosition):e.route||internalRoute(e.from,e.to,e.fromPosition,e.toPosition));
 if(distance(r[0],e.fromPosition)>EPS||distance(r.at(-1),e.toPosition)>EPS)throw new Error(`Discontinuous route: ${e.id}`);
 const first=e.pickupDirection||direction(r[0],r[1]),home=behind(c.position,c.direction);
 const walkRoute=o.approachRoutes?.[c.id]||o.approachRoute||[o.position,home];
 if(distance(walkRoute[0],o.position)>EPS||distance(walkRoute.at(-1),home)>EPS)throw new Error('Operator approach does not connect home and handle');
 // A shared carrier keeps one home/identity, but each source needs its own
 // approach. Route and directions are selected together, never mixed with a
 // legacy direction list belonging to a different bay.
 const specific=Object.hasOwn(c.approachesByTransfer||{},e.id);
 const entry=specific?c.approachesByTransfer[e.id]:null;
 const approachRoute=specific?entry?.route:c.approachRoute||[c.position,e.fromPosition];
 const approachDirections=specific?entry?.directions:c.approachDirections;
 const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
 if(specific&&(!Array.isArray(approachRoute)||approachRoute.length<2||!approachRoute.every(point)||approachDirections!==undefined&&(!Array.isArray(approachDirections)||approachDirections.length!==approachRoute.length-1||!approachDirections.every(d=>point(d)&&Math.abs(Math.hypot(...d)-1)<EPS))))throw new Error(`Invalid carrier approach for transfer: ${e.id}`);
 const finalDirection=approachDirections?.at(-1)||direction(approachRoute.at(-2),e.fromPosition);
 if(distance(approachRoute[0],c.position)>EPS||distance(approachRoute.at(-1),e.fromPosition)>EPS||distance(direction(approachRoute.at(-2),e.fromPosition),first)>EPS||distance(finalDirection,first)>EPS)throw new Error('Carrier approach must align before entering the pallet');
 const walk=pathFrames(walkRoute,direction(walkRoute[0],walkRoute.at(-1)),timing.walkSpeed,timing.turnRate);
 const approach=pathFrames(approachRoute,c.direction,timing.emptySpeed,timing.turnRate,approachDirections);
 const push=pathFrames(r,first,timing.loadedSpeed,timing.turnRate,e.routeDirections);
 const emptyPush=pathFrames(r,first,timing.emptySpeed,timing.turnRate,e.routeDirections);
 const back=reverseFrames(emptyPush),backApproach=reverseFrames(approach);
 const backWalk=pathFrames([...walkRoute].reverse(),direction(home,walkRoute.at(-2)||o.position),timing.walkSpeed,timing.turnRate);
 const before=walk.duration+approach.duration,loaded=timing.pick+push.duration+timing.place,after=back.duration+backApproach.duration+backWalk.duration;
 return {transferId:e.id,operatorId:o.id,carrierId:c.id,route:r,before,loaded,after,total:before+loaded+after,distance:length(r),phases:{walk:walk.duration,approach:approach.duration,pick:timing.pick,push:push.duration,place:timing.place,emptyReturn:back.duration+backApproach.duration,walkHome:backWalk.duration},frames:{walk,approach,push,back,backApproach,backWalk},timing};
}
function buildMission(e,c,o,request,presentation={mode:'reference'}){
 const compressed=['production','demonstration'].includes(presentation.mode);
 let factor=compressed?request.loaded/(e.end-e.start):1;
 const emptyFactor=presentation.emptyCompressionFactor??factor;
 if(!Number.isFinite(emptyFactor)||emptyFactor<=0)throw new Error('Invalid empty compression factor');
 let before=request.before/emptyFactor,pickupStart=e.start,start=pickupStart-before;
 const fit=presentation.mode==='production'&&presentation.fitProductionStart&&start<135&&e.start>=135;
 if(fit){
  start=135;
  if(e.start>135+EPS)before=e.start-135;
  else{
   // At opening the approach belongs to the transfer window. Material stays
   // on its source bay until actual pickup; industrial release stays at 135.
   factor=(request.before+request.loaded)/(e.end-135);
   before=request.before/factor;pickupStart=135+before;
  }
 }
 const factors={before:before>EPS?request.before/before:factor,loaded:factor,after:emptyFactor};
 const delay=presentation.operatorReturnDelay??0;
 if(!Number.isFinite(delay)||delay<0)throw new Error('Invalid operator return delay');
 const lead=presentation.operatorApproachLead??0;
 if(!Number.isFinite(lead)||lead<0)throw new Error('Invalid operator approach lead');
 start-=lead;
 const f=request.frames,end=e.end+request.after/factors.after+delay;
 let at=start,baseAt=0;const segments=[];
 function add(phase,baseDuration,frames,timeScale,extra={}){
  const duration=baseDuration/timeScale;
  if(duration>EPS){segments.push(segment(phase,at,at+duration,frames,{timeScale,baseStart:baseAt,...extra}));at+=duration;baseAt+=baseDuration;}
 }
 add('approach',f.walk.duration,f.walk,factors.before,{walk:true});
 if(lead>EPS){segments.push(segment('wait',at,at+lead,[{...f.walk.at(-1),at:0}],{walk:true,timeScale:0,baseStart:baseAt}));at+=lead;}
 add('approach',f.approach.duration,f.approach,factors.before);
 add('pick',request.timing.pick,[{...f.push[0],at:0}],factors.loaded);
 add('push',(e.end-pickupStart)*factors.loaded-request.timing.pick-request.timing.place,f.push,factors.loaded);
 add('place',request.timing.place,[{...f.push.at(-1),at:0}],factors.loaded);
 add('return',f.back.duration,f.back,factors.after,{reverse:true});add('return',f.backApproach.duration,f.backApproach,factors.after,{reverse:true});
 if(delay>EPS){segments.push(segment('wait',at,at+delay,[{...f.backWalk[0],at:0}],{walk:true,timeScale:0,baseStart:baseAt}));at+=delay;}
 add('return',f.backWalk.duration,f.backWalk,factors.after,{walk:true});
 return {transfer:e,carrier:c,operator:o,start,end,pickupStart,speed:request.timing.loadedSpeed*factor,request,segments,presentation:{mode:presentation.mode,emptyCompressionFactor:presentation.emptyCompressionFactor,operatorApproachLead:lead,operatorReturnDelay:delay,compressionFactor:factor,phaseFactors:factors,openingFit:!!fit,baseSeconds:request.total,effectiveSeconds:end-start,before:pickupStart-start,loaded:e.end-pickupStart,after:end-e.end,transferWindowSeconds:e.end-e.start}};
}
export function compileInternalTransport({transfers,processes=[],layout=INTERNAL_LAYOUT,operators=[],carriers=[],timing=INTERNAL_TIMING,presentation={mode:'reference'},externalSweeps=[]}){
 if(!['reference','production','demonstration'].includes(presentation.mode))throw new Error('Unknown presentation mode');
 const missions=[],operatorReservations=[],output=[];
 if(new Set(transfers.map(e=>e.id)).size!==transfers.length)throw new Error('Duplicate transfer ID');
 for(const c of carriers)if(!c.position?.every(Number.isFinite)||!c.direction?.every(Number.isFinite)||Math.abs(Math.hypot(...c.direction)-1)>EPS)throw new Error('Invalid carrier');
 for(const o of operators)if(!/^.+:\d+$/.test(o.id)||!o.position?.every(Number.isFinite))throw new Error('Invalid operator');
 if(new Set(operators.map(o=>o.id)).size!==operators.length||new Set(carriers.map(c=>c.id)).size!==carriers.length)throw new Error('Duplicate resource ID');
 for(const e of [...transfers].sort((a,b)=>a.start-b.start)){
  if(!INTERNAL_LINKS.includes(`${e.from}>${e.to}`))throw new Error(`Not an internal transfer: ${e.id}`);
  if(!Number.isFinite(e.start)||!Number.isFinite(e.end)||e.end<=e.start)throw new Error(`No feasible window: ${e.id}`);
  let chosen;const reasons=[];
  for(const c of carriers)for(const o of operators){
   if(chosen||c.links&&!c.links.includes(`${e.from}>${e.to}`)||o.links&&!o.links.includes(`${e.from}>${e.to}`))continue;
   let request;try{request=measureInternalCycle({transfer:e,carrier:c,operator:o,layout,timing});}catch(error){if(error.message.startsWith('Discontinuous'))throw error;reasons.push(error.message);continue;}
   if(presentation.mode==='reference'&&e.end-e.start+EPS<request.loaded){reasons.push(`loaded requires ${request.loaded.toFixed(3)} s, available ${(e.end-e.start).toFixed(3)} s`);continue;}
   const m=buildMission(e,c,o,request,{...presentation,...presentation.byTransfer?.[e.id]});
   if(missions.some(x=>overlap(x,m)&&(x.carrier.id===c.id||x.operator.id===o.id||x.transfer.lotId===e.lotId))){reasons.push('resource reserved including return');continue;}
   if(processes.some(p=>`${p.station}:${p.machineIndex??0}`===o.id&&overlap(p,m))){reasons.push(`operator ${o.id} processing during cycle`);continue;}
   const parked=carriers.filter(x=>x.id!==c.id).map(x=>{
    // Cart-only footprint: forks extend +.575 m and handle extends -1.075 m.
    const d=x.direction,center=x.position.map((v,i)=>v-.25*d[i]);
    const half=[G.width/2*Math.abs(d[1])+G.length/2*Math.abs(d[0]),G.width/2*Math.abs(d[0])+G.length/2*Math.abs(d[1])];
    return {id:x.id,min:center.map((v,i)=>v-half[i]-.02),max:center.map((v,i)=>v+half[i]+.02)};
   });
   if(!sweptClear(m,missions,[...(layout.obstacles||[]),...parked])){reasons.push(`swept footprint intersects ${JSON.stringify(m.conflict||'reserved corridor')}`);continue;}
   const externalHit=externalSweeps.length&&internalSweepReservations({missions:[m]}).find(a=>externalSweeps.some(b=>overlap(a,b)&&a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1]));
   if(externalHit){reasons.push(`external swept reservation intersects at ${externalHit.start}`);continue;}
   if(presentation.mode==='production'&&(m.start<135-EPS||m.end>510+EPS)){reasons.push('full cycle crosses production boundary');continue;}
   chosen=m;
  }
  if(!chosen)throw new Error(`No feasible operator/carrier/space window: ${e.id} ${e.from}>${e.to}: ${[...new Set(reasons)].join('; ')}`);
  missions.push(chosen);operatorReservations.push({operatorId:chosen.operator.id,carrierId:chosen.carrier.id,transferId:e.id,start:chosen.start,end:chosen.end,presentation:chosen.presentation});
  output.push({...e,transportMode:'trolley',vehicleId:null,vehicleIndex:null,carrierId:chosen.carrier.id,operatorId:chosen.operator.id,route:chosen.request.route,approachStart:chosen.start,pickupStart:chosen.pickupStart,returnEnd:chosen.end,presentation:chosen.presentation});
 }
 return {transfers:output,missions,carriers:carriers.map(c=>({...c})),operatorReservations};
}
export function sampleInternalTransport(plan,elapsed){
 if(plan.demonstration&&(elapsed<plan.demonstration.start-EPS||elapsed>plan.demonstration.end+EPS))return {loads:new Map(),operators:new Map(),carriers:[]};
 const loads=new Map(),operators=new Map(),carriers=plan.carriers.map(c=>({id:c.id,position:[...c.position],direction:[...c.direction],deckHeight:G.floorHeight,visible:true,phase:'parked'}));
 for(const m of plan.missions){if(elapsed<m.start-EPS||elapsed>m.end+EPS)continue;const p=poseMission(m,elapsed);carriers[carriers.findIndex(c=>c.id===m.carrier.id)]=p.carrier;operators.set(m.operator.id,p.operator);
  const e=m.transfer;if(elapsed>=e.start&&elapsed<m.pickupStart){loads.set(e.lotId,{position:[...e.fromPosition],partPosition:[e.fromPosition[0],G.floorHeight+.25,e.fromPosition[1]],palletY:G.floorHeight,yaw:angle(m.request.frames.push[0].direction),partLocation:'bay',onCart:false,carrierId:null,operatorId:null,phase:'waiting-pickup'});}else if(elapsed>=m.pickupStart&&elapsed<=e.end){const c=p.carrier;loads.set(e.lotId,{position:[...c.position],partPosition:[c.position[0],c.deckHeight+.25,c.position[1]],palletY:c.deckHeight,yaw:c.yaw,direction:[...c.direction],partLocation:'trolley',onCart:false,vehicleId:null,vehicleIndex:null,carrierId:c.id,operatorId:m.operator.id,phase:c.phase});}
 }
 if(plan.demonstration){const m=plan.missions[0],e=m.transfer;if(!loads.has(e.lotId)){const position=elapsed<e.start?e.fromPosition:e.toPosition;const frame=elapsed<e.start?m.request.frames.push[0]:m.request.frames.push.at(-1);loads.set(e.lotId,{position:[...position],partPosition:[position[0],.3,position[1]],palletY:.05,yaw:angle(frame.direction),direction:frame.direction,partLocation:'bay',onCart:false,carrierId:null,operatorId:null,demonstration:true});}}
 return {loads,carriers,operators};
}

// Review fixtures only: longer candidate SCREEN windows are explicit. The
// industrial schedule is read-only. A1 must allocate/approve real film windows.
export function reviewInternalPilots(schedule){
 const results=[],processes=schedule.timeline.filter(e=>e.kind==='process');
 for(const pilot of INTERNAL_PILOTS){
  let found,lastError;
  for(const raw of schedule.timeline.filter(e=>`${e.from}>${e.to}`===pilot.link)){
   const input=prepareInternalAccess(internalPilotInput(raw,pilot)),request=measureInternalCycle(input);
   const transfer={...input.transfer,end:raw.start+request.loaded,internalRoute:request.route};
   const layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(transfer)]};
   try{
    const plan=compileInternalTransport({transfers:[transfer],operators:[input.operator],carriers:[input.carrier],layout,processes});
    found={link:pilot.link,raw,transfer,request,plan,layout,operator:input.operator};break;
   }catch(error){lastError=error;}
  }
  if(!found)throw new Error(`Pilot ${pilot.link}: ${lastError?.message}`);
  results.push(found);
 }
 return results;
}

// Audit an A1 proposal without allocating resources or changing any event.
// Minimum envelopes are diagnostics, NOT an executable replacement schedule.
export function auditInternalWindows({schedule,coordination}){
 const events=new Map(schedule.timeline.map(e=>[e.id,e])),requirements=coordination.requirements;
 const expected=schedule.timeline.filter(e=>INTERNAL_LINKS.includes(`${e.from}>${e.to}`));
 const supplied=new Set(requirements.map(r=>r.id));
 const missing=expected.filter(e=>!supplied.has(e.id)).map(e=>e.id),duplicates=requirements.filter((r,i)=>requirements.findIndex(x=>x.id===r.id)!==i).map(r=>r.id);
 const anchors=[],short=[],envelopes=[];
 for(const r of requirements){const e=events.get(r.id);if(!e){anchors.push({id:r.id,reason:'unknown event'});continue;}
  for(const key of ['startHours','endHours','lotId','start','end'])if(r[key]!==e[key])anchors.push({id:r.id,field:key,expected:e[key],actual:r[key]});
  if(e.end-e.start+EPS<r.loaded)short.push({id:r.id,available:e.end-e.start,required:r.loaded,deficit:r.loaded-(e.end-e.start)});
  envelopes.push({id:r.id,operatorId:r.operatorId,carrierId:r.carrierId,lotId:r.lotId,start:r.proposal?.reserveStart??r.start-r.before,end:r.proposal?.reserveEnd??r.start+r.loaded+r.after,loadedStart:r.proposal?.start??r.start,loadedEnd:r.proposal?.end??r.start+r.loaded});
 }
 const resourceConflicts=[],processConflicts=[];
 for(let i=0;i<envelopes.length;i++){
  const a=envelopes[i];for(const b of envelopes.slice(i+1))if(overlap(a,b)){
   const resources=['operatorId','carrierId'].filter(k=>a[k]&&a[k]===b[k]);if(a.lotId===b.lotId&&overlap({start:a.loadedStart,end:a.loadedEnd},{start:b.loadedStart,end:b.loadedEnd}))resources.push('lotId');
   if(resources.length)resourceConflicts.push({a:a.id,b:b.id,resources,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)});
  }
  for(const p of schedule.timeline.filter(e=>e.kind==='process'))if(`${p.station}:${p.machineIndex??0}`===a.operatorId&&overlap(a,p))processConflicts.push({transferId:a.id,processId:p.id,operatorId:a.operatorId,start:Math.max(a.start,p.start),end:Math.min(a.end,p.end)});
 }
 const chains=coordination.chains.map(c=>{
  const rs=requirements.filter(r=>r.lotId===c.lotId&&(c.side==='upstream'?['rosq','buffer'].includes(r.to):['m1','m2','insp'].includes(r.to)));
  const external=(rs[0]?.siblingTransfers||[]).map(id=>events.get(id)).filter(e=>e&&!supplied.has(e.id)).reduce((n,e)=>n+e.end-e.start,0);
  const lot=schedule.lots?.find(l=>l.id===c.lotId);
  const processMinimum=lot?lot.timeline.filter(e=>e.kind==='process'&&(c.side==='upstream'?['lap','rosq'].includes(e.station):['m1','m2','insp'].includes(e.station))).reduce((n,p)=>n+Math.min(.1,p.end-p.start),0):(c.side==='upstream'?.2:.3);
  const required=rs.reduce((n,r)=>n+r.loaded,external+processMinimum);
  return {lotId:c.lotId,side:c.side,budget:c.deadline-c.origin,required,deficit:Math.max(0,required-(c.deadline-c.origin)),matchesA1:Math.abs(required-c.required)<EPS,candidate:c.candidate};
 });
 return {complete:false,scope:'unallocated-minimum-envelope-audit',expected:expected.length,received:requirements.length,missing,duplicates,anchors,short,chains,resourceConflicts,processConflicts};
}
function polygonOverlap(a,b){
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],axis=[q[1]-p[1],p[0]-q[0]],project=ps=>ps.map(v=>v[0]*axis[0]+v[1]*axis[1]);
  const x=project(a),y=project(b);if(Math.max(...x)<=Math.min(...y)||Math.max(...y)<=Math.min(...x))return false;
 }return true;
}
// Explicitly sampled traffic diagnostic. A clean result is NOT continuous
// collision certification: A1's trajectory breakpoints are not supplied here.
export function auditInternalTraffic(plan,externalAt,{start=0,end=600,step=1/60}={}){
 if(!(step>0)||!Number.isFinite(step)||!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw new Error('Invalid traffic audit interval');
 const contacts=new Map();let samples=0;
 for(let tick=0;tick<=Math.ceil((end-start)/step);tick++){
  const t=Math.min(end,start+tick*step),active=plan.missions.filter(m=>t>=m.start&&t<=m.end);if(!active.length)continue;samples++;
  const external=externalAt(t);
  for(const m of active){const phase=poseMission(m,t).carrier.phase;
   for(const [body,b] of boxes(m,t).entries()){
    const p=b.p,r=b.r,polygon=[[p[0]-r,p[1]-r],[p[0]+r,p[1]-r],[p[0]+r,p[1]+r],[p[0]-r,p[1]+r]];
    for(const e of external)if(polygonOverlap(polygon,e.polygon)){
     const key=`${m.transfer.id}:${body}:${e.id}`,prior=contacts.get(key);
     if(prior){prior.last=t;prior.samples++;}else contacts.set(key,{transferId:m.transfer.id,operatorId:m.operator.id,carrierId:m.carrier.id,body:['pallet-forks','chassis','handle','operator'][body],phase,externalId:e.id,externalEventId:e.eventId??null,first:t,last:t,samples:1});
    }
   }
  }
 }
 return {complete:false,method:'sampled conservative internal envelopes versus external polygons',step,samples,contacts:[...contacts.values()]};
}


export function createInternalDemonstration({start,end,input,layout=INTERNAL_LAYOUT,processes=[]}){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<75||end>135||end<=start)throw new Error('Demonstration must fit Act 2 (75–135 s)');
 const {transfer:source,operator}=input;
 const sourceApproach=input.carrier.approachesByTransfer?.[source.id];
 const carrier=sourceApproach?{...input.carrier,approachesByTransfer:{...input.carrier.approachesByTransfer,'DEMO-TRANSFER':sourceApproach}}:input.carrier;
 const transfer={id:'DEMO-TRANSFER',lotId:'DEMO-PALLET',kind:'demonstration-transfer',demonstration:true,from:source.from,to:source.to,fromPosition:[...source.fromPosition],toPosition:[...source.toPosition],internalRoute:source.internalRoute,route:source.route,routeDirections:source.routeDirections,pickupDirection:source.pickupDirection};
 const request=measureInternalCycle({transfer,carrier,operator,layout}),scale=(end-start)/request.total;
 transfer.start=start+request.before*scale;transfer.end=transfer.start+request.loaded*scale;
 const plan=compileInternalTransport({transfers:[transfer],carriers:[carrier],operators:[operator],layout,processes,presentation:{mode:'demonstration'}});
 plan.demonstration={start,end,label:'DEMONSTRAÇÃO · paleteira manual',industrialEffect:false,operatorId:operator.id,palletId:'DEMO-PALLET'};
 return plan;
}


export function prepareInternalAccess({transfer,carrier,operator}){
 const access=INTERNAL_ACCESS[transfer.from];if(!access)throw new Error(`No access recipe: ${transfer.from}`);
 const route=internalAccessRoute(transfer.from,transfer.to,transfer.fromPosition,transfer.toPosition).filter((p,i,ps)=>!i||distance(p,ps[i-1])>EPS);
 const pickupDirection=direction(route[1],route[0]);
 const routeDirections=route.slice(1).map((p,i)=>{
  const a=route[i],upper=transfer.from==='buffer'&&transfer.fromPosition[1]<0;
  const reverse=upper?(a[0]===p[0]&&a[1]<4.3):transfer.from==='rosq'&&transfer.toPosition[1]<0&&a[1]===-.3&&p[1]===-.3;
  return reverse?direction(p,a):i?direction(a,p):pickupDirection;
 });
 const c={...carrier,position:[...access.position],direction:[...access.direction],approachRoute:internalApproachRoute(transfer.from,access.position,transfer.fromPosition)};
 c.approachDirections=c.approachRoute.slice(1).map((p,i)=>{const a=c.approachRoute[i];const reverse=transfer.from==='buffer'&&((transfer.fromPosition[1]<0&&a[1]===-.3&&p[1]===-.3)||(a[0]===.55&&p[0]===.55&&a[1]===3.6&&p[1]===4.3));return reverse?direction(p,a):direction(a,p);});
 c.approachesByTransfer={...carrier.approachesByTransfer,[transfer.id]:{route:c.approachRoute,directions:c.approachDirections}};
 const walk=access.supportWalks?.[operator.id]||access.walk;
 const o={...operator,approachRoute:distance(operator.position,walk[0])<EPS?walk:operator.approachRoute};
 return {transfer:{...transfer,internalRoute:route,pickupDirection,routeDirections},carrier:c,operator:o};
}


// AABB envelopes at ALL motion/turn breakpoints, including approach and return.
// A1 can intersect these with its conservative swept vehicle reservations.
export function internalSweepReservations(plan){
 const reservations=[];
 for(const m of plan.missions){
  const times=[...new Set(m.segments.flatMap(s=>[s.start,s.end,...s.frames.map(f=>s.start+(s.end-s.start)*f.at)]))].sort((a,b)=>a-b);
  for(let i=1;i<times.length;i++){const start=times[i-1],end=times[i];if(end-start<EPS)continue;const a=boxes(m,start+EPS),b=boxes(m,end-EPS);
   for(let k=0;k<a.length;k++){const extent=j=>Math.max(a[k].half?.[j]??a[k].r,b[k].half?.[j]??b[k].r)+.02;reservations.push({id:m.transfer.id,carrierId:m.carrier.id,operatorId:m.operator.id,body:k,start,end,min:a[k].p.map((v,j)=>Math.min(v,b[k].p[j])-extent(j)),max:a[k].p.map((v,j)=>Math.max(v,b[k].p[j])+extent(j))});}
  }
 }
 return reservations;
}

// Explicit relief pool: reuses a registered worker, never creates a person.
// A1 must reserve this ID against its buffer duties in the combined plan.
export function internalOperatorCandidates(input){
 const result=[input.operator];
 if(input.transfer.from==='lap'&&input.operator.id!=='buffer:0'){
  const operator=INTERNAL_PILOTS.find(p=>p.operator.id==='buffer:0').operator;
  result.push(prepareInternalAccess({...input,operator}).operator);
 }
 return result;
}

// Local temporal repair only: immutable paths and original industrial hours.
export function retimeInternalMission(plan,id,delta,{processes=[]}={}){
 const m=plan.missions.find(m=>m.transfer.id===id),w=m?.transfer.originalWindow;
 if(!m||!Number.isFinite(delta)||!w||m.transfer.to==='buffer'||m.transfer.start+delta<w.start-EPS||m.transfer.end+delta>w.end+EPS)throw new Error('Retiming exceeds anchored window');
 const transfer={...m.transfer,start:m.transfer.start+delta,end:m.transfer.end+delta};
 const n={...m,transfer,start:m.start+delta,end:m.end+delta,pickupStart:m.pickupStart+delta,segments:m.segments.map(s=>({...s,start:s.start+delta,end:s.end+delta}))};
 if(plan.missions.some(x=>x!==m&&overlap(x,n)&&(x.carrier.id===n.carrier.id||x.operator.id===n.operator.id||x.transfer.lotId===n.transfer.lotId))||processes.some(p=>`${p.station}:${p.machineIndex??0}`===n.operator.id&&overlap(p,n)))throw new Error('Retiming overlaps reserved resource');
 const move=e=>{const copy={...e};for(const key of ['start','end','approachStart','pickupStart','returnEnd'])if(Number.isFinite(copy[key]))copy[key]+=delta;return copy;};
 return {...plan,missions:plan.missions.map(x=>x===m?n:x),transfers:plan.transfers.map(e=>e.id===id?move(e):e),operatorReservations:plan.operatorReservations.map(r=>r.transferId===id?{...r,start:r.start+delta,end:r.end+delta}:r)};
}

export function compressEmptyMission(plan,id,ratio){
 const m=plan.missions.find(m=>m.transfer.id===id);
 if(!m||!Number.isFinite(ratio)||ratio<1||ratio>2||m.segments.some(s=>s.phase==='wait'))throw new Error('Unsupported empty phase adjustment');
 const before=m.presentation.before/ratio,after=m.presentation.after/ratio;
 const n={...m,start:m.pickupStart-before,end:m.transfer.end+after,segments:m.segments.map(s=>{
  const pivot=s.end<=m.pickupStart+EPS?m.pickupStart:s.start>=m.transfer.end-EPS?m.transfer.end:null;
  return pivot==null?s:{...s,start:pivot+(s.start-pivot)/ratio,end:pivot+(s.end-pivot)/ratio,timeScale:s.timeScale*ratio};
 }),presentation:{...m.presentation,before,after,effectiveSeconds:before+m.presentation.loaded+after,phaseFactors:{...m.presentation.phaseFactors,before:m.presentation.phaseFactors.before*ratio,after:m.presentation.phaseFactors.after*ratio}}};
 return {...plan,missions:plan.missions.map(x=>x===m?n:x),transfers:plan.transfers.map(e=>e.id===id?{...e,approachStart:n.start,returnEnd:n.end,presentation:n.presentation}:e),operatorReservations:plan.operatorReservations.map(r=>r.transferId===id?{...r,start:n.start,end:n.end,presentation:n.presentation}:r)};
}
