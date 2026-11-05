import {LOGISTICS_LAYOUT} from './logistics-layout.js';
import {INTERNAL_LAYOUT} from './internal-layout.js';
import {STAGING_BAYS,routeFor,sampleRoute,routeLength} from './transport-routes.js';
export {sampleRoute,routeLength};
export const DBR_LAYOUT={
 lap:[[9.5,1.34,-6.45],[12,1.34,-6.45]],
 rosq:[[3.2,1.12,.55],[5.2,1.12,.55],[7.2,1.12,.55]],
 m1:[[-3.78,1.34,7.75],[-1.78,1.34,7.75],[.22,1.34,7.75]],
 m2:[[4.22,1.34,7.75],[6.22,1.34,7.75],[8.22,1.34,7.75]],
 insp:[[11.7,1.27,7.75],[14.2,1.27,7.75]],
 torno:[[-13.5,1.5,-7]],us1:[[-5.5,1.4,-5.7]],us2:[[2,1.4,-7]]
};
export const DBR_BAYS={...STAGING_BAYS,
 stock:LOGISTICS_LAYOUT.stockPickupBays,raw:[[-18,-6.8]],torno:[[-13.5,-4.3]],us1:[[-9.2,-4.3]],us2:[[2,-4.7]],
 ...INTERNAL_LAYOUT.bays,
 dispatch:LOGISTICS_LAYOUT.dispatchBays,
 truck:[...[11.1,12.35,13.6,14.85,16.1].map(x=>[x,18.5]),...[11.1,12.35,13.6,14.85,16.1].map(x=>[x,19.85])]
};
export const DBR_PARKS=LOGISTICS_LAYOUT.fleet.map(v=>v.park);
function us2Access(end){
 const route=[[.2,-10.5],[.2,-6.4]],r=1.7;
 for(let i=1;i<=12;i++){const a=i*Math.PI/24;route.push([.2+r*(1-Math.cos(a)),-6.4+r*Math.sin(a)]);}
 return [...route,end];
}
export function dbrRoute(from,to,start,end,vehicleIndex=0){
 const lane=vehicleIndex===4&&([from,to].some(s=>s==='stock'||s==='lap'))?26.6:LOGISTICS_LAYOUT.eastLanes[[1,4].includes(vehicleIndex)?1:0];
 const parked=p=>DBR_PARKS.some(q=>q[0]===p[0]&&q[1]===p[1]);
 const aisle=(stage,p)=>['raw','torno','us1'].includes(stage)?-3:stage==='insp'?18.0:['m1','m2'].includes(stage)?11.1:stage==='dispatch'?18.0:stage==='stock'?(p[1]<-11?-13.2:-10.7):-2.8;
 if(parked(start)){
  if(to==='us2')return [start,[start[0],-10.3],[-.1,-10.3],[-.1,-10.5],...us2Access(end)];
  if(to==='components')return [start,[start[0],-10.3],[-19.8,-10.3],[-19.8,end[1]],end];
  if(['raw','torno','us1','us2'].includes(to))return [start,[start[0],-10.3],[-19.8,-10.3],[-19.8,-3],...(to==='us2'?[[4.3,-3],[4.3,-3.8],[end[0],-3.8]]:[[end[0],-3]]),end];
  if(to==='dispatch')return [start,[start[0],-10.3],[-.1,-10.3],[-.1,-10.7],[lane,-10.7],[lane,18.0],[end[0],18.0],end];
  return [start,[start[0],-10.3],[-.1,-10.3],[-.1,-10.7],[lane,-10.7],[lane,aisle(to,end)],[end[0],aisle(to,end)],end];
 }
 if(from==='us2'&&to==='stock'){
  const r=1.7,route=[...us2Access(start)].reverse();route.push([.2,-11.5]);
  for(let i=1;i<=12;i++){const a=i*Math.PI/24;route.push([.2+r*(1-Math.cos(a)),-11.5-r*Math.sin(a)]);}
  const turn=.8;route.push([end[0]-turn,-13.2]);
  for(let i=1;i<=12;i++){const a=i*Math.PI/24;route.push([end[0]-turn+turn*Math.sin(a),-13.2+turn*(1-Math.cos(a))]);}
  return [...route,end];
 }
 if(parked(end)){
  if(from==='us2')return [...us2Access(start)].reverse().concat([[-.1,-10.5],[-.1,-10.3],[end[0],-10.3],end]);
  if(from==='component-m2')return [start,[3.8,start[1]],[3.8,16.2],[-19.8,16.2],[-19.8,-10.3],[end[0],-10.3],end];
  if(['raw','torno','us1','us2'].includes(from))return [start,...(from==='us2'?[[start[0],-3.8],[4.3,-3.8],[4.3,-3]]:[[start[0],-3]]),[-19.8,-3],[-19.8,-10.3],[end[0],-10.3],end];
  const z=from==='truck'?LOGISTICS_LAYOUT.loadingAisle:from==='dispatch'?18.0:from==='lap'?-1.65:aisle(from,start);
  return [start,[start[0],z],[lane,z],[lane,-10.7],[-.1,-10.7],[-.1,-10.3],[end[0],-10.3],end];
 }
 if(from==='stock'&&to==='lap'&&vehicleIndex===0)return [start,[start[0],-.6],[end[0],-.6],end];
 if(from==='stock'&&to==='lap'&&start[1]>-8)return [start,[start[0],vehicleIndex===0?-2.8:-.2],[end[0],vehicleIndex===0?-2.8:-.2],end];
 if(from==='insp'&&to==='dispatch')return [start,[start[0],18.0],[end[0],18.0],end];
 if(to==='lap'&&end[1]!==-4.1&&vehicleIndex!==0&&end[0]>=10){const z=aisle(from,start);return [start,[start[0],z],[lane,z],[lane,-.2],[end[0],-.2],end];}
 if(to==='lap'&&end[1]===-4.1){const z=aisle(from,start),service=vehicleIndex===0?-2.8:1;return [start,[start[0],z],[lane,z],[lane,service],[end[0],service],end];}
 if(to==='dispatch')return [start,[start[0],aisle(from,start)],[lane,aisle(from,start)],[lane,11.0],[end[0],11.0],end];
 if(to==='components')return [start,[start[0],aisle(from,start)],[lane,aisle(from,start)],[lane,13],[-19.8,13],[-19.8,end[1]],end];
 if(from==='components'){
  const r=1.7,route=[start,[start[0],2],[-16.2,2]];
  for(let i=1;i<=12;i++){const a=i*Math.PI/24;route.push([-16.2-r*Math.sin(a),2+r*(1-Math.cos(a))]);}
  return [...route,[-17.9,end[1]],end];
 }
 if(from==='component-m1')return [start,end];
 if(to==='truck'){
  // Round the turn south of the staging row. A pivot at the trailer axis
  // swings the counterweight through a neighbouring pallet.
  const radius=1.7,sign=Math.sign(end[0]-start[0]),route=[start,[start[0],LOGISTICS_LAYOUT.loadingAisle]];
  if(Math.abs(end[0]-start[0])>=radius){
   route.push([end[0]-sign*radius,LOGISTICS_LAYOUT.loadingAisle]);
   for(let i=1;i<=12;i++){const angle=i*Math.PI/24;route.push([end[0]-sign*radius+sign*radius*Math.sin(angle),LOGISTICS_LAYOUT.loadingAisle+radius*(1-Math.cos(angle))]);}
  }else route.push([end[0],LOGISTICS_LAYOUT.loadingAisle+radius]);
  return [...route,end];
 }
 if(from==='truck')return [start,[start[0],16],[lane,16],[lane,11.0],[end[0],11.0],end];
 if(to==='us2')return [start,[start[0],-3],[-8.3,-3],[-8.3,-10.5],...us2Access(end)];
 const alias=s=>['raw','torno','us1','us2'].includes(s)?'lap':s;
 if(from==='buffer'&&to==='m1'&&start[1]<0)return [start,[start[0],-2.8],[1.5,-2.8],[1.5,3.9],[-7.8,3.9],[-7.8,11.1],[end[0],11.1],end];
 if(from==='buffer'&&to==='m1')return [start,[start[0],3.9],[-7.8,3.9],[-7.8,11.1],[end[0],11.1],end];
 if(from==='rosq'&&to==='buffer'&&end[1]<0)return [start,[start[0],3.9],[lane,3.9],[lane,-2.8],[end[0],-2.8],end];
 if(from==='rosq'&&to==='buffer')return [start,[start[0],3.9],[end[0],3.9],end];
 if(['m1','m2','insp'].includes(from)&&['m2','insp'].includes(to))return [start,[start[0],11.1],[end[0],11.1],end];
 return routeFor(alias(from),alias(to),{start,end}).map((p,i,points)=>[p[0]===19.8?lane:p[0],i>0&&i<points.length-1&&p[1]===-2.8&&['raw','torno','us1'].includes(from)?-3:p[1]]);
}

export const dbrWorkStand=(stage,index=0)=>{const f=DBR_LAYOUT[stage]?.[index]||DBR_LAYOUT[stage]?.[0];return f?[f[0],f[2]+(['m1','m2'].includes(stage)?.65:stage==='insp'?.55:stage==='us2'?1.2:['torno','us1'].includes(stage)?1.4:.8)]:[0,0];};

export const dbrStationAccessPoint=(stage,bay)=>[bay[0],bay[1]-(stage==='us2'?.95:1.25)];
export function dbrStationAccessRoute(stage,index,bay){
 const home=dbrWorkStand(stage,index),access=dbrStationAccessPoint(stage,bay);
 return stage==='us1'?[home,[-6.9,home[1]],access]:[home,access];
}
