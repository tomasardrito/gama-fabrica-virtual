import {DBR_BAYS} from './dbr-layout.js';

export const CONVEYOR_HEIGHT=.62;
export const CONVEYOR_WIDTH=1.24;
export const CONVEYOR_LINKS=['lap>rosq','rosq>buffer','buffer>m1','m1>m2','m2>insp'];
export const isConveyorLink=(from,to)=>CONVEYOR_LINKS.includes(`${from}>${to}`);
export const hasConveyorPort=stage=>['lap','rosq','buffer','m1','m2','insp'].includes(stage);
const clean=points=>points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-8).map(p=>[...p]);
export function conveyorRoute(from,to,start,end){
 if(from==='lap')return clean([start,[start[0],-3.0],[13.2,-3.0],[13.2,3.9],[end[0],3.9],end]);
 if(from==='rosq')return clean([start,[start[0],3.9],[1.4,3.9],[1.4,.5],[end[0],.5],end]);
 if(from==='buffer')return clean([start,[start[0],.5],[-8.1,.5],[-8.1,11.1],[end[0],11.1],end]);
 return clean([start,[start[0],11.1],[end[0],11.1],end]);
}
// A common powered roller bed with lateral transfer tables. Each numbered
// accumulation position holds one pallet; EDD can select any unobstructed cell.
export const CONVEYOR_SECTIONS=[
 [[6.8,-3.0],[13.2,-3.0]],[[13.2,-3.0],[13.2,3.9]],
 ...DBR_BAYS.lap.map(([x,z])=>[[x,z],[x,-3.0]]),
 [[1.4,3.9],[13.2,3.9]],[[1.4,3.9],[1.4,.5]],
 ...DBR_BAYS.rosq.map(([x,z])=>[[x,z],[x,3.9]]),
 [[-8.1,.5],[1.4,.5]],
 ...[-6.5,-4.9,-3.3,-1.7,-.1].map(x=>[[x,-1.3],[x,2.3]]),
 [[-8.1,-1.3],[-8.1,.5]],[[-8.1,.5],[-8.1,11.1]],
 [[-8.1,11.1],[17.2,11.1]],
 ...['m1','m2','insp'].flatMap(stage=>DBR_BAYS[stage].map(([x,z])=>[[x,z],[x,11.1]]))
];
export const BUFFER_POSITIONS=DBR_BAYS.buffer;
