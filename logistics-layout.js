// Presentation geometry, in metres. This does not change industrial capacity.
export const LOGISTICS_LAYOUT=Object.freeze({
 parkDirection:[1,0],
 fleet:[
  {id:'forklift-1',mission:'bodies',color:0xe2ae42,park:[-18.5,-13.3]},
  {id:'forklift-2',mission:'shipping',color:0x54a5d2,park:[-13.9,-12.1]},
  {id:'forklift-3',mission:'replenishment',color:0xb28bd5,park:[-10.3,-12.1]},
  {id:'forklift-4',mission:'components',color:0x67bd90,park:[-6.7,-12.1]},
  {id:'forklift-5',mission:'reserve',color:0xe37565,park:[-3.1,-12.1]}
 ],
 stockPickupBays:[[13.8,-8],[24,-8],[15.4,-8],[18.6,-8]],
 loadingAisle:22.6,
 dispatchBays:Array.from({length:10},(_,i)=>[-7.4+i*2.8,20.5]),
 eastLanes:[19.8,21.4],
 docks:[{id:'Doca 01',position:[7,30.2],yaw:Math.PI/2},{id:'Doca 02',position:[16,30.2],yaw:Math.PI/2}],
 road:{min:[-50,35],max:[70,70]},
 platform:{min:[-10.5,23.4],max:[29,25.9],height:.84,rampStart:21.9,rampEnd:23.4,deckEnd:33},
 truckBounds:{min:[-4.5,-1.4],max:[4.3,1.4]},
 forkliftBounds:{min:[-.6,-.7],max:[.6,1.8]},
 siteObstacles:[
  ...[[-15.4,-8.8],[-7.15,-8.8],[7.25,-8.8],[8,-8.65]].map(([x,z])=>({id:`aux-cabinet:${x}`,min:[x-.35,z-.4],max:[x+.35,z+.4]})),
  ...[[10,-9.7],[16,-9.7]].map(([x,z])=>({id:`bollard:${x}`,min:[x-.2,z-.2],max:[x+.2,z+.2]})),
  ...[[17.2,-8],[-15.5,-.4]].map(([x,z])=>({id:`stock-rack:${x}`,min:[x-1.675,z-.65],max:[x+1.675,z+.65]})),
  {id:'rear-wall',min:[-22,-15.625],max:[22,-15.375]},
  {id:'west-wall',min:[-22.125,-15.5],max:[-21.875,14]},
  ...[-21,0,21].map(x=>({id:`rear-column:${x}`,min:[x-.21,-15.01],max:[x+.21,-14.59]})),
  ...[-16,-8,0,8,16].map(x=>({id:`rear-service:${x}`,min:[x-.75,-14.75],max:[x+.75,-14.1]})),
  ...[7,16].flatMap(x=>[-1,1].map(side=>({id:`dock-post:${x}:${side}`,min:[x+side*1.7-.125,25.15],max:[x+side*1.7+.125,25.45]})))
 ],
 waiting:[30,40],
});
export function localToWorld(point,position,yaw){const c=Math.cos(yaw),s=Math.sin(yaw);return [position[0]+point[0]*c+point[1]*s,position[1]-point[0]*s+point[1]*c];}
export function truckSlot(dockIndex,slot){return localToWorld([-1.05+(slot%5)*1.15,slot<5?-.625:.625],LOGISTICS_LAYOUT.docks[dockIndex].position,Math.PI/2);}
export function boxCorners(position,yaw,bounds){return [[bounds.min[0],bounds.min[1]],[bounds.max[0],bounds.min[1]],[bounds.max[0],bounds.max[1]],[bounds.min[0],bounds.max[1]]].map(p=>localToWorld(p,position,yaw));}
export function boxesOverlap(a,b){
 for(const polygon of [a,b])for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],length=Math.hypot(q[1]-p[1],p[0]-q[0]);
  if(length===0)continue;
  // Epsilon is a distance in metres, independent of hull edge length.
  // Swept hulls may contain nanometre bevels after floating-point rounding.
  const axisX=(q[1]-p[1])/length,axisZ=(p[0]-q[0])/length;
  let aMin=Infinity,aMax=-Infinity,bMin=Infinity,bMax=-Infinity;
  for(const v of a){const x=v[0]*axisX+v[1]*axisZ;if(x<aMin)aMin=x;if(x>aMax)aMax=x;}
  for(const v of b){const x=v[0]*axisX+v[1]*axisZ;if(x<bMin)bMin=x;if(x>bMax)bMax=x;}
  if(aMax<=bMin+1e-7||bMax<=aMin+1e-7)return false;
 }return true;
}

export function convexHull(points){
 const sorted=points.map(p=>[...p]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=points=>{const hull=[];for(const p of points){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}return hull;};
 const lower=half(sorted),upper=half([...sorted].reverse());return [...lower.slice(0,-1),...upper.slice(0,-1)];
}

export function logisticsSiteObstacles(){return [...LOGISTICS_LAYOUT.siteObstacles,...LOGISTICS_LAYOUT.fleet.map(v=>({id:`charger:${v.id}`,min:[v.park[0]-2.6,v.park[1]-.14],max:[v.park[0]-2,v.park[1]+.14]}))];}
