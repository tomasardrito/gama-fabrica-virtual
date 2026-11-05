// Accept an existing Playwright Page; no dependency installation.
export async function verifyInternalTransport(page,baseURL='http://127.0.0.1:8769'){
 const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
 try{
  await page.goto(`${baseURL}/tools/internal-preview.html`);
  await page.waitForFunction(()=>window.internalPreview?.pilots?.length===11);
  const results=[];
  for(let index=0;index<11;index++){
   const result=await page.evaluate(index=>{
    const p=window.internalPreview;p.choose(index);const {plan,event}=p,m=plan.missions[0];
    const phases=m.segments.map(s=>p.seek((s.start+s.end)/2).phase);
    return {phases,start:event.start,end:event.end,lotId:event.lotId,operatorId:m.operator.id,returnEnd:m.end};
   },index);
   for(const phase of ['approach','pick','push','place','return'])if(!result.phases.includes(phase))throw new Error(`Missing phase: ${phase}`);
   await page.getByRole('button',{name:'Reproduzir 1×'}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('REPRODUÇÃO 1×'));
   await page.evaluate(()=>window.internalPreview.seek(window.internalPreview.plan.missions[0].end+.01));
   if(!/parked|fora da demonstração/.test(await page.locator('#status').textContent()))throw new Error('Carrier did not return');
   results.push(result);
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return results;
 }finally{page.off('pageerror',onError);}
}

// Conservative audit: all carts remain parked for the whole film. Moving
// access/return and external-external traffic still need joint reservations.
export async function auditInternalParkingCorridors(externalSweeps,carriers){
 const {INTERNAL_LAYOUT,INTERNAL_GEOMETRY:G}=await import('../internal-layout.js');
 carriers??=INTERNAL_LAYOUT.parking;
 const conflicts=new Map(),intersects=(a,b)=>a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1];
 const polygonOverlap=(a,b)=>{
  for(const poly of [a,b])for(let i=0;i<poly.length;i++){
   const p=poly[i],q=poly[(i+1)%poly.length],axis=[q[1]-p[1],p[0]-q[0]],project=ps=>ps.map(v=>v[0]*axis[0]+v[1]*axis[1]),x=project(a),y=project(b);
   if(Math.max(...x)<=Math.min(...y)+1e-7||Math.max(...y)<=Math.min(...x)+1e-7)return false;
  }return true;
 };
 const sweeps=externalSweeps.map(s=>({...s,min:s.min||[0,1].map(i=>Math.min(...s.polygon.map(p=>p[i]))),max:s.max||[0,1].map(i=>Math.max(...s.polygon.map(p=>p[i])))}));
 for(const c of carriers){
  const d=c.direction,center=c.position.map((v,i)=>v-.25*d[i]),half=[G.width/2*Math.abs(d[1])+G.length/2*Math.abs(d[0]),G.width/2*Math.abs(d[0])+G.length/2*Math.abs(d[1])];
  const bounds={min:center.map((v,i)=>v-half[i]-.02),max:center.map((v,i)=>v+half[i]+.02)},polygon=[bounds.min,[bounds.max[0],bounds.min[1]],bounds.max,[bounds.min[0],bounds.max[1]]];
  for(const s of sweeps){
   if(!(s.end>s.start)||!intersects(bounds,s)||s.polygon&&!polygonOverlap(polygon,s.polygon))continue;
   const pair=c.id+'/'+s.id,previous=conflicts.get(pair);
   if(previous){previous.start=Math.min(previous.start,s.start);previous.end=Math.max(previous.end,s.end);previous.envelopes++;}
   else conflicts.set(pair,{carrierId:c.id,externalId:s.id,start:s.start,end:s.end,phase:s.phase,envelopes:1});
  }
 }
 return {complete:false,scope:'all carts parked versus every external swept interval; moving traffic not certified',checkedCarriers:carriers.length,checkedEnvelopes:externalSweeps.length,conflicts:[...conflicts.values()]};
}

// Read-only integration audit. Supply A1's directory explicitly; there is no
// mandatory runtime dependency on another worktree and no merge/edit of A1.
export async function auditA1Integration(a1Directory){
 const root=new URL(a1Directory.endsWith('/')?a1Directory:a1Directory+'/');
 const fs=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const signature=async()=>{const hash=createHash('sha256');for(const name of (await fs.readdir(root)).filter(n=>n.endsWith('.js')).sort()){hash.update(name);hash.update(await fs.readFile(new URL(name,root)));}return hash.digest('hex');};
 const signatureBefore=await signature();
 const [{DbrSimulation},presentation,handling,geometry,trucks,internal,layout]=await Promise.all([
  import(new URL('dbr-simulation.js',root)),import(new URL('dbr-presentation.js',root)),import(new URL('dbr-handling.js',root)),import(new URL('logistics-layout.js',root)),import(new URL('logistics-motion.js',root)),import('../internal-motion.js'),import('../internal-layout.js')]);
 const sim=new DbrSimulation(),schedule=sim.schedule,before=JSON.stringify(schedule),coordination=presentation.coordinateInternalWindows(schedule);
 const windows=internal.auditInternalWindows({schedule,coordination}),candidates=[],assignedChecks=[],carrierOrigins={};
 for(const r of coordination.requirements){if(!r.measurementInput||!r.proposal)continue;const x=r.measurementInput,e={...x.transfer,start:r.proposal.start,end:r.proposal.end,internalRoute:r.route};
  (carrierOrigins[x.carrier.id]??=new Set()).add(JSON.stringify(x.carrier.position));
  try{internal.compileInternalTransport({transfers:[e],operators:[x.operator],carriers:[x.carrier],layout:{...layout.INTERNAL_LAYOUT,obstacles:[...layout.INTERNAL_LAYOUT.obstacles,...layout.internalBayObstacles(e)]},processes:schedule.timeline.filter(e=>e.kind==='process')});assignedChecks.push({id:r.id,compiled:true,fitsChain:r.proposal.fitsChain});}catch(error){assignedChecks.push({id:r.id,compiled:false,fitsChain:r.proposal.fitsChain,error:error.message});}
 }
 for(const chain of coordination.chains.filter(c=>c.candidate)){
  const inputs=chain.candidate.map(c=>{
   const raw=schedule.timeline.find(e=>e.id===c.id),pilot=layout.INTERNAL_PILOTS.find(p=>p.link===`${raw.from}>${raw.to}`),input=layout.internalPilotInput(raw,pilot);
   return {...input,transfer:{...input.transfer,start:c.start,end:c.end,internalRoute:coordination.requirements.find(r=>r.id===c.id).route}};
  });
  const operators=new Map();for(const x of inputs){const prev=operators.get(x.operator.id)||{...x.operator,approachRoute:undefined,approachRoutes:{},links:[]};prev.links.push(`${x.transfer.from}>${x.transfer.to}`);prev.approachRoutes[x.carrier.id]=x.operator.approachRoute;operators.set(prev.id,prev);}
  const args={transfers:inputs.map(x=>x.transfer),carriers:inputs.map(x=>x.carrier),operators:[...operators.values()],processes:schedule.timeline.filter(e=>e.kind==='process')};
  const checks=[];for(const x of inputs)try{internal.compileInternalTransport({...args,transfers:[x.transfer],carriers:[x.carrier],operators:[x.operator]});checks.push({id:x.transfer.id,compiled:true});}catch(error){checks.push({id:x.transfer.id,compiled:false,error:error.message});}
  let combined;try{internal.compileInternalTransport(args);combined={compiled:true};}catch(error){combined={compiled:false,error:error.message};}
  candidates.push({lotId:chain.lotId,side:chain.side,windows:chain.candidate,checks,combined});
 }
 const externalPlan=handling.compileDbrHandling(schedule);
 const externalAt=t=>{
  const fleet=externalPlan.sample({elapsed:t,logisticsOnly:true},t).fleet;
  return [...fleet.map(v=>({id:v.id,eventId:v.event?.id||v.priorEvent?.id,polygon:geometry.boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),geometry.LOGISTICS_LAYOUT.forkliftBounds)})),
   ...schedule.trips.map(tr=>trucks.sampleLogisticsTruck([tr],t)).filter(v=>v.visible).map(v=>({id:`truck:${v.trip.id}`,eventId:v.trip.id,polygon:v.corners}))];
 };
 const trials=internal.reviewInternalPilots(schedule).map(p=>({link:p.link,transferId:p.transfer.id,...internal.auditInternalTraffic(p.plan,externalAt,{start:p.plan.missions[0].start,end:p.plan.missions[0].end,step:1/60})}));
 if(JSON.stringify(schedule)!==before)throw new Error('Integration audit mutated schedule');
 const {FactoryFilm}=await import('../factory-film.js'),reference=new FactoryFilm().schedule,industrialDifferences=[];
 for(const e of reference.timeline){const current=schedule.timeline.find(x=>x.id===e.id);for(const key of ['lotId','quantity','startHours','endHours'])if(current?.[key]!==e[key])industrialDifferences.push({id:e.id,key,before:e[key],after:current?.[key]});}
 for(const lot of reference.lots){const current=schedule.lots.find(x=>x.id===lot.id);for(const key of Object.keys(lot).filter(k=>k.endsWith('Hours')||k==='quantity'||k==='product'))if(current?.[key]!==lot[key])industrialDifferences.push({lotId:lot.id,key});}
 const ledgerUnchanged=JSON.stringify(reference.bufferLedger)===JSON.stringify(schedule.bufferLedger);
 const signatureAfter=await signature();
 return {sourceSignature:signatureBefore,sourceStable:signatureBefore===signatureAfter,assignedChecks,carrierOrigins:Object.fromEntries(Object.entries(carrierOrigins).map(([id,origins])=>[id,[...origins].map(p=>JSON.parse(p))])),industrialDifferences,ledgerUnchanged,complete:false,scope:'A1 requirements and independent D1 trials, NOT a 535-move allocation',windows,candidates,trials,externalReservationCount:coordination.externalReservations.length,immutable:true};
}

// Approved R2 policy: inspect each assigned bay pair with compressed full
// cycles. Independent acceptance is not joint traffic/resource certification.
export async function auditA1R2Access(a1Directory){
 const root=new URL(a1Directory.endsWith('/')?a1Directory:a1Directory+'/');
 const fs=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const signature=async()=>{const hash=createHash('sha256');for(const name of (await fs.readdir(root)).filter(n=>n.endsWith('.js')).sort()){hash.update(name);hash.update(await fs.readFile(new URL(name,root)));}return hash.digest('hex');};
 const sourceSignature=await signature();
 const [{DbrSimulation},{coordinateInternalWindows},internal,layout]=await Promise.all([import(new URL('dbr-simulation.js',root)),import(new URL('dbr-presentation.js',root)),import('../internal-motion.js'),import('../internal-layout.js')]);
 const schedule=new DbrSimulation().schedule,before=JSON.stringify(schedule),requirements=coordinateInternalWindows(schedule).requirements;
 const processes=schedule.timeline.filter(e=>e.kind==='process'),checks=[],reservations=[];
 for(const r of requirements){
  const measurementInput={...r.measurementInput,transfer:{...r.measurementInput.transfer,fromPosition:[...layout.INTERNAL_LAYOUT.bays[r.from][r.fromSlot]],toPosition:[...layout.INTERNAL_LAYOUT.bays[r.to][r.toSlot]]}};
  const x=internal.prepareInternalAccess(measurementInput),link=`${x.transfer.from}>${x.transfer.to}`;
  try{
   let plan,lastError;
   for(const operator of internal.internalOperatorCandidates(x)){
    const homes=[...layout.INTERNAL_PILOTS.map(p=>p.operator),{id:'rosq:0',position:[3.2,1.35]},{id:'rosq:1',position:[5.2,1.35]}];
    const stands=homes.filter(o=>o.id!==operator.id).map(o=>({id:`stand:${o.id}`,min:o.position.map(v=>v-.3),max:o.position.map(v=>v+.3)}));
    const carriers=[x.carrier,...layout.INTERNAL_LAYOUT.parking.filter(c=>c.id!==x.carrier.id).map(c=>({...c,links:[]}))];
    try{plan=internal.compileInternalTransport({transfers:[x.transfer],carriers,operators:[operator],processes,layout:{...layout.INTERNAL_LAYOUT,obstacles:[...layout.INTERNAL_LAYOUT.obstacles,...layout.internalBayObstacles(x.transfer),...stands]},presentation:{mode:'production',fitProductionStart:true}});break;}catch(error){lastError=error;}
   }
   if(!plan)throw lastError;
   reservations.push(...plan.operatorReservations);checks.push({id:r.id,link,compiled:true,operatorId:plan.missions[0].operator.id,pickupStart:plan.missions[0].pickupStart,fromPosition:x.transfer.fromPosition,toPosition:x.transfer.toPosition,...plan.missions[0].presentation});
  }catch(error){checks.push({id:r.id,link,compiled:false,fromPosition:x.transfer.fromPosition,toPosition:x.transfer.toPosition,error:error.message});}
 }
 const conflicts=[];
 for(let i=0;i<reservations.length;i++)for(const b of reservations.slice(i+1)){const a=reservations[i];if(a.start<b.end&&b.start<a.end){const resources=['operatorId','carrierId'].filter(k=>a[k]===b[k]);if(resources.length)conflicts.push({a:a.transferId,b:b.transferId,resources,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)});}}
 if(JSON.stringify(schedule)!==before)throw new Error('R2 audit mutated industrial schedule');
 const summary=Object.fromEntries(layout.INTERNAL_LINKS.map(link=>{const all=checks.filter(c=>c.link===link);return [link,{total:all.length,compiled:all.filter(c=>c.compiled).length,rejected:all.filter(c=>!c.compiled).length}];}));
 return {complete:false,scope:'R2 independent access checks; shared resources and external sweeps still require allocation',sourceSignature,sourceStable:sourceSignature===await signature(),immutable:true,summary,checks,reservations,conflicts};
}
