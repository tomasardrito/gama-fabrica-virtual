import {MPS_PARAMETERS,MPS_PLAN} from './mps-simulation.js';

// Business-clock hours: five 24-hour days per week. Off-shift hours remain in
// this clock; weekends are added only by the calendar formatter.
const EPS=1e-8,STAGES=['torno','us1','us2'];
const copy=value=>JSON.parse(JSON.stringify(value));
const bodyOf=lot=>lot.body||(lot.product==='Z3'?'z3':'generic');
export const dbrWorkToCalendar=hours=>Math.floor(hours/120)*168+(hours%120+120)%120;
export const dbrWorkToScreen=hours=>20+hours*70/120;
export function upstreamWorkStart(time,dailyHours){
 const day=Math.floor((time+EPS)/24),hour=time-day*24;
 return hour>=dailyHours-EPS?(day+1)*24:time;
}
export function upstreamWorkEnd(start,duration,dailyHours){
 let time=upstreamWorkStart(start,dailyHours),remaining=duration;
 while(remaining>EPS){
  const day=Math.floor((time+EPS)/24),hour=time-day*24;
  const used=Math.min(remaining,Math.max(0,dailyHours-hour));
  time+=used;remaining-=used;
  if(remaining>EPS)time=(day+1)*24;
 }
 return time;
}

export class DbrBodySupply {
 constructor({moveJob=null,screenAt=null}={}){
  this.moveJob=moveJob;this.toScreen=screenAt||dbrWorkToScreen;
  this.policy=copy(MPS_PARAMETERS.upstreamPolicy);
  this.jobs=[];this.consumptions=[];this.waits=[];
  this.resources={torno:0,us1:0,us2:0};this.lastMutationHours=-Infinity;
 }
 stockAt(hours){
  const stocks={...this.policy.initialStocks};
  for(const job of this.jobs)if(job.completedHours<=hours+EPS)stocks[job.body]+=job.quantity;
  for(const use of this.consumptions)if(use.time<=hours+EPS)stocks[use.body]-=use.quantity;
  return stocks;
 }
 earliestAvailability(body,quantity,hours){
  let stock=this.stockAt(hours)[body];if(stock+EPS>=quantity)return hours;
  for(const job of this.jobs.filter(j=>j.body===body&&j.completedHours>hours+EPS).sort((a,b)=>a.completedHours-b.completedHours)){
   stock+=job.quantity;if(stock+EPS>=quantity)return job.completedHours;
  }
  return Infinity;
 }
 schedule(body,hours){
  const quantity=this.policy.replenishmentLot;
  const job={id:`DBR-REP-${this.jobs.length+1}`,body,quantity,triggerHours:hours,triggerAt:this.toScreen(hours),timeline:[]};
  let ready=hours;
  let from="raw";
  for(const [index,station] of STAGES.entries()){
   const dailyHours=MPS_PARAMETERS.shifts[station]*8;
   const processingHours=quantity*MPS_PARAMETERS.nominalTimes[body==='z3'?'Z3':'Z'][index]/MPS_PARAMETERS.machines[station];
   const setupHours=this.policy.setupHours[station],nominalHours=setupHours+processingHours;
   const transfer=this.moveJob?.(job,from,station,Math.max(ready,this.resources[station]));
   if(transfer)ready=transfer.endHours;
   const startHours=upstreamWorkStart(Math.max(ready,this.resources[station]),dailyHours);
   const endHours=upstreamWorkEnd(startHours,nominalHours,dailyHours);
   job.timeline.push({id:`${job.id}-${station}`,lotId:job.id,kind:'replenishment-process',station,stage:station,body,quantity,
    startHours,endHours,start:this.toScreen(startHours),end:this.toScreen(endHours),nominalHours,processingHours,setupHours,dailyHours});
   ready=endHours;this.resources[station]=endHours;from=station;
  }
  const finalTransfer=this.moveJob?.(job,"us2","stock",ready);
  if(finalTransfer)ready=finalTransfer.endHours;
  job.completedHours=ready;job.completedAt=this.toScreen(ready);this.jobs.push(job);return job;
 }
 tryRelease(lot,hours){
  if(!Number.isFinite(hours)||hours<0)throw new Error('Hora útil de liberação inválida.');
  if(hours<this.lastMutationHours-EPS)throw new Error('Liberações devem ser avaliadas em ordem cronológica.');
  const quantity=Number(lot.quantity),body=bodyOf(lot);
  if(!Number.isFinite(quantity)||quantity<=0||!(body in this.policy.initialStocks))throw new Error('Lote de corpos inválido.');
  if(lot.initial)return {accepted:true,availableAt:hours,stock:this.stockAt(hours)[body],initial:true};
  const existing=this.consumptions.find(e=>e.lotId===lot.id);
  if(existing)return {accepted:true,availableAt:existing.time,stock:this.stockAt(hours)[body],alreadyConsumed:true};
  const availableAt=this.earliestAvailability(body,quantity,hours);
  if(availableAt>hours+EPS){
   if(!this.waits.some(w=>w.lotId===lot.id&&Math.abs(w.time-hours)<EPS))this.waits.push({lotId:lot.id,body,quantity,time:hours,availableAt,shortage:quantity-this.stockAt(hours)[body]});
   return {accepted:false,availableAt,stock:this.stockAt(hours)[body]};
  }
  this.lastMutationHours=hours;
  this.consumptions.push({kind:'consume',lotId:lot.id,product:lot.product,body,quantity,time:hours});
  const stocks=this.stockAt(hours);
  let position=stocks[body]+this.jobs.filter(j=>j.body===body&&j.completedHours>hours+EPS).reduce((n,j)=>n+j.quantity,0);
  while(position<=this.policy.reorderPoints[body]+EPS){this.schedule(body,hours);position+=this.policy.replenishmentLot;}
  return {accepted:true,availableAt:hours,stock:stocks[body],position};
 }
 snapshotAt(hours){
  const bodyStock=this.stockAt(hours),jobs=this.jobs.filter(j=>j.triggerHours<=hours+EPS);
  const open=jobs.filter(j=>j.completedHours>hours+EPS),consumptions=this.consumptions.filter(e=>e.time<=hours+EPS);
  const onOrder={generic:0,z3:0};for(const j of open)onOrder[j.body]+=j.quantity;
  const currentProcesses=jobs.flatMap(j=>j.timeline).filter(e=>e.kind==='replenishment-process'&&e.startHours<=hours+EPS&&e.endHours>hours+EPS&&(hours%24)<e.dailyHours-EPS);
  const bomNeeded=Array(8).fill(0),bomReleased=Array(8).fill(0);
  for(const week of MPS_PLAN)for(const [product,quantity] of Object.entries(week.products))MPS_PARAMETERS.bom[product].forEach((n,i)=>bomNeeded[i]+=quantity*n);
  for(const use of consumptions)MPS_PARAMETERS.bom[use.product]?.forEach((n,i)=>bomReleased[i]+=use.quantity*n);
  return {workHours:hours,calendarHours:dbrWorkToCalendar(hours),bodyStock,onOrder,policy:copy(this.policy),jobs,openJobs:open,currentProcesses,
   replenishments:jobs.length,completedReplenishments:jobs.length-open.length,
   consumed:{generic:consumptions.filter(e=>e.body==='generic').reduce((n,e)=>n+e.quantity,0),z3:consumptions.filter(e=>e.body==='z3').reduce((n,e)=>n+e.quantity,0)},
   balances:[{time:0,kind:'initial',stocks:{...this.policy.initialStocks}},...consumptions.map(e=>({...e,stocks:this.stockAt(e.time)}))],
   shortages:[],waitingForBodies:this.waits.filter(w=>w.time<=hours+EPS&&!consumptions.some(c=>c.lotId===w.lotId)),
   bomNeeded,bomReleased,source:'DBR Personalizado!J59:L60; RCCP (TOC) Personalizado!B11:I14; setups do Enunciado'};
 }
}

export function buildDbrUpstream(lots){
 const model=new DbrBodySupply();
 for(const lot of [...lots].filter(l=>Number.isFinite(l.releasedHours)).sort((a,b)=>a.releasedHours-b.releasedHours))model.tryRelease(lot,lot.releasedHours);
 return model;
}
