// Presentation assumptions, not additional industrial capacity from the workbook.
export const INTERNAL_LINKS=['lap>rosq','rosq>buffer','buffer>m1','m1>m2','m2>insp'];
export const INTERNAL_GEOMETRY=Object.freeze({width:.7,length:1.65,operatorOffset:1.5,palletHalf:.56,operatorRadius:.3,floorHeight:.05,lift:.09});
const bays={lap:[9.8,11.6,13.4,15.2,17].map(x=>[x,-4.1]),rosq:[2.8,4.4,6,7.6,9.2].map(x=>[x,2.3]),buffer:[...[-6.5,-5.1,-3.7,-2.3,-.9].map(x=>[x,2.3]),...[-6.5,-5.1,-3.7,-2.3,-.9].map(x=>[x,-2]),[.55,-3.4]],m1:[-5.8,-4.2,-2.6,-1,.6].map(x=>[x,9.3]),m2:[2.55,4.4,6,7.6,9.2].map(x=>[x,10]),insp:[10.8,12.4,14,15.6,17.2].map(x=>[x,9.3])};
const centers={torno:[[-13.5,-7],[-10.5,-7]],us1:[[-5.5,-8.1],[-2.8,-8.1],[-5.5,-5.7],[-2.8,-5.7]],lap:[[9.5,-7],[12,-7]],rosq:[[3,0],[5,0],[7,0]],m1:[[-4,7],[-2,7],[0,7]],m2:[[4,7],[6,7],[8,7]],insp:[[11.7,7],[14.2,7]]};
export const INTERNAL_LAYOUT={bays,ports:Object.fromEntries(Object.entries(bays).flatMap(([station,points])=>points.map((position,i)=>[`${station}:${i}`,{station,role:'staging',position,height:.05}]))),obstacles:Object.entries(centers).flatMap(([station,points])=>points.map(([x,z],i)=>({id:`${station}:${i}`,min:[x-.95,z-.8],max:[x+.95,z+1]}))),parking:[{id:'jack-m1',position:[-5.8,8.1],direction:[0,1]}]};
// A1 can supply revised routes; these are unobstructed aisle centerlines, not rails.
export function internalRoute(from,to,start,end){
 if(!INTERNAL_LINKS.includes(`${from}>${to}`))throw new Error(`Unknown internal link: ${from}>${to}`);
 if(from==='lap'&&end[0]===9.2)return [start,[start[0],-.8],[9.2,-.8],end];
 if(from==='lap')return [start,[start[0],-1.5],[9.2,-1.5],[9.2,3.9],[end[0],3.9],end];
 if(from==='rosq'&&end[1]>0)return [start,[start[0],3.9],[end[0],3.9],end];
 if(from==='rosq')return [start,[start[0],3.9],[1.4,3.9],[1.4,.5],[end[0],.5],end];
 if(from==='buffer'&&start[1]>0)return [start,[start[0],4.2],[-8.6,4.2],[-8.6,11.8],[end[0],11.8],end];
 if(from==='buffer')return [start,[start[0],.5],[-8.1,.5],[-8.1,11.1],[end[0],11.1],end];
 return [start,[start[0],11.8],[end[0],11.8],end];
}

// Four EXISTING identities, shared between five pilot cycles. These are pilot
// assignments, not an automatic staffing/fleet decision for all 535 moves.
export const INTERNAL_PILOTS=[
 {link:'lap>rosq',source:4,destination:4,operator:{id:'lap:1',position:[12,-5.65],approachRoute:[[12,-5.65],[13.6,-5.65],[13.6,-6.5]]}},
 {link:'rosq>buffer',source:4,destination:4,operator:{id:'rosq:2',position:[7.2,1.35],approachRoute:[[7.2,1.35],[9.2,1.35],[9.2,-.4]]}},
 {link:'buffer>m1',source:4,destination:0,operator:{id:'buffer:0',position:[1.7,0],approachRoute:[[1.7,0],[-.1,-.4]]}},
 {link:'m1>m2',source:0,destination:0,operator:{id:'m1:1',position:[-1.78,8.4],approachRoute:[[-1.78,8.4],[-5.8,8.4],[-5.8,6.6]]}},
 {link:'m2>insp',source:0,destination:0,operator:{id:'m1:1',position:[-1.78,8.4],approachRoute:[[-1.78,8.4],[2.55,8.4],[2.55,7.3]]}}
];
export function internalPilotInput(raw,pilot){
 const [from,to]=pilot.link.split('>'),fromPosition=bays[from][pilot.source],toPosition=bays[to][pilot.destination];
 const carrier={id:`jack-${from}`,position:[fromPosition[0],fromPosition[1]-1.2],direction:[0,1],links:[pilot.link]};
 const operator={...pilot.operator,approachRoute:[...pilot.operator.approachRoute.slice(0,-1),[carrier.position[0],carrier.position[1]-INTERNAL_GEOMETRY.operatorOffset]]};
 return {transfer:{...raw,fromPosition:[...fromPosition],toPosition:[...toPosition]},carrier,operator};
}
for(const [id,x,z,w,d] of [['cabinet-m1',1.7,7,.7,.8],['cabinet-m2',9.7,7,.7,.8],['cabinet-rosq',1.9,-1.3,.7,.8],['office',-13,7,7,5.8],['components',-11.5,-.4,3.35,1.3],['stock',17.2,-6.4,3.35,1.3],['us2',4,-7,6,1.6]])INTERNAL_LAYOUT.obstacles.push({id,min:[x-w/2,z-d/2],max:[x+w/2,z+d/2]});
INTERNAL_LAYOUT.parking=INTERNAL_PILOTS.map(p=>{const x=internalPilotInput({},p).carrier;return {id:x.id,position:x.position,direction:x.direction};});
export function internalBayObstacles(transfer){
 const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8;
 return Object.entries(bays).flatMap(([stage,points])=>points.filter(p=>!same(p,transfer.fromPosition)&&!same(p,transfer.toPosition)).map(p=>({id:`occupied:${stage}:${p}`,min:p.map(v=>v-.56),max:p.map(v=>v+.56)})));
}

// Reach the source from its open aisle; never approach through the machine.
export function internalApproachRoute(stage,park,source){
 let route;
 if(stage==='buffer')route=[park,[-8.8,3.6],[.55,3.6],...(source[1]>0?[[.55,4.3],[source[0],4.3]]:[[.55,-.3],[source[0],-.3]]),source];
 else if(stage==='m2')route=[park,[19.8,park[1]],[19.8,11.8],[source[0],11.8],source];
 else{const aisle=stage==='lap'?-1.4:stage==='rosq'?4.3:11.8;route=[park,[park[0],aisle],[source[0],aisle],source];}
 return route.filter((p,i,ps)=>!i||Math.hypot(p[0]-ps[i-1][0],p[1]-ps[i-1][1])>1e-8);
}
// Service pockets clear A1 external corridors even while all carts are parked.
// Access/return still use shared aisles and must be reserved in the joint agenda.
export const INTERNAL_ACCESS={
 lap:{position:[17,3.8],direction:[-1,0],walk:[[12,-5.65],[12,-5.4],[19,-5.4],[19,3.8],[18.5,3.8]],supportWalks:{'buffer:0':[[1.7,0],[1.7,3.3],[10.8,3.3],[10.8,4.3],[18.5,4.3],[18.5,3.8]]}},
 rosq:{position:[14,3.2],direction:[0,1],walk:[[7.2,1.35],[14,1.35],[14,1.7]]},
 buffer:{position:[-8.8,1.5],direction:[0,1],walk:[[1.7,0],[1.4,.5],[1.4,3.7],[-8,3.7],[-8,0],[-8.8,0]]},
 m1:{position:[-7.2,7.5],direction:[0,1],walk:[[-1.78,8.4],[-5.6,8.4],[-5.6,6],[-7.2,6]]},
 m2:{position:[15.5,5.45],direction:[1,0],walk:[[-1.78,8.4],[-5.6,8.4],[-5.6,5.85],[14,5.85],[14,5.45]]}
};

// R2 bay accesses keep the handle in the aisle. Reverse legs avoid turning
// the operator into a machine or an occupied bay.
export function internalAccessRoute(from,to,start,end){
 if(from==='lap')return [start,[start[0],-1.4],[10.8,-1.4],[10.8,4.3],[end[0],4.3],end];
 if(from==='rosq')return end[1]>0?[start,[start[0],4.3],[end[0],4.3],end]:[start,[start[0],4.3],[.55,4.3],[.55,-.3],[end[0],-.3],end];
 if(from==='buffer')return [...(start[1]>0?[start,[start[0],4.3]]:[start,[start[0],-.3],[.55,-.3],[.55,4.3]]),[-8.6,4.3],[-8.6,11.8],[end[0],11.8],end];
 return internalRoute(from,to,start,end);
}
INTERNAL_LAYOUT.parking=Object.entries(INTERNAL_ACCESS).map(([stage,a])=>({id:`jack-${stage}`,position:[...a.position],direction:[...a.direction]}));
