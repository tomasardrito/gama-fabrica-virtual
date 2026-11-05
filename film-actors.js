import {FILM_STORY,FILM_CAST} from './film-story.js';
import {sampleRoute,dbrWorkStand,routeLength} from './dbr-layout.js';
// Tour walks: the long stretch happens in the camera cut; on screen the two
// walk the last metres at a natural pace instead of sprinting across the plant.
const TOUR_WALK_SPEED=2.2;
import {MEETING_ROOM as ROOM,meetingDirection} from './meeting-room.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const ACTOR_HOME={...ROOM.seats,Jorge:dbrWorkStand('m1',0),André:dbrWorkStand('lap',0)};
const exit={Rafael:[-9.1,6.2],Ricardo:[-9.1,7.08]};
const stops=[[21.3,-3.2],[21.3,-4.8],[.9,5.3],[-7.8,12.6],[-11,10.8],[-9.1,12.6]];
const routes=[[[-9.1,12.6],[21.3,12.6],[21.3,-3.2],stops[0]],[stops[1]],[[21.3,-2.8],[10.8,-2.8],[10.8,4.4],[.9,4.4],stops[2]],[[-8,5.3],[-8,12.6],stops[3]],[[-9.1,12.6],stops[4]],[[-9.1,10.8],stops[5]]];
const exits={Rafael:[ROOM.seats.Rafael,[-10.5,5.65],[-9.1,5.65],exit.Rafael],Ricardo:[ROOM.seats.Ricardo,[-10.5,8.45],[-10.2,7.05],exit.Ricardo],Marcos:[ROOM.seats.Marcos,[-15.4,8.7],[-15.4,9.55],[-10.3,9.55],[-10.3,6.7],[-9.1,6.7],[-9.1,10.8],ROOM.ropeStand]};
function move(actor,path,u){const p=sampleRoute(path,clamp(u));actor.position=p.position;actor.direction=p.direction;actor.walking=u>0&&u<1;actor.seated=0;}
function sit(actor,name){actor.position=[...ROOM.seats[name]];actor.direction=meetingDirection(actor.position);actor.seated=1;actor.chairPull=0;actor.walking=false;}
function entryPath(name,i){const seat=ROOM.seats[name],south=seat[1]<7,side=seat[0]<-14?-0.8:0.8;return [[-13+i,16.5],[-13+i,15.3],[-13,15.3],[-13,12.6],[-9,12.6],[-9,6.2],[-10.1,6.2],[-10.1,south?4.45:9.6],[seat[0]+side,south?4.45:9.6],[seat[0]+side,seat[1]],seat];}
function beforeResults(time,speech,story=FILM_STORY){
 const actors=Object.fromEntries(Object.entries(FILM_CAST).map(([name,data])=>[name,{...data,position:[...ACTOR_HOME[name]],direction:[0,-1],walking:false,seated:0,chairPull:0,speaking:speech?.speaker===name,operatorId:name==='André'?'lap:0':name==='Jorge'?'m1:0':null}]));
 for(const name of ['Carlos','Ricardo','Marcos','Rafael'])sit(actors[name],name);
 // Opening: the four arrive through the main gate with the staff and take
 // their seats just before the first line (reverse of the final exit route).
 const firstLine=story.speeches.find(s=>s.id==='F01')?.start??25;
 // Farthest seat enters first; all walk at the same pace, 2 s apart.
 if(time<firstLine){const order=['Marcos','Carlos','Ricardo','Rafael'];for(const [i,name]of order.entries()){
  const actor=actors[name],path=entryPath(name,i);
  const rafaelPath=entryPath('Rafael',3),lastStart=firstLine-1-.9-routeLength(rafaelPath)/1.5,start=Math.max(.5+i*2,lastStart-(3-i)*2),walkEnd=start+routeLength(path)/1.5,end=walkEnd+.9;actor.entering=true;
  if(time<start){actor.visible=false;actor.notYetArrived=true;continue;}
  if(time<walkEnd){move(actor,path,(time-start)/(walkEnd-start));actor.seated=0;actor.chairPull=0;}
  else {actor.seated=smooth((time-walkEnd)/.9);actor.chairPull=1-actor.seated;}
 }}
 const start=story.speeches.find(s=>s.id==='F06').start,pcpStart=Math.max(start+11.1,75.4),pcpEnd=pcpStart+6.6;
 if(time>=start){for(const name of ['Rafael','Ricardo','Marcos']){const actor=actors[name],delay=name==='Ricardo'?1:name==='Marcos'?10:0,u=(time-start-delay)/1.1;actor.seated=1-smooth(u);actor.chairPull=smooth(u);if(u>0)actor.position=[ROOM.seats[name][0]-meetingDirection(ROOM.seats[name])[0]*actor.chairPull*.3,ROOM.seats[name][1]-meetingDirection(ROOM.seats[name])[1]*actor.chairPull*.3];if(u>=1){const route=[actor.position,...exits[name].slice(1)],walkStart=name==='Marcos'?pcpStart:start+delay+1.1,walkEnd=name==='Marcos'?pcpEnd:story.walks[0].start;move(actor,route,(time-walkStart)/(walkEnd-walkStart));}}}
 if(time>=75){if(time>=pcpEnd){actors.Marcos.position=[...ROOM.ropeStand];actors.Marcos.seated=0;actors.Marcos.walking=false;}
  for(const name of ['Rafael','Ricardo']){actors[name].position=[...exit[name]];actors[name].seated=0;actors[name].walking=false;}
  let previous=exit.Rafael;
  for(const walk of story.walks){if(time<walk.start)break;const route=[previous,...routes[walk.tourIndex]],length=routeLength(route),u=clamp((time-walk.start)/(walk.end-walk.start)),walked=time>=walk.end?length:Math.max(0,length-TOUR_WALK_SPEED*(walk.end-time)),p=sampleRoute(route,length>0?walked/length:1);
   const phi=Math.PI/2+(Math.PI+Math.atan(.2)-Math.PI/2)*(walk.tourIndex===0?smooth((u-.08)/.045):1);
   for(const name of ['Rafael','Ricardo']){const offset=name==='Ricardo'?[.88*Math.cos(phi),.88*Math.sin(phi)]:[0,0];actors[name].position=[p.position[0]+offset[0],p.position[1]+offset[1]];actors[name].direction=p.direction;actors[name].walking=u<1;}previous=stops[walk.tourIndex];if(u<1)break;
  }
  const returnStart=story.walks.at(-1).end,returnDuration=135-returnStart;
  if(time>=returnStart){const from=[stops[5][0]-.88/Math.hypot(1,.2),stops[5][1]-.176/Math.hypot(1,.2)];move(actors.Ricardo,[from,[-11,from[1]],[-11,11.3],[-9.1,11.3],[-9.1,7],[-10.2,7],ROOM.seats.Ricardo],(time-returnStart)/returnDuration);actors.Ricardo.seated=smooth((time-(135-returnDuration*.2))/(returnDuration*.2));}
  // Rafael returns ahead of Ricardo and watches from the room.
  if(time>=returnStart){const rs=returnStart,rd=returnDuration*.55;move(actors.Rafael,[stops[5],[-9.1,6.2],[-9.1,5.65],[-10.5,5.65],ROOM.seats.Rafael],(time-rs)/(rd*.85));actors.Rafael.seated=smooth((time-(rs+rd*.85))/(rd*.15));actors.Rafael.chairPull=1-actors.Rafael.seated;}
 }
 if(time>=135){sit(actors.Ricardo,'Ricardo');sit(actors.Rafael,'Rafael');if(speech?.id==='F14'){Object.assign(actors.Rafael,{position:[18.5,14.2],seated:0,chairPull:0,walking:false,direction:[.52,.85]});}if(speech?.id==='F23'){actors.Carlos.position=[18.5,14.2];actors.Carlos.seated=0;}}
 return actors;
}
function sampleLegacyActors(time,speech=null,{handling,story}={}){
 const actors=beforeResults(Math.min(time,509.999),speech,story);
 if(time>=510){
  for(const [name,actor]of Object.entries(actors)){
   if(['Carlos','Ricardo','Rafael'].includes(name)){sit(actor,name);continue;}
   const source=actor.position,seat=ROOM.seats[name];let route;
   if(name==='André')route=[source,[19.5,source[1]],[19.5,12.6],[-9.1,12.6],[-9.1,5.6],[-10.4,5.6],[-11.2,4.7],[-13,4.7],seat];
   else if(name==='Jorge')route=[source,[source[0],12.6],[-9.1,12.6],[-9.1,5.65],[-10.4,5.65],[-11.3,4.7],[-15.4,4.7],seat];
   else if(name==='Marcos')route=[source,[-9.1,10.8],[-9.1,6.7],[-10.3,6.7],[-10.3,9.55],[-15.4,9.55],seat];
   else route=[source,[-9.1,5.65],[-10.3,5.65],seat];
   const start=name==='André'?516.9:name==='Jorge'?514.5:name==='Marcos'?512.2:510,end=name==='André'?519.7:name==='Jorge'?516.7:name==='Marcos'?514.3:512;
   if(time>=end)sit(actor,name);else {move(actor,route,(time-start)/(end-start));actor.seated=smooth((time-end+.7)/.7);actor.chairPull=1-actor.seated;}
  }
 }
 // Mission positions supplied by handling are authoritative, including during speech.
 if(time>=75&&time<510&&handling?.operators)for(const actor of Object.values(actors)){if(!actor.operatorId||actor.speaking)continue;const op=handling.operators.get(actor.operatorId)||handling.operators.get(actor.operatorId.split(':')[0]);if(op){actor.position=[...op.position];actor.direction=[...op.direction];actor.walking=op.walking??(op.phase&& !['parked','work'].includes(op.phase));actor.seated=0;actor.operational=true;}}
 const speaker=speech&&actors[speech.speaker];if(speaker)for(const actor of Object.values(actors)){if(actor.walking||actor.operational)continue;const look=actor===speaker?ROOM.center:speaker.position,dx=look[0]-actor.position[0],dz=look[1]-actor.position[1],n=Math.hypot(dx,dz);if(n){if(actor.seated){const base=meetingDirection(actor.position),cross=base[0]*dz-base[1]*dx;actor.twist=Math.max(-.18,Math.min(.18,cross/n));}else actor.direction=[dx/n,dz/n];}}
 return actors;
}

// Compose educational poses only. The industrial snapshot is never edited.
export function withFilmDemonstration(snapshot,presentation,visual,{sourceBay}={}){
 const demo=snapshot.film?.demonstration;
 if(!demo||!visual)return presentation;
 if(snapshot.dbr.workHours!==0)throw new Error('Demonstration requires the stopped industrial clock');
 const loads=new Map(presentation.loads),operators=new Map(presentation.operators),carriers=new Map((presentation.carriers||[]).map(c=>[c.id,c]));
 for(const [id,patch]of visual.loads){
  if(id!=='DEMO-PALLET'||loads.has(id))throw new Error('Invalid or duplicated demonstration pallet');
  if(Object.hasOwn(patch,'quantity'))throw new Error('Demonstration cannot carry an industrial quantity');
  loads.set(id,{...patch,id,lotId:id,batchId:id,demonstration:true,illustrative:true,stage:'demonstration',partStage:'lap',product:null,palletYaw:patch.yaw,partYaw:patch.yaw});
 }
 for(const [id,pose]of visual.operators){
  if(!operators.has(id))throw new Error('Demonstration must reuse an existing operator');
  operators.set(id,pose);if(id.endsWith(':0')&&operators.has(id.slice(0,-2)))operators.set(id.slice(0,-2),pose);
 }
 for(const carrier of visual.carriers)carriers.set(carrier.id,carrier);
 const demoTime=snapshot.film.presentationTime??snapshot.elapsed;
 const opacity=Math.min(smooth((demoTime-demo.start)/.35),smooth((demo.end-demoTime)/.35));
 return {...presentation,loads,operators,carriers:[...carriers.values()],demonstration:{...demo,sourceBay:sourceBay??demo.sourceBay,requestedSourceBay:demo.sourceBay,opacity,phase:visual.carriers[0]?.phase||'approach'}};
}

// One conservative footprint for each named person over the ENTIRE example.
// Polyline vertices bound every intervening point, including the PCP exit.
export function filmDemonstrationSweeps({start,end},{story=FILM_STORY}={}){
 const window=story.windows?.demonstration||[start,end];
 const points=Object.fromEntries(Object.keys(FILM_CAST).map(name=>[name,[]]));
 const times=new Set([window[0],window[1],...story.walks.flatMap(w=>[w.start,w.end]).filter(t=>t>=window[0]&&t<=window[1])]);
 for(let i=0;i<=256;i++)times.add(window[0]+(window[1]-window[0])*i/256);
 for(const time of times)for(const [name,actor]of Object.entries(sampleFilmActors(time,null,{story})))points[name].push(actor.position);
 return Object.entries(points).map(([name,positions])=>({id:`actor:${name}`,start,end,min:[0,1].map(i=>Math.min(...positions.map(p=>p[i]))-.65),max:[0,1].map(i=>Math.max(...positions.map(p=>p[i]))+.65)}));
}

// Narrative windows are presentation time; the legacy choreography is sampled
// through these anchors, while mission poses retain their operational sample.
export function sampleFilmActors(time,speech=null,{handling,story,operationTime}={}){
 const windows=story?.windows;
 const anchors=windows?[[0,0],[windows.opening[1],25],[windows.problem[1],75],[windows.solution[1],135],[windows.production[1],510],[windows.results[1],580],[600,600]]:null;
 let legacy=time;
 if(anchors)for(let i=1;i<anchors.length;i++){const [end,b]=anchors[i],[start,a]=anchors[i-1];if(time<=end){legacy=a+(b-a)*(time-start)/(end-start);break;}}
 const retime=t=>{if(!anchors)return t;for(let i=1;i<anchors.length;i++){const [end,b]=anchors[i],[start,a]=anchors[i-1];if(t<=end)return a+(b-a)*(t-start)/(end-start);}return t;};
 const legacyStory=story?.speeches?.length?{...story,speeches:story.speeches.map(s=>({...s,start:retime(s.start),end:retime(s.end)})),walks:story.walks.map(w=>({...w,start:retime(w.start),end:retime(w.end)}))}:undefined;
 const actors=sampleLegacyActors(legacy,speech,{handling,story:legacyStory});
 for(const actor of Object.values(actors)){actor.visible=!actor.notYetArrived;actor.exitPhase=actor.seated?'seated':'standing';}
 const [start,end]=windows?.exit||[580,595];
 if(time>=start){
  // Same walking pace for everyone, 2.2 s apart, in the order that keeps the most
  // room between people in the shared corridors (≥1.1 m). Chairs are pushed back in.
  const exitPath=(name,i)=>{const seat=ROOM.seats[name],south=seat[1]<7,side=seat[0]<-14?-0.8:0.8;return [seat,[seat[0]+side,seat[1]],[seat[0]+side,south?4.45:9.6],[-10.1,south?4.45:9.6],[-10.1,6.2],[-9,6.2],[-9,12.6],[-13,12.6],[-13,15.3],[-13+i,15.3],[-13+i,16.5]];};
  const names=['Rafael','Ricardo','Jorge','André','Carlos','Marcos'],lengths=Object.fromEntries(names.map((n,i)=>[n,routeLength(exitPath(n,i))]));
  const order=['Ricardo','Carlos','André','Marcos','Rafael','Jorge'],standUp=.8,speed=1.6,gap=2.2;
  const need=Math.max(...order.map((n,i)=>i*gap+standUp+lengths[n]/speed))+.2,k=Math.min(1,(end-start)/need);
  for(const [i,name]of order.entries()){
   const actor=actors[name],slotIndex=names.indexOf(name),path=exitPath(name,slotIndex),tau=time-start-i*gap*k,walkTime=lengths[name]/speed*k,rise=standUp*k;
   sit(actor,name);actor.operational=false;actor.speaking=false;
   actor.exitPhase=tau<=0?'seated':tau<rise?'standing':tau<rise+walkTime?'walking':'exited';
   actor.visible=actor.exitPhase!=='exited';
   actor.chairPull=smooth(tau/rise)*(1-smooth((tau-rise-1.2)/1));
   actor.seated=1-smooth(tau/rise);
   if(tau>=rise)move(actor,path,(tau-rise)/walkTime);
  }
 }
 return actors;
}
