import test from 'node:test';
import assert from 'node:assert/strict';
import {compileInternalTransport,sampleInternalTransport} from '../internal-motion.js';
const event={id:'move-1',lotId:'lot-1',from:'m1',to:'m2',quantity:500,start:10,end:14,startHours:20,endHours:20.2,fromPosition:[0,0],toPosition:[4,0],route:[[0,0],[4,0]]};
const options={transfers:[event],processes:[],layout:{obstacles:[],parking:[]},operators:[{id:'m1:0',position:[-2.7,0]}],carriers:[{id:'jack-1',position:[-1.2,0],direction:[1,0]}]};
test('preserves industrial data and exact load endpoints without mutating input',()=>{
 const before=JSON.stringify(options),p=compileInternalTransport(options);
 assert.equal(JSON.stringify(options),before);
 assert.equal(p.transfers[0].startHours,20);assert.equal(p.transfers[0].endHours,20.2);
 for(const [t,pos] of [[10,[0,0]],[14,[4,0]]])assert.deepEqual(sampleInternalTransport(p,t).loads.get('lot-1').position,pos);
 const load=sampleInternalTransport(p,12).loads.get('lot-1');assert.equal(load.partLocation,'trolley');assert.equal(load.onCart,false);assert.equal(load.vehicleId,null);assert.ok(!('quantity' in load));
});
test('reserves return and rejects double booking rather than teleporting',()=>{
 assert.throws(()=>compileInternalTransport({...options,transfers:[event,{...event,id:'move-2',lotId:'lot-2',start:14.1,end:18.1}]}),/No feasible/);
});
test('rejects operator processing during the whole mission',()=>{
 assert.throws(()=>compileInternalTransport({...options,processes:[{station:'m1',machineIndex:0,start:9,end:11}]}),/No feasible/);
});
test('rejects route through obstacle',()=>{
 assert.throws(()=>compileInternalTransport({...options,layout:{obstacles:[{id:'machine',min:[1,-1],max:[3,1]}]}}),/No feasible/);
});
test('returns carrier and operator continuously to their original parking/home',()=>{
 const p=compileInternalTransport(options),m=p.missions[0];let prev;
 for(let t=m.start;t<=m.end;t+=.005){const s=sampleInternalTransport(p,t),c=s.carriers[0],op=s.operators.get('m1:0');if(prev){assert.ok(Math.hypot(...c.position.map((x,i)=>x-prev.c[i]))<.1);assert.ok(Math.hypot(...op.position.map((x,i)=>x-prev.o[i]))<.2);}prev={c:c.position,o:op.position};}
 assert.deepEqual(sampleInternalTransport(p,m.end+.01).carriers[0].position,[-1.2,0]);
 assert.equal(sampleInternalTransport(p,m.end+.01).operators.size,0);
});

test('rejects duplicate identities and mismatched route endpoints',()=>{
 assert.throws(()=>compileInternalTransport({...options,operators:[...options.operators,...options.operators]}),/Duplicate/);
 assert.throws(()=>compileInternalTransport({...options,transfers:[{...event,internalRoute:[[1,0],[4,0]]}]}),/Discontinuous/);
});

test('five proposed cycles preserve the schedule, use existing idle operators and clear occupied bays',async()=>{
 const {FactoryFilm}=await import('./prepared-test-helpers.mjs');const {reviewInternalPilots}=await import('../internal-motion.js');const film=new FactoryFilm(),before=JSON.stringify(film.schedule);
 const pilots=reviewInternalPilots(film.schedule);assert.equal(pilots.length,5);assert.equal(JSON.stringify(film.schedule),before);
 assert.equal(new Set(pilots.map(p=>p.operator.id)).size,4);
 for(const p of pilots){assert.equal(p.transfer.startHours,p.raw.startHours);assert.equal(p.transfer.endHours,p.raw.endHours);assert.equal(p.transfer.quantity,p.raw.quantity);
  const m=p.plan.missions[0];let prev;
  for(let t=m.start;t<m.end;t+=.005){const s=sampleInternalTransport(p.plan,t),c=s.carriers[0],op=s.operators.get(p.operator.id);if(prev){assert.ok(Math.hypot(...c.position.map((v,i)=>v-prev.c[i]))<.04,`cart ${p.link} at ${t}`);assert.ok(Math.hypot(...op.position.map((v,i)=>v-prev.o[i]))<.06,`operator ${p.link} at ${t}`);}prev={c:c.position,o:op.position};
   if(t>=p.transfer.start&&t<p.transfer.end){const l=s.loads.get(p.transfer.lotId);assert.deepEqual(l.position,c.position);assert.equal(l.palletY,c.deckHeight);assert.ok(!('quantity' in l));}
  }
 }
});

test('publishes a cycle request including empty return without changing the event',async()=>{
 const {measureInternalCycle}=await import('../internal-motion.js');
 const before=JSON.stringify(event);
 const request=measureInternalCycle({transfer:event,carrier:options.carriers[0],operator:options.operators[0],layout:options.layout});
 assert.equal(JSON.stringify(event),before);assert.ok(request.before>0);assert.ok(request.after>0);
 assert.equal(request.total,request.before+request.loaded+request.after);
 assert.ok(request.loaded>=4/1.8+.9);
});

test('tries compatible resources after an incompatible carrier candidate',()=>{
 const wrong={id:'wrong',position:[20,20],direction:[0,1]};
 const plan=compileInternalTransport({...options,carriers:[wrong,...options.carriers]});
 assert.equal(plan.missions[0].carrier.id,'jack-1');
});

test('traffic audit detects a conflict during empty return without modifying either input',async()=>{
 const {auditInternalTraffic}=await import('../internal-motion.js');
 const plan=compileInternalTransport(options),m=plan.missions[0],before=JSON.stringify(plan);
 const at=(event.end+m.end)/2,pos=sampleInternalTransport(plan,at).carriers[0].position;
 const obstacle={id:'forklift-test',polygon:[[pos[0]-1,pos[1]-1],[pos[0]+1,pos[1]-1],[pos[0]+1,pos[1]+1],[pos[0]-1,pos[1]+1]]};
 const result=auditInternalTraffic(plan,()=>[obstacle],{start:at,end:at+.1,step:.01});
 assert.ok(result.contacts.some(c=>c.phase==='return'&&c.externalId==='forklift-test'));
 assert.equal(JSON.stringify(plan),before);
 assert.equal(auditInternalTraffic(plan,()=>[],{start:at,end:at+.1}).contacts.length,0);
});

test('window audit detects resource reuse after delivery but before empty return',async()=>{
 const {auditInternalWindows}=await import('../internal-motion.js');
 const transfers=[event,{...event,id:'move-2',lotId:'lot-2',start:15,end:19}];
 const schedule={timeline:transfers},coordination={requirements:transfers.map(e=>({...e,before:1,loaded:4,after:3,operatorId:'m1:0',carrierId:'jack-1'})),chains:[]},before=JSON.stringify({schedule,coordination});
 const report=auditInternalWindows({schedule,coordination});
 assert.equal(report.short.length,0);assert.equal(report.resourceConflicts.length,1);
 assert.deepEqual(report.resourceConflicts[0].resources,['operatorId','carrierId']);
 assert.equal(report.complete,false);assert.equal(JSON.stringify({schedule,coordination}),before);
});

test('production compression scales every phase and reservation without changing industrial anchors',()=>{
 const short={...event,start:140,end:140.6};
 const p=compileInternalTransport({...options,transfers:[short],presentation:{mode:'production'}}),m=p.missions[0];
 assert.ok(m.presentation.compressionFactor>1);
 const factor=m.presentation.compressionFactor;
 assert.ok(Math.abs((short.start-m.start)*factor-m.request.before)<1e-7);
 assert.ok(Math.abs((m.end-short.end)*factor-m.request.after)<1e-7);
 assert.equal(p.transfers[0].startHours,event.startHours);
 assert.equal(p.operatorReservations[0].end,m.end);
 for(const s of m.segments)assert.ok(s.end>s.start);
});
test('a compressed crossing still fails swept obstacle validation',()=>{
 assert.throws(()=>compileInternalTransport({...options,transfers:[{...event,start:140,end:140.6}],presentation:{mode:'production'},layout:{obstacles:[{id:'wall',min:[1,-1],max:[3,1]}]}}),/swept footprint/);
});

test('demonstration stays inside Act 2 and has no industrial identity or quantities',async()=>{
 const {createInternalDemonstration}=await import('../internal-motion.js');
 const plan=createInternalDemonstration({start:100,end:125,input:{transfer:event,carrier:options.carriers[0],operator:options.operators[0]},layout:options.layout});
 const m=plan.missions[0];assert.ok(Math.abs(m.start-100)<1e-8);assert.ok(Math.abs(m.end-125)<1e-8);
 assert.equal(plan.transfers[0].lotId,'DEMO-PALLET');assert.ok(!('quantity' in plan.transfers[0]));assert.ok(!('startHours' in plan.transfers[0]));
 assert.equal(sampleInternalTransport(plan,99).loads.size,0);assert.equal(sampleInternalTransport(plan,126).carriers.length,0);
 assert.equal(sampleInternalTransport(plan,100.1).loads.size,1);
 assert.throws(()=>createInternalDemonstration({start:74,end:100,input:{transfer:event,carrier:options.carriers[0],operator:options.operators[0]}}),/Act 2/);
});

test('external swept reservations block sub-frame crossings of a compressed move',()=>{
 const short={...event,start:140,end:140.6};
 assert.throws(()=>compileInternalTransport({...options,transfers:[short],presentation:{mode:'production'},externalSweeps:[{id:'forklift',start:140.29,end:140.31,min:[1.8,-1],max:[2.2,1]}]}),/external/);
});

test('real accelerated cycle and Act 2 example share the same full-cycle trajectory',async()=>{
 const {FactoryFilm}=await import('./prepared-test-helpers.mjs');const {INTERNAL_PILOTS,internalPilotInput,INTERNAL_LAYOUT,internalBayObstacles}=await import('../internal-layout.js');
 const {prepareInternalAccess,createInternalDemonstration}=await import('../internal-motion.js');
 const f=new FactoryFilm(),before=JSON.stringify(f.schedule),raw=f.schedule.timeline.find(e=>e.from==='m1'&&e.to==='m2');
 const x=prepareInternalAccess(internalPilotInput(raw,INTERNAL_PILOTS[3])),layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(x.transfer)]};
 const production=compileInternalTransport({transfers:[x.transfer],carriers:[x.carrier],operators:[x.operator],layout,processes:f.schedule.timeline.filter(e=>e.kind==='process'),presentation:{mode:'production'}});
 const demo=createInternalDemonstration({start:100,end:130,input:x,layout});
 const p=production.missions[0],d=demo.missions[0];
 for(let n=0;n<=300;n++){const a=sampleInternalTransport(production,p.start+(p.end-p.start)*n/300).carriers[0],b=sampleInternalTransport(demo,d.start+(d.end-d.start)*n/300).carriers[0];assert.ok(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))<1e-6);}
 assert.equal(production.transfers[0].end,raw.end);assert.equal(JSON.stringify(f.schedule),before);
});

test('revised aisle entries clear neighboring bays at the former upstream conflicts',async()=>{
 const {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles}=await import('../internal-layout.js');
 const {prepareInternalAccess}=await import('../internal-motion.js');
 for(const [pilotIndex,source,destination] of [[1,1,0]]){
  const pilot={...INTERNAL_PILOTS[pilotIndex],source,destination},[from,to]=pilot.link.split('>');
  const x=prepareInternalAccess(internalPilotInput({...event,from,to,start:200,end:202},pilot));
  const layout={...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(x.transfer)]};
  assert.doesNotThrow(()=>compileInternalTransport({transfers:[x.transfer],carriers:[x.carrier],operators:[x.operator],layout,presentation:{mode:'production'}}),pilot.link);
 }
});

test('swept reservations include the rotated pallet corner between fast frames',()=>{
 const d=[Math.SQRT1_2,Math.SQRT1_2],c={id:'jack-1',position:d.map(v=>-1.2*v),direction:d};
 const args={...options,transfers:[{...event,start:140,end:141,toPosition:[4,4],route:[[0,0],[4,4]]}],carriers:[c],operators:[{id:'m1:0',position:d.map(v=>-2.7*v)}],presentation:{mode:'production'}};
 const plan=compileInternalTransport(args),pos=sampleInternalTransport(plan,140.5).carriers[0].position;
 assert.throws(()=>compileInternalTransport({...args,externalSweeps:[{id:'corner',start:140.5,end:140.500001,min:[pos[0]-.01,pos[1]+.73],max:[pos[0]+.01,pos[1]+.76]}]}),/external/);
});

test('every upstream bay pair clears machines and all other occupied bays',async()=>{
 const {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles}=await import('../internal-layout.js');
 const {prepareInternalAccess}=await import('../internal-motion.js');
 const failures=[];
 for(const pilot of INTERNAL_PILOTS.slice(0,3)){
  const [from,to]=pilot.link.split('>');
  for(let source=0;source<INTERNAL_LAYOUT.bays[from].length;source++)for(let destination=0;destination<INTERNAL_LAYOUT.bays[to].length;destination++){
   const x=prepareInternalAccess(internalPilotInput({...event,from,to,start:200,end:202},{...pilot,source,destination}));
   try{compileInternalTransport({transfers:[x.transfer],carriers:[x.carrier],operators:[x.operator],layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(x.transfer)]},presentation:{mode:'production'}});}catch(e){failures.push(`${from}:${source}>${to}:${destination}: ${e.message}`);}
  }
 }
 assert.deepEqual(failures,[]);
});

test('production opening keeps approach and supports the source load until actual pickup',async()=>{
 const {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles}=await import('../internal-layout.js');
 const {prepareInternalAccess}=await import('../internal-motion.js');
 const x=prepareInternalAccess(internalPilotInput({...event,from:'buffer',to:'m1',start:135,end:137}, {...INTERNAL_PILOTS[2],source:0,destination:0}));
 const args={transfers:[x.transfer],carriers:[x.carrier],operators:[x.operator],layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(x.transfer)]},presentation:{mode:'production',fitProductionStart:true}};
 const plan=compileInternalTransport(args),m=plan.missions[0];
 assert.equal(m.start,135);assert.ok(m.pickupStart>135);assert.equal(m.transfer.end,137);
 assert.ok(m.segments.some(s=>s.phase==='approach'&&s.end>s.start));
 const waiting=sampleInternalTransport(plan,(135+m.pickupStart)/2).loads.get(event.lotId);
 assert.deepEqual(waiting.position,x.transfer.fromPosition);assert.equal(waiting.partLocation,'bay');assert.equal(waiting.carrierId,null);
 assert.equal(plan.operatorReservations[0].start,135);assert.ok(plan.operatorReservations[0].end>137);
 assert.equal(sampleInternalTransport(plan,137).loads.get(event.lotId).partLocation,'trolley');
});

test('production floor shortens only pre-release preparation and never picks up early',()=>{
 const short={...event,start:135.1,end:136};
 const plan=compileInternalTransport({...options,transfers:[short],presentation:{mode:'production',fitProductionStart:true}}),m=plan.missions[0];
 assert.equal(m.start,135);assert.equal(m.pickupStart,135.1);
 assert.ok(m.presentation.phaseFactors.before>m.presentation.phaseFactors.loaded);
 assert.equal(m.transfer.startHours,event.startHours);
});

test('Lapidation relief uses the existing buffer operator only when explicitly supplied and idle',async()=>{
 const {INTERNAL_PILOTS,INTERNAL_LAYOUT,internalPilotInput,internalBayObstacles}=await import('../internal-layout.js');
 const {prepareInternalAccess,internalOperatorCandidates}=await import('../internal-motion.js');
 const x=prepareInternalAccess(internalPilotInput({...event,from:'lap',to:'rosq',start:200,end:202},INTERNAL_PILOTS[0]));
 const operators=internalOperatorCandidates(x),args={transfers:[x.transfer],carriers:[x.carrier],operators,processes:[{station:'lap',machineIndex:1,start:190,end:210}],layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(x.transfer)]},presentation:{mode:'production'}};
 assert.deepEqual(operators.map(o=>o.id),['lap:1','buffer:0']);
 const plan=compileInternalTransport(args);assert.equal(plan.missions[0].operator.id,'buffer:0');
 assert.throws(()=>compileInternalTransport({...args,processes:[...args.processes,{station:'buffer',machineIndex:0,start:190,end:210}]}),/processing during cycle/);
 assert.throws(()=>compileInternalTransport({...args,operators:[x.operator]}),/processing during cycle/);
});

test('all bay pairs clear other parked carriers and occupied operator stands',async()=>{
 const {INTERNAL_LAYOUT,INTERNAL_PILOTS,internalPilotInput,internalBayObstacles}=await import('../internal-layout.js');
 const {prepareInternalAccess}=await import('../internal-motion.js');
 const homes=[...INTERNAL_PILOTS.map(p=>p.operator),{id:'rosq:0',position:[3.2,1.35]},{id:'rosq:1',position:[5.2,1.35]}],failures=[];
 for(const pilot of INTERNAL_PILOTS){const [from,to]=pilot.link.split('>');
  for(let source=0;source<INTERNAL_LAYOUT.bays[from].length;source++)for(let destination=0;destination<INTERNAL_LAYOUT.bays[to].length;destination++){
   const x=prepareInternalAccess(internalPilotInput({...event,from,to,start:200,end:202},{...pilot,source,destination}));
   const stands=homes.filter(o=>o.id!==x.operator.id).map(o=>({id:o.id,min:o.position.map(v=>v-.3),max:o.position.map(v=>v+.3)}));
   const carriers=[x.carrier,...INTERNAL_LAYOUT.parking.filter(c=>c.id!==x.carrier.id).map(c=>({...c,links:[]}))];
   try{compileInternalTransport({transfers:[x.transfer],carriers,operators:[x.operator],layout:{...INTERNAL_LAYOUT,obstacles:[...INTERNAL_LAYOUT.obstacles,...internalBayObstacles(x.transfer),...stands]},presentation:{mode:'production'}});}catch(e){failures.push(`${from}:${source}>${to}:${destination}: ${e.message}`);}
  }
 }
 assert.deepEqual(failures,[]);
});

async function m1MultiBayInputs(){
 const {FactoryFilm}=await import('./prepared-test-helpers.mjs'),{DBR_BAYS}=await import('../dbr-layout.js');
 const {INTERNAL_PILOTS,internalPilotInput}=await import('../internal-layout.js'),{prepareInternalAccess}=await import('../internal-motion.js');
 const schedule=new FactoryFilm().schedule;
 const inputs=['DBR-E9','DBR-E60'].map(id=>{
  const raw=schedule.timeline.find(e=>e.id===id),slot=(stage,pos)=>DBR_BAYS[stage].findIndex(p=>p[0]===pos[0]&&p[1]===pos[1]);
  return prepareInternalAccess(internalPilotInput(raw,{...INTERNAL_PILOTS[3],source:slot(raw.from,raw.fromPosition),destination:slot(raw.to,raw.toPosition)}));
 });
 return {inputs,processes:schedule.timeline.filter(e=>e.kind==='process')};
}

test('DBR-E9 and DBR-E60 share jack-m1 with transfer-specific approach and return',async()=>{
 const {inputs,processes}=await m1MultiBayInputs(),{INTERNAL_LAYOUT}=await import('../internal-layout.js');
 assert.deepEqual(inputs.map(x=>x.transfer.fromPosition),[[-5.8,9.3],[-4.2,9.3]]);
 const common={processes,layout:INTERNAL_LAYOUT,presentation:{mode:'production'}},single=inputs.map(x=>compileInternalTransport({...common,transfers:[x.transfer],carriers:[x.carrier],operators:[x.operator]}));
 const carrier={...inputs[0].carrier,approachesByTransfer:Object.assign({},...inputs.map(x=>x.carrier.approachesByTransfer))};
 const args={...common,transfers:inputs.map(x=>x.transfer),carriers:[carrier],operators:[inputs[0].operator]},before=JSON.stringify(args);
 const joint=compileInternalTransport(args);
 assert.equal(JSON.stringify(args),before);assert.equal(joint.carriers.length,1);assert.equal(joint.carriers[0].id,'jack-m1');
 assert.deepEqual(joint.operatorReservations,single.flatMap(p=>p.operatorReservations));
 for(let i=0;i<inputs.length;i++){
  const m=joint.missions[i],expected=single[i].missions[0];
  assert.deepEqual(m.request.frames.approach,expected.request.frames.approach);
  assert.deepEqual(m.request.frames.backApproach,expected.request.frames.backApproach);
  assert.deepEqual(m.request.frames.approach.at(-1).position,m.transfer.fromPosition);
  assert.deepEqual(m.request.frames.backApproach[0].position,m.transfer.fromPosition);
  assert.deepEqual(m.request.frames.backApproach.at(-1).position,carrier.position);
  for(let n=0;n<=200;n++){
   const t=m.start+(m.end-m.start)*n/200,a=sampleInternalTransport(joint,t),b=sampleInternalTransport(single[i],t);
   assert.equal(a.carriers.length,1);assert.deepEqual(a.carriers,b.carriers);assert.deepEqual(a.operators,b.operators);assert.deepEqual(a.loads,b.loads);
  }
  assert.equal(joint.operatorReservations[i].end,m.end);
 }
 const gap=sampleInternalTransport(joint,(joint.missions[0].end+joint.missions[1].start)/2);
 assert.deepEqual(gap.carriers[0].position,carrier.position);assert.equal(gap.operators.size,0);
 const moved={...inputs[1].transfer,start:joint.missions[0].transfer.end+.01,end:joint.missions[0].transfer.end+.21};
 assert.throws(()=>compileInternalTransport({...args,transfers:[inputs[0].transfer,moved]}),/resource reserved including return/);
});

test('transfer approach directions are paired with their route and legacy fallback remains valid',async()=>{
 const {measureInternalCycle}=await import('../internal-motion.js');
 const transfer={...event,fromPosition:[0,0],toPosition:[0,4],route:[[0,0],[0,4]]};
 const route=[[-4,0],[-2,0],[-2,-2],[0,-2],[0,0]],directions=[[1,0],[0,1],[1,0],[0,1]];
 const carrier={id:'jack-1',position:[-4,0],direction:[1,0],approachRoute:route,approachDirections:directions},operator={id:'m1:0',position:[-5.5,0]};
 const base={transfer,carrier,operator,layout:options.layout},legacy=measureInternalCycle(base);
 const mapped={...carrier,approachRoute:[[-4,0],[0,0]],approachDirections:[[1,0]],approachesByTransfer:{[transfer.id]:{route,directions}}};
 assert.deepEqual(measureInternalCycle({...base,carrier:mapped}),legacy);
 const automatic=measureInternalCycle({...base,carrier:{...carrier,approachDirections:undefined}});
 assert.deepEqual(measureInternalCycle({...base,carrier:{...mapped,approachesByTransfer:{[transfer.id]:{route}}}}),automatic);
 assert.deepEqual(measureInternalCycle({...base,carrier:{...carrier,approachesByTransfer:{unrelated:{route:[[-4,0],[1,1]]}}}}),legacy);
 assert.throws(()=>measureInternalCycle({...base,carrier:{...carrier,approachesByTransfer:{[transfer.id]:{directions}}}}),/Invalid carrier approach/);
 assert.throws(()=>measureInternalCycle({...base,carrier:{...carrier,approachesByTransfer:{[transfer.id]:{route,directions:[[1,0]]}}}}),/Invalid carrier approach/);
 assert.throws(()=>measureInternalCycle({...base,carrier:{...carrier,approachesByTransfer:{[transfer.id]:{route,directions:[...directions.slice(0,-1),[1,0]]}}}}),/align/);
});

async function timedJointInputs(){
 const {FactoryFilm}=await import('./prepared-test-helpers.mjs'),{DBR_BAYS}=await import('../dbr-layout.js');
 const {INTERNAL_PILOTS,internalPilotInput}=await import('../internal-layout.js'),{prepareInternalAccess}=await import('../internal-motion.js');
 const schedule=new FactoryFilm().schedule;
 const windows=[{id:'DBR-E13',start:138.41374727446492,end:138.71254160333248},{id:'DBR-E7',start:139.40672649374076,end:139.59021474329361}];
 return windows.map(w=>{
  const raw=schedule.timeline.find(e=>e.id===w.id),pilot=INTERNAL_PILOTS.find(p=>p.link===`${raw.from}>${raw.to}`);
  const slot=(stage,pos)=>DBR_BAYS[stage].findIndex(p=>p[0]===pos[0]&&p[1]===pos[1]);
  return prepareInternalAccess(internalPilotInput({...raw,...w},{...pilot,source:slot(raw.from,raw.fromPosition),destination:slot(raw.to,raw.toPosition)}));
 });
}
const sweepOverlap=(a,b)=>a.start<b.end-1e-8&&b.start<a.end-1e-8&&a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1];
test('E13 and E7 may share a corridor at different segment times during overlapping cycles',async()=>{
 const inputs=await timedJointInputs(),{INTERNAL_LAYOUT}=await import('../internal-layout.js'),{internalSweepReservations}=await import('../internal-motion.js');
 const common={layout:INTERNAL_LAYOUT,presentation:{mode:'production',fitProductionStart:true}};
 const single=inputs.map(i=>compileInternalTransport({...common,transfers:[i.transfer],carriers:[i.carrier],operators:[i.operator]})),sweeps=single.map(internalSweepReservations);
 assert.ok(single[0].missions[0].end>single[1].missions[0].start);
 assert.equal(sweeps[0].some(a=>sweeps[1].some(b=>sweepOverlap(a,b))),false);
 const args={...common,transfers:inputs.map(i=>i.transfer),carriers:inputs.map(i=>i.carrier),operators:inputs.map(i=>i.operator)},before=JSON.stringify(args);
 const joint=compileInternalTransport(args);
 assert.equal(JSON.stringify(args),before);assert.deepEqual(joint.operatorReservations,single.flatMap(p=>p.operatorReservations));
 assert.deepEqual(internalSweepReservations(joint),sweeps.flat());
});
test('simultaneous swept crossings remain blocked between frames and during empty return',async()=>{
 const {internalSweepReservations}=await import('../internal-motion.js');
 const horizontal={...event,start:140,end:140.12},vertical={...event,id:'cross',lotId:'cross-lot',from:'rosq',to:'buffer',start:140,end:140.12,fromPosition:[2,-4],toPosition:[2,4],route:[[2,-4],[2,4]]};
 const h={...options,transfers:[horizontal],carriers:[{...options.carriers[0],links:['m1>m2']}],operators:[{...options.operators[0],links:['m1>m2']}],presentation:{mode:'production'}};
 const v={...h,transfers:[vertical],carriers:[{id:'jack-cross',position:[2,-5.2],direction:[0,1],links:['rosq>buffer']}],operators:[{id:'rosq:0',position:[2,-6.7],links:['rosq>buffer']}]};
 const hp=compileInternalTransport(h),vp=compileInternalTransport(v),hs=internalSweepReservations(hp),vs=internalSweepReservations(vp);
 assert.ok(hs.some(a=>vs.some(b=>sweepOverlap(a,b))));
 const joint={...h,transfers:[horizontal,vertical],carriers:[...h.carriers,...v.carriers],operators:[...h.operators,...v.operators]};
 assert.throws(()=>compileInternalTransport(joint),/swept footprint/);
 // Move the crossing's loaded leg into the first cart's empty return.
 const shifted={...vertical,start:140.10,end:140.22},returnSweeps=internalSweepReservations(compileInternalTransport({...v,transfers:[shifted]}));
 assert.ok(hs.some(a=>a.start>=horizontal.end&&returnSweeps.some(b=>sweepOverlap(a,b))));
 assert.throws(()=>compileInternalTransport({...joint,transfers:[horizontal,shifted]}),/swept footprint/);
});

// A1 report, complete swept intervals (not individual frame samples), 2026-11-04.
const externalParkingCases=[
 {carrierId:'jack-lap',id:'DBR-E3',start:134.7100475030585,end:134.73519200450983,min:[19.199999999,-1.5100000010000023],max:[20.400000001000002,1.9850000009999988]},
 {carrierId:'jack-rosq',id:'DBR-E18',start:140.54568364073222,end:140.5478722797005,min:[12.477380216838055,-1.11430112424129],max:[15.185587433032955,1.4450191676154813]},
 {carrierId:'jack-m1',id:'DBR-E75',start:149.35622072004404,end:149.36063943145217,min:[-11.800000001,15.399999999],max:[-8.299999999,16.600000001]},
 {carrierId:'jack-m2',id:'DBR-E75',start:149.39598912271717,end:149.4004078341253,min:[-2.8000000010000017,15.399999999],max:[0.7000000009999999,16.600000001]}
];
test('visible parking clears A1 E3, E18 and E75 corridors before and between internal missions',async()=>{
 const {INTERNAL_LAYOUT,INTERNAL_GEOMETRY:G}=await import('../internal-layout.js');
 const idle=sampleInternalTransport({missions:[],carriers:INTERNAL_LAYOUT.parking},134.72);
 assert.equal(idle.carriers.length,5);assert.ok(idle.carriers.every(c=>c.visible&&c.phase==='parked'));
 for(const e of externalParkingCases){const c=idle.carriers.find(c=>c.id===e.carrierId),d=c.direction,center=c.position.map((v,i)=>v-.25*d[i]),half=[G.width/2*Math.abs(d[1])+G.length/2*Math.abs(d[0]),G.width/2*Math.abs(d[0])+G.length/2*Math.abs(d[1])];
  const park={start:0,end:600,min:center.map((v,i)=>v-half[i]-.02),max:center.map((v,i)=>v+half[i]+.02)};
  assert.equal(sweepOverlap(park,e),false,`${c.id} / ${e.id}`);
 }
});

test('parking corridor audit retains all four old conflicts and checks every external interval',async()=>{
 const {auditInternalParkingCorridors}=await import('./internal-transport.browser.mjs');
 const legacy=[{id:'jack-lap',position:[19,-1.4],direction:[-1,0]},{id:'jack-rosq',position:[14,2.5],direction:[0,1]},{id:'jack-m1',position:[-7.8,15.2],direction:[1,0]},{id:'jack-m2',position:[1.1,15.2],direction:[1,0]}];
 const before=JSON.stringify({legacy,externalParkingCases});
 const old=await auditInternalParkingCorridors(externalParkingCases,legacy);
 for(const e of externalParkingCases)assert.ok(old.conflicts.some(c=>c.carrierId===e.carrierId&&c.externalId===e.id));
 const updated=await auditInternalParkingCorridors(externalParkingCases);
 assert.equal(updated.conflicts.length,0);assert.equal(updated.checkedCarriers,5);assert.equal(updated.checkedEnvelopes,4);
 assert.equal(updated.complete,false);assert.equal(JSON.stringify({legacy,externalParkingCases}),before);
});

test('anchored placement can slow loaded travel without stretching empty phases',()=>{
 const p=compileInternalTransport({...options,presentation:{mode:'demonstration',emptyCompressionFactor:2}}),m=p.missions[0];
 assert.equal(m.presentation.phaseFactors.before,2);assert.equal(m.presentation.phaseFactors.after,2);
 assert.equal(m.transfer.end,event.end);assert.equal(m.pickupStart,event.start);
 assert.ok(Math.abs(m.start-(event.start-m.request.before/2))<1e-9);
 assert.ok(Math.abs(m.end-(event.end+m.request.after/2))<1e-9);
});

test('operator waits at parked carrier before walking home and remains reserved',()=>{
 const common={...options,presentation:{mode:'demonstration'}},a=compileInternalTransport(common).missions[0];
 const plan=compileInternalTransport({...common,presentation:{mode:'demonstration',operatorReturnDelay:2}}),b=plan.missions[0];
 assert.ok(Math.abs(b.end-a.end-2)<1e-9);
 const wait=b.segments.find(s=>s.phase==='wait');assert.ok(wait);
 const x=sampleInternalTransport(plan,wait.start+.2),y=sampleInternalTransport(plan,wait.end-.2);
 assert.deepEqual(x.operators.get('m1:0').position,y.operators.get('m1:0').position);
 assert.equal(plan.operatorReservations[0].end,b.end);
});

test('operator can reach parked carrier early without moving the load early',()=>{
 const base=compileInternalTransport({...options,presentation:{mode:'demonstration'}}).missions[0];
 const plan=compileInternalTransport({...options,presentation:{mode:'demonstration',operatorApproachLead:1}}),m=plan.missions[0];
 assert.ok(Math.abs(m.start-base.start+1)<1e-9);assert.equal(m.pickupStart,base.pickupStart);assert.equal(m.end,base.end);
 const wait=m.segments.find(s=>s.phase==='wait');assert.ok(wait);
 assert.deepEqual(sampleInternalTransport(plan,(wait.start+wait.end)/2).carriers[0].position,options.carriers[0].position);
});

test('joint compilation preserves each transfer timing policy',()=>{
 const plan=compileInternalTransport({...options,presentation:{mode:'demonstration',byTransfer:{'move-1':{emptyCompressionFactor:2,operatorApproachLead:1,operatorReturnDelay:2}}}}),m=plan.missions[0];
 assert.equal(m.presentation.phaseFactors.after,2);assert.equal(m.segments.filter(s=>s.phase==='wait').length,2);
});

test('bounded retiming preserves paths, hours and full reservations',async()=>{
 const {retimeInternalMission}=await import('../internal-motion.js');
 const p=compileInternalTransport({...options,transfers:[{...event,originalWindow:{start:5,end:20}}]}),m=p.missions[0];
 const q=retimeInternalMission(p,event.id,.01),n=q.missions[0];
 assert.equal(n.transfer.startHours,m.transfer.startHours);assert.equal(n.transfer.endHours,m.transfer.endHours);
 assert.equal(n.request,m.request);assert.equal(n.carrier,m.carrier);
 assert.ok(Math.abs(n.start-m.start-.01)<1e-9);assert.ok(Math.abs(n.end-m.end-.01)<1e-9);
 assert.equal(q.operatorReservations[0].end,n.end);assert.equal(p.missions[0],m);
 assert.throws(()=>retimeInternalMission(p,event.id,100),/window/);
});

test('empty phase adjustment leaves loaded movement and geometry intact',async()=>{
 const {compressEmptyMission}=await import('../internal-motion.js');
 const p=compileInternalTransport(options),m=p.missions[0],q=compressEmptyMission(p,event.id,1.01),n=q.missions[0];
 assert.equal(n.transfer,m.transfer);assert.equal(n.request,m.request);
 assert.equal(n.pickupStart,m.pickupStart);assert.ok(n.start>m.start&&n.end<m.end);
 assert.deepEqual(n.segments.filter(s=>['pick','push','place'].includes(s.phase)),m.segments.filter(s=>['pick','push','place'].includes(s.phase)));
 assert.equal(q.operatorReservations[0].end,n.end);
});
