// MPS playback, not an independent capacity or delivery feasibility simulation.
// Quantities are the final workbook plan. Visual operation windows are compressed
// to fit 8 x 70 seconds; nominal upstream replenishment uses separate calendar hours.
const PRODUCTS=['Z','Z1','Z2','Z3'];
const INPUT={Z:[202,202,212,252,202,151,176,176],Z1:[181,241,253,301,241,181,211,211],Z2:[176,111,194,231,185,162,162,111],Z3:[500,6800,5700,4500,6129,6871,5000,4600]};
const STAGES=['torno','us1','us2','lap','rosq','m1','m2','insp'];
const NAMES={torno:'Tornearia',us1:'Usinagem 1',us2:'Usinagem 2',lap:'Lapidação',rosq:'Rosqueadora',m1:'Montagem 1',m2:'Montagem 2',insp:'Inspeção',buffer:'Pulmão',stock:'Corpos usinados',dispatch:'Expedição'};
const TIMES={Z:[.01,.03,.03,.01,.02,.03,.03,.01],Z1:[.01,.03,.03,.01,.01,.03,.03,.01],Z2:[.01,.03,.03,.01,.01,.04,.03,.01],Z3:[.01,.03,.02,.02,.02,.05,.03,.01]};
const BOM={Z:[1,1,1,1,1,1,1,1],Z1:[1,1,1,2,1,2,0,0],Z2:[1,1,1,2,2,1,0,0],Z3:[1,1,1,2,2,3,2,2]};
const MACHINES={torno:2,us1:4,us2:3,lap:2,rosq:3,m1:3,m2:3,insp:2};
const SHIFTS={torno:2,us1:2,us2:3,lap:3,rosq:2,m1:3,m2:3,insp:2};
const clone=x=>JSON.parse(JSON.stringify(x));
const total=a=>a.reduce((n,v)=>n+v,0);
const EPS=1e-7;
// Relative choreography weights sampled from the physical layout's compiled
// pickup/carry/parking and operator paths. These are NOT industrial times.
// Longer routes receive more of the fixed presentation window.
const VISUAL_TRANSFER_WEIGHTS={'stock>lap':29.37,'lap>rosq':42.85,'rosq>buffer':51.07,'buffer>m1':50.09,'m1>m2':51.05,'m2>insp':42.72,'insp>dispatch':43.98,'dispatch>truck':28.73};
const VISUAL_LOAD_WEIGHTS={lap:6.96,rosq:8.49,m1:5.56,m2:5.08,insp:4.97};
export const MPS_PLAN=Object.freeze(Array.from({length:8},(_,i)=>Object.freeze({week:i+1,products:Object.freeze(Object.fromEntries(PRODUCTS.map(p=>[p,INPUT[p][i]]))),planned:total(PRODUCTS.map(p=>INPUT[p][i]))})));
export const MPS_PARAMETERS=Object.freeze({
 duration:600,intro:20,weekDuration:70,summary:20,total:44825,lotSize:500,playbackPolicy:'Semana 1: três lotes de contexto no dia 1 e acompanhamento detalhado de Z3 nos dias 2 a 5. Semanas 2 a 8: reprodução acelerada em coortes diárias.',
 source:'PCPIII-Case-GAMA-completo.xlsx · RCCP (TOC) Personalizado!B4:I7 (MPS final); B11:I14 (tempos nominais)',
 scope:'Reprodução do MPS final no trecho personalizado, com programação nominal de reposição dos corpos usinados.',
 disclaimer:'A animação reproduz o plano. Não é uma simulação independente que comprove capacidade ou atendimento ao prazo. Tempo de tela não é lead time industrial.',
 nominalTimes:TIMES,machines:MACHINES,shifts:SHIFTS,bom:BOM,
 buffer:{targetUnits:3571.3125,minUnits:2499.91875,drumRate:46.692708333333336,ropeIntervalHours:10.70831009481316,source:'DBR Personalizado!B24 (tambor), B34 (alvo), B37 (gatilho), B52 (intervalo da corda)',policy:'Os lotes reais aguardam no pulmão uma janela reservada da Montagem 1. A liberação respeita a sequência do tambor. A espera de tela torna essa proteção visível; não reproduz as horas industriais da planilha.',initialUnits:0},
 logistics:{unitsPerPallet:500,palletsPerTruck:10,minutesPerMission:12,weeklyHours:80,availability:.8,transfersPerPallet:8,zones:[{id:'forklift-1',name:'Corpos e preparação',transfersPerPallet:3},{id:'forklift-2',name:'Montagens',transfersPerPallet:3},{id:'forklift-3',name:'Inspeção e expedição',transfersPerPallet:2}],dispatchDelayBusinessDays:.25,source:'Expedição diária: premissa MCT Personalizado!B7. Capacidade de 10 pallets, 12 min/missão, 80 h/sem, disponibilidade de 80% e três zonas são premissas desta apresentação.'},
 upstreamPolicy:{initialStocks:{generic:2434,z3:7151},reorderPoints:{generic:434,z3:5151},replenishmentLot:2000,reorderBasis:'Posição de estoque: saldo físico + reposições abertas. O crédito físico ocorre somente após a Usinagem 2.',setupHours:{torno:4,us1:4,us2:1},source:'DBR Personalizado: supermercado de corpos e lote de reposição; RCCP: tempos e máquinas; aba Enunciado da planilha: setups.'},
 assumptions:['O cliente confirma a programação existente; a chamada não cria demanda adicional.','Uma peça desenhada representa um lote identificado, sem alterar sua quantidade.','Os corpos genéricos atendem Z, Z1 e Z2; Z3 usa corpo próprio.','Os níveis máximos dimensionados de 2.434 corpos genéricos e 7.151 corpos Z3 são adotados como estoques iniciais da reprodução; não são inventário observado.','Matéria-prima e abastecimento de componentes são assumidos disponíveis; necessidades de componentes são calculadas, sem reutilizar estoques fictícios.','Reposições upstream usam tempos nominais, máquinas paralelas, setups e turnos. Falhas, refugo e capacidade de fornecedores não são incorporados a essa agenda nominal.','A coleta na doca não equivale à entrega ao cliente. A frota rodoviária não pode ser determinada sem duração do ciclo de transporte.']
});
const unitTime=(product,station)=>TIMES[product][STAGES.indexOf(station)];
const absolute=(week,t)=>20+(week-1)*70+t;
const calendarAt=elapsed=>{
 if(elapsed<=20)return 0;if(elapsed>=580)return 7*168+120;
 const x=elapsed-20,w=Math.min(7,Math.floor(x/70));return w*168+(x-w*70)/70*120;
};
const displayAt=hours=>{
 const w=Math.floor(hours/168),within=hours-w*168;
 return 20+w*70+Math.min(120,within)/120*70;
};
function workEnd(start,duration,shiftHours){
 let t=start,left=duration,guard=0;
 while(left>EPS&&guard++<10000){
  const day=Math.floor((t+EPS)/24),h=t-day*24,dow=day%7;
  if(dow>=5){t=(day+(7-dow))*24;continue;}
  if(h>=shiftHours-EPS){t=(day+1)*24;continue;}
  const run=Math.min(left,shiftHours-h);t+=run;left-=run;
 }
 return t;
}
function workStart(start,shiftHours){
 let t=start;
 while(true){const day=Math.floor((t+EPS)/24),h=t-day*24,dow=day%7;if(dow>=5)t=(day+7-dow)*24;else if(h>=shiftHours-EPS)t=(day+1)*24;else return t;}
}
function createSchedule(releaseRules={}){
 const lots=[],trips=[],timeline=[];let serial=0;
 const addEvent=(lot,data)=>{const e={id:`MPS-E${++serial}`,lotId:lot.id,batchId:lot.id,orderId:`MPS-S${lot.week}-${lot.product}`,product:lot.product,quantity:lot.quantity,week:lot.week,...data};lot.timeline.push(e);timeline.push(e);return e;};
 const ops=lot=>{
  const list=[];
  const transfer=(from,to,zone)=>list.push({kind:'transfer',from,to,vehicleId:`forklift-${zone+1}`,zone,duration:VISUAL_TRANSFER_WEIGHTS[`${from}>${to}`]/15,sourceExtractionFraction:['lap','rosq','m1','m2','insp'].includes(from)?.35:0});
  const process=id=>{list.push({kind:'station-load',station:id,stage:id,from:id,to:id,duration:VISUAL_LOAD_WEIGHTS[id]/6});const nominalHours=lot.quantity*unitTime(lot.product,id)/MACHINES[id];list.push({kind:'process',station:id,stage:id,nominalHours,duration:Math.max(2,nominalHours*.9)});};
  transfer('stock','lap',0);process('lap');transfer('lap','rosq',0);process('rosq');transfer('rosq','buffer',0);transfer('buffer','m1',1);process('m1');transfer('m1','m2',1);process('m2');transfer('m2','insp',1);process('insp');transfer('insp','dispatch',2);return list;
 };
 for(const plan of MPS_PLAN){
  const weekLots=[];for(const p of PRODUCTS){let left=plan.products[p],part=0;while(left){const quantity=Math.min(500,left);weekLots.push({id:`S${plan.week}-${p}-L${++part}`,product:p,quantity,week:plan.week,body:p==='Z3'?'z3':'generic',timeline:[]});left-=quantity;}}
  // At most four pallets in a daily cohort, with no lot split across SKUs or
  // weeks. Daily dispatch bounds bay occupancy and respects the 0.25-day gap.
  const cohorts=Array.from({length:5},()=>[]);if(plan.week===1){cohorts[0]=weekLots.filter(l=>l.product!=='Z3');cohorts[1]=weekLots.filter(l=>l.product==='Z3');}else weekLots.forEach((lot,i)=>cohorts[i%5].push(lot));
  for(const lot of weekLots){const rule=releaseRules[lot.id];if(!rule)continue;const from=cohorts.findIndex(c=>c.includes(lot)),to=rule.day-1;if(from>=to)continue;const candidate=cohorts[to].find(other=>!releaseRules[other.id]&&other.body!==lot.body);if(!candidate)continue;cohorts[from][cohorts[from].indexOf(lot)]=candidate;cohorts[to][cohorts[to].indexOf(candidate)]=lot;lot.releaseAdjustment={fromDay:from+1,toDay:to+1,reason:rule.reason,supplyHours:rule.supplyHours};}

  for(let day=1;day<=5;day++){
   const cohort=cohorts[day-1];if(!cohort.length)continue;
   const tasks=cohort.map((lot,i)=>({lot,steps:ops(lot),index:0,ready:i*.8}));
   // Protection is a planned waiting window, followed by the actual M1 gate.
   // It carries no extra inventory: only the lot that just arrived is held.
   const bufferHold=plan.week===1&&day===2?9:8;
   const fork=[0,0,0],available={lap:0,rosq:0,m1:0,m2:0,insp:0},owner={};let corridor=0;const raw=[];
   // Choose the next ready operation across all lots. Processing occupies its
   // station while another lot may move or be processed elsewhere.
   while(tasks.some(t=>t.index<t.steps.length)){
    const choices=tasks.filter(t=>t.index<t.steps.length).map(task=>{
     const op=task.steps[task.index];let start=task.ready;
     if(op.kind==='transfer'){
      if(op.from==='buffer'){if(owner.m1&&owner.m1!==task.lot.id)return {task,op,start:Infinity};start=Math.max(start,available.m1);}
      const prefix=op.duration*op.sourceExtractionFraction;start=Math.max(start,fork[op.zone]-prefix,corridor-prefix);
     }
     else {if(owner[op.station]&&owner[op.station]!==task.lot.id)return {task,op,start:Infinity};start=Math.max(start,available[op.station]);}
     return {task,op,start};
    }).sort((a,b)=>a.start-b.start||a.task.lot.id.localeCompare(b.task.lot.id));
    const next=choices[0];if(!next||!Number.isFinite(next.start))throw new Error('Deadlock na programação visual diária.');
    const {task,op,start}=next,end=start+op.duration;raw.push({lot:task.lot,...op,start,end});
    if(op.kind==='transfer'){
     fork[op.zone]=end;corridor=end;
     if(op.from==='buffer'){owner.m1=task.lot.id;available.m1=end;}
     if(op.sourceExtractionFraction){available[op.from]=start+op.duration*op.sourceExtractionFraction;delete owner[op.from];}
    }else {owner[op.station]=task.lot.id;available[op.station]=end;}
    task.ready=end+(op.kind==='transfer'&&op.to==='buffer'?bufferHold:0);task.index++;
   }
   const spanDays=plan.week===1&&day===2?4:1,span=14*spanDays;const scale=(span-4.5)/Math.max(...raw.map(e=>e.end)),dayStart=absolute(plan.week,(day-1)*14),departAt=dayStart+span;
   for(const r of raw){const {lot,zone,duration,...data}=r;addEvent(lot,{...data,start:dayStart+r.start*scale,end:dayStart+r.end*scale,visualTimeScale:scale});}
   const tripId=`COLETA-S${plan.week}-D${day}`;
   const ordered=[...cohort].sort((a,b)=>a.timeline.at(-1).end-b.timeline.at(-1).end);
   // Four maximum load missions fit the final 3.5 seconds; no production
   // traffic occupies the corridor during that loading window.
   ordered.forEach((lot,i)=>{
    lot.bufferEnteredAt=lot.timeline.find(e=>e.kind==='transfer'&&e.to==='buffer').end;
    lot.bufferReleasedAt=lot.timeline.find(e=>e.kind==='transfer'&&e.from==='buffer').start;
    lot.bufferWaitSeconds=lot.bufferReleasedAt-lot.bufferEnteredAt;
    lot.bufferReason='Aguardando a janela reservada da Montagem 1; retirada em sequência para alimentar o tambor.';
    lot.releasedAt=lot.timeline[0].start;lot.completedAt=lot.timeline.find(e=>e.kind==='process'&&e.station==='insp').end;lot.dispatchReadyAt=lot.timeline.at(-1).end;
    lot.loadStart=dayStart+span-4+i*3.2/ordered.length;lot.loadEnd=lot.loadStart+3.2/ordered.length;lot.shippedAt=departAt;lot.tripId=tripId;lot.day=day;
    addEvent(lot,{kind:'transfer',from:'dispatch',to:'truck',station:'dispatch',vehicleId:'forklift-3',start:lot.loadStart,end:lot.loadEnd,sourceExtractionFraction:0});
   });
   trips.push({id:tripId,week:plan.week,day:day+spanDays-1,lotIds:ordered.map(l=>l.id),pallets:ordered.length,quantity:total(ordered.map(l=>l.quantity)),loadStart:ordered[0].loadStart,loadEnd:ordered.at(-1).loadEnd,departAt});
  }
  lots.push(...weekLots);
 }
 const drumLots=[...lots].sort((a,b)=>a.bufferReleasedAt-b.bufferReleasedAt);drumLots.forEach((lot,i)=>{lot.drumSequence=i+1;});
 timeline.sort((a,b)=>a.start-b.start||a.end-b.end);for(const lot of lots)lot.timeline.sort((a,b)=>a.start-b.start||a.end-b.end);trips.sort((a,b)=>a.departAt-b.departAt);return {lots,trips,timeline};
}
function createUpstream(lots){
 const policy=MPS_PARAMETERS.upstreamPolicy,stocks={...policy.initialStocks},resource={torno:0,us1:0,us2:0},onOrder={generic:0,z3:0};
 const queue=lots.map(l=>({kind:'consume',time:calendarAt(l.releasedAt),body:l.body,quantity:l.quantity,lotId:l.id}));
 const balances=[{time:0,stocks:{...stocks},kind:'initial'}],jobs=[],shortages=[];
 let id=0;
 const schedule=(body,time)=>{
  if(stocks[body]+onOrder[body]>policy.reorderPoints[body])return;
  const job={id:`REP-${body}-${++id}`,body,quantity:2000,triggerHours:time,triggerAt:displayAt(time),timeline:[]};let ready=time;
  for(const station of ['torno','us1','us2']){
   const duration=policy.setupHours[station]+2000*unitTime(body==='z3'?'Z3':'Z',station)/MACHINES[station];
   const start=workStart(Math.max(ready,resource[station]),SHIFTS[station]*8),end=workEnd(start,duration,SHIFTS[station]*8);
   job.timeline.push({id:`${job.id}-${station}`,lotId:job.id,kind:'replenishment-process',station,stage:station,body,quantity:2000,start:displayAt(start),end:displayAt(end),startHours:start,endHours:end,nominalHours:duration});
   resource[station]=end;ready=end;
  }
  job.completedHours=ready;job.completedAt=displayAt(ready);onOrder[body]+=job.quantity;jobs.push(job);queue.push({kind:'supply',time:ready,body,quantity:2000,jobId:job.id});
 };
 let guard=0;
 while(queue.length&&guard++<10000){
  queue.sort((a,b)=>a.time-b.time||(a.kind==='supply'?-1:1));const e=queue.shift();
  if(e.kind==='consume')stocks[e.body]-=e.quantity;else {stocks[e.body]+=e.quantity;onOrder[e.body]-=e.quantity;}
  if(stocks[e.body]<0&&e.kind==='consume')shortages.push({...e,shortage:-stocks[e.body],displayTime:displayAt(e.time)});
  balances.push({...e,stocks:{...stocks},onOrder:{...onOrder}});while(stocks[e.body]+onOrder[e.body]<=policy.reorderPoints[e.body])schedule(e.body,e.time);
 }
 return {jobs,balances,shortages};
}
function buildLogistics(lots,trips){
 const p=MPS_PARAMETERS.logistics,capacity=p.weeklyHours*p.availability;
 const weeks=MPS_PLAN.map(plan=>{
  const pallets=lots.filter(l=>l.week===plan.week).length;
  return {week:plan.week,pallets,missions:pallets*8,hours:pallets*8*p.minutesPerMission/60,truckTrips:trips.filter(t=>t.week===plan.week).length,zones:p.zones.map(z=>({id:z.id,missions:pallets*z.transfersPerPallet,hours:pallets*z.transfersPerPallet*p.minutesPerMission/60,required:Math.ceil(pallets*z.transfersPerPallet*p.minutesPerMission/60/capacity)}))};
 });
 const zones=p.zones.map(z=>{const w=weeks.map(w=>w.zones.find(a=>a.id===z.id));return {...z,missions:total(w.map(a=>a.missions)),hours:total(w.map(a=>a.hours)),peakWeeklyMissions:Math.max(...w.map(a=>a.missions)),peakWeeklyHours:Math.max(...w.map(a=>a.hours)),weeklyCapacityHours:capacity,required:Math.max(...w.map(a=>a.required))};});
 return {pallets:lots.length,totalPallets:lots.length,totalTrips:trips.length,totalMissions:lots.length*8,requiredForklifts:total(zones.map(z=>z.required)),sharedMinimumForklifts:Math.ceil(Math.max(...weeks.map(w=>w.hours))/capacity),zones,weeks,assumptions:{...p,effectiveWeeklyHours:capacity},truckFleetRequired:null,truckFleetExplanation:'São coletas na doca, não quantidade de caminhões da frota. Falta o tempo de ciclo rodoviário.'};
}
function lotState(lot,t){
 const common={...lot,batchId:lot.id,orderId:`MPS-S${lot.week}-${lot.product}`};
 if(t<lot.releasedAt-EPS)return {...common,stage:'planned',status:'Programado',progress:0};
 if(t>=lot.shippedAt-EPS)return {...common,stage:'shipped',status:'Expedido',progress:1};
 const current=lot.timeline.find(e=>e.start<=t+EPS&&e.end>t+EPS);
 if(current){const progress=Math.max(0,Math.min(1,(t-current.start)/(current.end-current.start)));return {...common,stage:current.kind==='transfer'?current.from:current.station,status:current.kind==='transfer'?'Em transporte':current.kind==='station-load'?'Carregando máquina':'Produzindo',phase:current.kind,progress,currentEventId:current.id,from:current.from,to:current.to};}
 const previous=lot.timeline.filter(e=>e.end<=t+EPS).at(-1);
 const stage=previous?.kind==='transfer'?previous.to:previous?.station||'stock';
 return {...common,stage,status:stage==='truck'?'Aguardando coleta':stage==='buffer'?'No pulmão':'Aguardando próxima operação',progress:1};
}
function planWithSupply(){
 const rules={};let schedule,upstream;
 for(let attempt=0;attempt<8;attempt++){
  schedule=createSchedule(rules);upstream=createUpstream(schedule.lots);let changed=false;
  for(const shortage of upstream.shortages){
   const lot=schedule.lots.find(l=>l.id===shortage.lotId),supply=upstream.jobs.filter(j=>j.body===shortage.body&&j.completedHours>=shortage.time-EPS).sort((a,b)=>a.completedHours-b.completedHours)[0];
   if(!supply)continue;const day=Math.floor((supply.completedHours-(lot.week-1)*168)/24)+2;
   if(day>5||day<1||(rules[lot.id]?.day||0)>=day)continue;
   rules[lot.id]={day,supplyHours:supply.completedHours,reason:'Liberação transferida para depois da conclusão nominal da reposição do corpo, preservando o MPS semanal.'};changed=true;
  }
  if(!changed)break;
 }
 return {schedule,upstream};
}
const SUPPLY_PLAN=planWithSupply();
const SCHEDULE=SUPPLY_PLAN.schedule;
const UPSTREAM=SUPPLY_PLAN.upstream;
const LOGISTICS=buildLogistics(SCHEDULE.lots,SCHEDULE.trips);
const BUFFER_EVENTS=SCHEDULE.lots.flatMap(l=>[
 {type:'buffer-in',time:l.bufferEnteredAt,lotId:l.id,product:l.product,quantity:l.quantity,text:`Pulmão: entrada de ${l.quantity} unidades ${l.product} (${l.id}); aguardando a Montagem 1.`},
 {type:'buffer-out',time:l.bufferReleasedAt,lotId:l.id,product:l.product,quantity:l.quantity,text:`Pulmão: retirada de ${l.quantity} unidades ${l.product} (${l.id}) para alimentar a Montagem 1.`}
]).sort((a,b)=>a.time-b.time||a.type.localeCompare(b.type));
const BUFFER_FOCUS=MPS_PLAN.map(plan=>{
 const group=SCHEDULE.lots.filter(l=>l.week===plan.week);
 if(plan.week===1){const l=group.find(l=>l.product==='Z3');return {week:1,start:l.bufferEnteredAt,end:l.bufferReleasedAt};}
 const moments=[...new Set(group.flatMap(l=>[l.bufferEnteredAt,l.bufferReleasedAt]))].sort((a,b)=>a-b);
 const candidates=moments.slice(0,-1).map((start,i)=>{const end=moments[i+1],count=group.filter(l=>l.bufferEnteredAt<=start+EPS&&l.bufferReleasedAt>start+EPS).length;return {week:plan.week,start,end,count};}).filter(x=>x.count>0);
 return candidates.sort((a,b)=>b.count-a.count||(b.end-b.start)-(a.end-a.start))[0];
});
const REQUIREMENTS=Array.from({length:8},(_,i)=>({component:`Componente ${i+1}`,required:total(PRODUCTS.map(p=>BOM[p][i]*total(INPUT[p])))}));
function deepFreeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;}
for(const value of [SCHEDULE,UPSTREAM,LOGISTICS,REQUIREMENTS,MPS_PARAMETERS,BUFFER_EVENTS,BUFFER_FOCUS])deepFreeze(value);
export class MpsPresentation {
 constructor(){this.reset();}
 reset(){this.elapsed=0;return this.snapshot();}
 seek(seconds){const time=Number(seconds);if(!Number.isFinite(time)||time<0||time>600)throw new Error('O instante deve estar entre 0 e 600 segundos.');this.elapsed=time;return this.snapshot();}
 advance(realSeconds){const dt=Number(realSeconds);if(!Number.isFinite(dt)||dt<0)throw new Error('O avanço deve ser um número finito e não negativo.');this.elapsed=Math.min(600,this.elapsed+dt);return this.snapshot();}
 snapshot(){
  const t=this.elapsed,phase=t<20?'intro':t<580?'production':'summary',week=Math.min(8,Math.max(1,Math.floor((t-20)/70)+1)),weekProgress=phase==='intro'?0:phase==='summary'?1:Math.max(0,Math.min(1,(t-absolute(week,0))/70));
  const lots=SCHEDULE.lots.map(l=>lotState(l,t)),finished=l=>l.completedAt<=t+EPS,sent=l=>l.shippedAt<=t+EPS;
  const productRows=scope=>PRODUCTS.map(product=>{const list=scope.filter(l=>l.product===product);return {product,planned:total(list.map(l=>l.quantity)),completed:total(list.filter(finished).map(l=>l.quantity)),shipped:total(list.filter(sent).map(l=>l.quantity))};});
  const weeks=MPS_PLAN.map(plan=>{const scope=lots.filter(l=>l.week===plan.week);return {...plan,products:productRows(scope),completed:total(scope.filter(finished).map(l=>l.quantity)),shipped:total(scope.filter(sent).map(l=>l.quantity))};});
  const calendar=calendarAt(t),balance=UPSTREAM.balances.filter(e=>e.time<=calendar+EPS).at(-1),replenishments=UPSTREAM.jobs.map(j=>{
   const current=j.timeline.find(e=>e.startHours<=calendar+EPS&&e.endHours>calendar+EPS);
   return {...j,stage:calendar<j.triggerHours?'planned':calendar>=j.completedHours?'stock':current?.station||'waiting',status:calendar<j.triggerHours?'Programado':calendar>=j.completedHours?'Concluído':current?'Produzindo':'Aguardando turno',progress:current?Math.max(0,Math.min(1,(calendar-current.startHours)/(current.endHours-current.startHours))):calendar>=j.completedHours?1:0};
  });
  const stations=STAGES.map(id=>{
   const active=SCHEDULE.timeline.find(e=>e.kind==='process'&&e.station===id&&e.start<=t+EPS&&e.end>t+EPS);
   const load=SCHEDULE.timeline.find(e=>e.kind==='station-load'&&e.station===id&&e.start<=t+EPS&&e.end>t+EPS);
   const upstream=replenishments.find(j=>j.stage===id),event=active||load;
   const elapsedHour=((calendar%24)+24)%24,inShift=Math.floor(calendar/24)%7<5&&elapsedHour<SHIFTS[id]*8;
   return {id,name:NAMES[id],status:event?(active?'Produzindo':'Carregando máquina'):upstream?(inShift?'Produzindo':'Fora do turno'):'Aguardando',activeLotId:event?.lotId||upstream?.id||null,activeBatchId:event?.lotId||upstream?.id||null,product:event?.product||upstream?.body||null,processingUnits:event?.quantity||upstream?.quantity||0,queueUnits:total(lots.filter(l=>l.stage===id&&!['process','station-load'].includes(l.phase)).map(l=>l.quantity)),progress:event?(t-event.start)/(event.end-event.start):upstream?.progress||0,machines:MACHINES[id],shifts:SHIFTS[id]};
  });
  const completed=total(lots.filter(finished).map(l=>l.quantity)),shipped=total(lots.filter(sent).map(l=>l.quantity)),released=total(lots.filter(l=>l.releasedAt<=t+EPS).map(l=>l.quantity));
  const trips=SCHEDULE.trips.map(trip=>({...trip,status:t>=trip.departAt-EPS?'Expedido':t>=trip.loadStart?'Carregando':'Programado'}));
  const dialogue=phase==='intro'?t<8?{speaker:'Cliente',kind:'phone',action:'Atender ligação',text:'Vamos confirmar as quantidades e os acabamentos da programação das próximas oito semanas?'}:t<15?{speaker:'PCP GAMA',kind:'typing',action:'Conferir MPS final',text:'São 44.825 unidades da família Z. Vou conferir o plano final e os lotes de cada semana.'}:{speaker:'PCP GAMA',kind:'planning',action:'Iniciar programação',text:'Os corpos usinados abastecem a lapidação. Acompanhe os lotes, as montagens, a inspeção e as coletas.'}:phase==='summary'?{speaker:'PCP GAMA',kind:'summary',action:'Revisar execução do plano',text:`Reprodução concluída: ${shipped.toLocaleString('pt-BR')} unidades expedidas em ${SCHEDULE.trips.length} coletas. A viabilidade do plano exige validação própria.`}:null;
  const bufferLots=lots.filter(l=>l.bufferEnteredAt<=t+EPS&&l.bufferReleasedAt>t+EPS).map(l=>({id:l.id,product:l.product,quantity:l.quantity,enteredAt:l.bufferEnteredAt,releaseAt:l.bufferReleasedAt,waitSeconds:l.bufferWaitSeconds,elapsedWait:Math.max(0,t-l.bufferEnteredAt),reason:l.bufferReason,drumSequence:l.drumSequence})).sort((a,b)=>a.releaseAt-b.releaseAt);
  const bufferUnits=total(bufferLots.map(l=>l.quantity)),bufferParams=MPS_PARAMETERS.buffer;
  const buffer={units:bufferUnits,lotCount:bufferLots.length,target:bufferParams.targetUnits,targetUnits:bufferParams.targetUnits,min:bufferParams.minUnits,minUnits:bufferParams.minUnits,drumRate:bufferParams.drumRate,coverageHours:bufferUnits/bufferParams.drumRate,lots:bufferLots,nextReleaseAt:bufferLots[0]?.releaseAt??null,nextLotId:bufferLots[0]?.id??null,status:bufferLots.length?'Aguardando a Montagem 1':'Vazio',referenceOnly:true,explanation:'Estoque real dos lotes desta reprodução. Alvo e gatilho são referências da planilha; não foram adicionados como estoque inicial.',source:bufferParams.source,events:BUFFER_EVENTS.filter(e=>e.time<=t+EPS).slice(-6)};
  const bufferFocus=BUFFER_FOCUS.find(w=>w&&t>=w.start&&t<w.end);
  const events=[...BUFFER_EVENTS.filter(e=>e.time<=t+EPS),{time:0,text:'Conferência do MPS final: nenhum pedido adicional foi incluído.'},...SCHEDULE.trips.filter(trip=>trip.departAt<=t+EPS).map(trip=>({time:trip.departAt,text:`Semana ${trip.week}, dia ${trip.day}: coleta de ${trip.quantity} unidades em ${trip.pallets} pallets.`})),...UPSTREAM.shortages.filter(s=>s.time<=calendar).map(s=>({time:s.displayTime,text:`Alerta de abastecimento: saldo nominal ${s.body==='z3'?'Z3':'genérico'} insuficiente em ${s.shortage} unidades.`}))].filter(e=>e.time<=t).sort((a,b)=>b.time-a.time).slice(0,20);
  const active=SCHEDULE.timeline.find(e=>e.start<=t&&e.end>t);
  return {mode:'mps',elapsed:t,duration:600,phase,week,weekProgress,detailMode:phase==='production'&&t>=34&&t<90,completed,shipped,wip:released-completed,finishedGoods:completed-shipped,planned:44825,released,buffer,bufferFocus:!!bufferFocus,products:productRows(lots),weeks,stations,lots,trips,trucks:trips,timeline:SCHEDULE.timeline,replenishments,upstream:{calendarHours:calendar,bodyStock:{...balance.stocks},policy:MPS_PARAMETERS.upstreamPolicy,shortages:UPSTREAM.shortages.filter(s=>s.time<=calendar),plannedRequirements:{generic:total(lots.filter(l=>l.body==='generic').map(l=>l.quantity)),z3:total(lots.filter(l=>l.body==='z3').map(l=>l.quantity))}},componentRequirements:REQUIREMENTS,releaseAdjustments:SCHEDULE.lots.filter(l=>l.releaseAdjustment).map(l=>({lotId:l.id,product:l.product,week:l.week,quantity:l.quantity,...l.releaseAdjustment})),logistics:{...LOGISTICS,truckTrips:trips.filter(trip=>trip.status==='Expedido').length,shippedPallets:lots.filter(sent).length},events,cameraHint:phase==='intro'?'office':phase==='summary'?(t>=590?'office':'dispatch'):bufferFocus?'buffer':week>=2?'overview':active?.station||active?.to||'overview',dialogue,source:MPS_PARAMETERS.source,disclaimer:MPS_PARAMETERS.disclaimer};
 }
}
