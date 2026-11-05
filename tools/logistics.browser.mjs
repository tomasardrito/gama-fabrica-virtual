// Caller supplies an isolated Playwright page; never navigates another tab.
export async function verifyLogisticsPage(page,baseURL='http://127.0.0.1:8766'){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1456,height:829});await page.goto(baseURL);
 await page.getByRole('button',{name:'Iniciar filme'}).waitFor();
 await page.getByRole('button',{name:'Iniciar filme'}).click();
 if(errors.length)throw new Error(errors.join('\n'));
 return page.evaluate(async()=>{
  const {DbrSimulation}=await import('/dbr-simulation.js');
  const {sampleDbrHandling}=await import('/dbr-handling.js');
  const {sampleTruckVisit}=await import('/mps-scene.js');
  const sim=new DbrSimulation(),snapshot=sim.seek(170);
  return {fleet:sampleDbrHandling(snapshot).fleet.length,docks:[...new Set(snapshot.trips.map(t=>t.dockIndex))],visits:snapshot.trips.map(t=>sampleTruckVisit([t],170)).filter(v=>v.visible).map(v=>({id:v.trip.id,yaw:v.yaw,position:v.position}))};
 });
}

// Isolated 1x review surface. It deliberately labels its simplified volumes;
// final acceptance still requires C1's integrated factory and actor geometry.
export async function mountLogisticsPreview(container,{start=135,end=600,repair=false,internalLink=null,demonstration=false}={}){
 const THREE=await import('../vendor/three.module.js');
 const {DbrSimulation}=await import('../dbr-simulation.js');
 const {sampleDbrHandling}=await import('../dbr-handling.js');
 const {compileInternalTrial,compileInternalDemonstration,sampleDemonstrationTime}=await import('../dbr-presentation.js');
 const {sampleInternalTransport}=await import('../internal-motion.js');
 const {createLogisticsScene}=await import('../logistics-scene.js');
 const {createInternalTransportScene}=await import('../internal-scene.js');
 const {createForklift}=await import('../forklift.js');
 const {createWorkerRig}=await import('../worker-rig.js');
 const {DBR_LAYOUT}=await import('../dbr-layout.js');
 const {LOGISTICS_LAYOUT}=await import('../logistics-layout.js');
 const {sampleLogisticsTruck,cargoWorldPosition}=await import('../logistics-motion.js');
 const {createTruckRear,sampleTruckRear}=await import('../truck-rear.js');
 const sim=new DbrSimulation();if(repair)throw new Error('Legacy repair superseded by full R2 reservations');
 const demo=demonstration?compileInternalDemonstration(sim.schedule):null;
 const trial=demo?.trial||(internalLink?compileInternalTrial(sim.schedule,{link:internalLink}):null),world=new THREE.Scene();world.background=new THREE.Color('#c1d2d5');world.add(new THREE.AmbientLight(0xffffff,2));
 const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(10,30,10);world.add(sun);
 const box=(x,y,z,w,h,d,color)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color}));mesh.position.set(x,y,z);world.add(mesh);return mesh;};
 box(0,-.2,1,46,.2,34,0xd0d4cd);
 const textSprite=(text,width)=>{const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#294452';ctx.fillRect(0,0,512,96);ctx.fillStyle='white';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,60);const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c)}));sp.scale.set(width,width*96/512,1);return sp;};
 for(const [id,fixtures] of Object.entries(DBR_LAYOUT))for(const p of fixtures){box(p[0],.8,p[2]-.6,1.5,1.6,1.6,0x688d9b);const label=textSprite(id,1.7);label.position.set(p[0],2,p[2]-.6);world.add(label);}
 const logistics=createLogisticsScene({world,textSprite}),internal=createInternalTransportScene({world});
 const rigs=LOGISTICS_LAYOUT.fleet.map((v,i)=>{const r=createForklift({color:v.color,number:i+1});world.add(r.group);return r;});
 const workers=new Map();
 const loads=new Map(),trucks=new Map();const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,200);camera.position.set(30,32,40);camera.lookAt(0,0,4);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);container.append(renderer.domElement);
 if(demo){start=0;end=demo.duration;}
 let time=start,playing=false,last=performance.now(),frameId,lastFleet=[],recording=null;
 const status=document.createElement('div');status.style='position:fixed;top:8px;left:8px;padding:10px;background:#143344;color:white;font:18px sans-serif;white-space:pre-line';container.append(status);
 function draw(){
  const mapped=demo?sampleDemonstrationTime(demo,time):null,sourceTime=mapped?.sourceTime??time,snapshot={...sim.seek(sourceTime),internalTransportTrial:trial};
  let p;
  if(demo){
   const internalView=sampleInternalTransport(trial.plan,sourceTime),e=trial.plan.transfers[0],patch=internalView.loads.get(demo.lotId)||{position:e.fromPosition,palletY:.05};
   p={...internalView,fleet:[],loads:new Map([[demo.lotId,{...patch,palletYaw:patch.direction?Math.atan2(-patch.direction[0],-patch.direction[1]):0}]])};
  }else p=sampleDbrHandling(snapshot,sourceTime);
  lastFleet=p.fleet;
  const phases={approach:'Aproximação',pick:'Retirada',push:'Transporte',place:'Entrega',return:'Retorno vazio'};
  status.textContent=demo?`PROPOSTA A/D · 1× · ${time.toFixed(2)} / ${demo.duration} s · ${demo.lotId} · ${phases[mapped.phase]}\nRECONSTITUIÇÃO VISUAL · fora da agenda industrial · ciclo completo, sem alterar Excel ou 600 s`:`A1 · ensaio visual isolado · 1× · ${time.toFixed(3)} s · ${trial?'D: janela proposta ampliada':'535/535 ciclos · agenda operacional A/D'}\nVolumes indicativos · montagem final e demonstração 79–94,6 s: C1/B1`;
  rigs.forEach(r=>{r.group.visible=!demo;});p.fleet.forEach((pose,i)=>rigs[i].setPose(pose));internal.update(snapshot,p);
  for(const [id,pose]of p.operators){if(!id.includes(':'))continue;let worker=workers.get(id);if(!worker){worker=createWorkerRig();world.add(worker.group);workers.set(id,worker);}worker.pose(pose);}
  const visits=new Map();for(const tr of (demo?[]:snapshot.trips)){const v=sampleLogisticsTruck([tr],time);if(!trucks.has(tr.id)&&v.visible){const truck=logistics.truckTemplate.clone(true);world.add(truck);trucks.set(tr.id,{truck,rear:createTruckRear(truck)});}const obj=trucks.get(tr.id);if(obj){obj.truck.visible=v.visible;if(v.visible){obj.truck.position.set(...v.position);obj.truck.rotation.y=v.yaw;obj.rear.setState(sampleTruckRear(tr,time));visits.set(tr.id,v);}}}
  for(const obj of loads.values())obj.visible=false;
  for(const [id,load]of p.loads){let obj=loads.get(id);if(!obj){obj=new THREE.Group();world.add(obj);const pallet=new THREE.Mesh(new THREE.BoxGeometry(1.1,.2,1.1),new THREE.MeshStandardMaterial({color:0xb38a55}));pallet.position.y=.1;obj.add(pallet);const cargo=new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.8),new THREE.MeshStandardMaterial({color:id.startsWith('KIT-')?0x66b990:0xaab8c1}));cargo.position.y=.5;obj.add(cargo);const label=textSprite(id,2.1);label.position.y=1;obj.add(label);loads.set(id,obj);}obj.visible=true;let point=load.position;
   if(load.partLocation==='truck'){const tr=snapshot.trips.find(t=>t.lotIds.includes(id)),v=visits.get(tr?.id);if(!v){obj.visible=false;continue;}point=cargoWorldPosition(point,tr,v);}
   obj.position.set(point[0],load.palletY??.05,point[1]);obj.rotation.y=load.palletYaw??(load.palletDirection?Math.atan2(-load.palletDirection[0],-load.palletDirection[1]):0);
  }renderer.render(world,camera);
  if(recording){const {ctx,canvas}=recording;ctx.drawImage(renderer.domElement,0,0,canvas.width,canvas.height);ctx.fillStyle='#143344';ctx.fillRect(8,8,canvas.width-16,66);ctx.fillStyle='white';ctx.font='18px sans-serif';status.textContent.split('\n').forEach((line,i)=>ctx.fillText(line,18,32+i*26));}

 }
 function frame(now){if(playing){time=Math.min(end,time+(now-last)/1000);if(time>=end)playing=false;}last=now;draw();frameId=requestAnimationFrame(frame);}frameId=requestAnimationFrame(frame);
 if(demo){const replay=document.createElement('button');replay.textContent='Rever exemplo em 1×';replay.style='position:fixed;bottom:12px;left:12px;padding:10px';replay.onclick=()=>{time=0;last=performance.now();playing=true;};container.append(replay);}
 return {async record(){if(!demo)throw Error('Recording is only for the labelled proposal');const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9'}),chunks=[];recording={canvas,ctx};recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>{recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());recording=null;const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};});time=0;last=performance.now();playing=true;recorder.start();setTimeout(()=>recorder.stop(),(demo.duration+.1)*1000);return done;},seek(t){time=t;playing=false;draw();},play(){last=performance.now();playing=true;},stop(){playing=false;},get time(){return time;},get state(){return {time,fleet:lastFleet.map(v=>({id:v.id,position:v.position,direction:v.direction,event:v.event?.id||null}))};},camera(position,target){camera.position.set(...position);camera.lookAt(...target);draw();},destroy(){cancelAnimationFrame(frameId);renderer.dispose();container.replaceChildren();}};
}

// Read-only coordination export usable by D1 without a browser or local server:
// node tools/logistics.browser.mjs --windows > /tmp/a1-d1-windows.json
export async function reviewLogisticsWindows(){
 const {DbrSimulation}=await import('../dbr-simulation.js');
 const {coordinateInternalWindows,validateInternalWindowSpaces,compileInternalTrial}=await import('../dbr-presentation.js');
 const {reviewInternalTrialTraffic}=await import('../dbr-handling.js');
 const {INTERNAL_LINKS}=await import('../internal-layout.js');
 const schedule=new DbrSimulation().schedule,review=coordinateInternalWindows(schedule);
 return {review,spaces:validateInternalWindowSpaces(review),trials:INTERNAL_LINKS.map(link=>reviewInternalTrialTraffic(schedule,compileInternalTrial(schedule,{link})))};
}
if(typeof process!=='undefined'&&process.argv?.includes('--windows'))console.log(JSON.stringify(await reviewLogisticsWindows(),null,2));

if(typeof process!=='undefined'&&process.argv?.includes('--r2-windows')){const {DbrSimulation}=await import('../dbr-simulation.js');const {coordinateInternalProduction}=await import('../dbr-presentation.js');console.log(JSON.stringify(coordinateInternalProduction(new DbrSimulation().schedule),null,2));}

if(typeof process!=='undefined'&&process.argv?.includes('--traffic')){const {DbrSimulation}=await import('../dbr-simulation.js');const {externalCycleSweeps,externalTrafficConflicts}=await import('../logistics-motion.js');console.log(JSON.stringify({complete:false,method:'Conservative swept volumes over all motion segments, turns and parked intervals',conflicts:externalTrafficConflicts(externalCycleSweeps(new DbrSimulation().schedule))},null,2));}

if(typeof process!=='undefined'&&process.argv?.includes('--allocate')){const {DbrSimulation}=await import('../dbr-simulation.js');const {allocateInternalProduction}=await import('../dbr-presentation.js');const result=allocateInternalProduction(new DbrSimulation().schedule,{includeExternal:!process.argv.includes('--internal-only')});console.log(JSON.stringify({...result,plan:undefined,sweeps:process.argv.includes('--sweeps')?result.sweeps:undefined},null,2));}

// Reproducible handoff to D1. These two reservations came from the internal-only
// allocator, not from a new industrial schedule. Static acceptance of the full
// factory remains the separate joint-allocation responsibility.
export async function diagnoseInternalJointContract(schedule){
 const {compileInternalProductionTrial}=await import('../dbr-presentation.js');
 const {compileInternalTransport,internalOperatorCandidates,internalSweepReservations}=await import('../internal-motion.js');
 const {INTERNAL_LAYOUT}=await import('../internal-layout.js');
 const windows=[{id:'DBR-E13',operatorId:'rosq:2',pickupStart:138.41374727446492,loadedEnd:138.71254160333248},{id:'DBR-E7',operatorId:'buffer:0',pickupStart:139.40672649374076,loadedEnd:139.59021474329361}];
 const inputs=windows.map(w=>{const {input}=compileInternalProductionTrial(schedule,{id:w.id,includeExternal:false});return {...input,transfer:{...input.transfer,start:w.pickupStart,end:w.loadedEnd},operator:internalOperatorCandidates(input).find(o=>o.id===w.operatorId)};});
 const common={layout:INTERNAL_LAYOUT,presentation:{mode:'production',fitProductionStart:true}},single=inputs.map(i=>compileInternalTransport({...common,transfers:[i.transfer],carriers:[i.carrier],operators:[i.operator]})),sweeps=single.map(internalSweepReservations);
 let timedSweepPairs=0;
 for(const a of sweeps[0])for(const b of sweeps[1])if(a.start<b.end&&b.start<a.end&&a.min[0]<b.max[0]&&a.max[0]>b.min[0]&&a.min[1]<b.max[1]&&a.max[1]>b.min[1])timedSweepPairs++;
 let jointAccepted=true,error=null;try{compileInternalTransport({...common,transfers:inputs.map(i=>i.transfer),carriers:inputs.map(i=>i.carrier),operators:inputs.map(i=>i.operator)});}catch(e){jointAccepted=false;error=e.message;}
 return {scope:'isolated-motor-contract',industrialEffect:false,timedSweepPairs,jointAccepted,error,windows:single.map(p=>{const m=p.missions[0];return {id:m.transfer.id,operatorId:m.operator.id,carrierId:m.carrier.id,start:m.start,pickupStart:m.pickupStart,loadedEnd:m.transfer.end,end:m.end};})};
}
if(typeof process!=='undefined'&&process.argv?.includes('--motor-contract')){const {DbrSimulation}=await import('../dbr-simulation.js');console.log(JSON.stringify(await diagnoseInternalJointContract(new DbrSimulation().schedule),null,2));}

// C1 reads this compact calendar; the live plan remains available on snapshots.
export function operationalLogisticsContract(schedule){
 const a=schedule.internalAllocation;
 if(!a?.complete||!a.audit.complete||!schedule.logisticsCorridorPlan.complete)throw new Error('Operational logistics is incomplete');
 const durations=a.assignments.map(m=>m.loadedEnd-m.pickupStart);
 return {version:'A1-R3',complete:true,duration:600,demonstration:{start:79,end:94.6,owner:'B1/C1'},
  internal:{count:a.assignments.length,assignments:a.assignments,loadedSeconds:{minimum:Math.min(...durations),maximum:Math.max(...durations),floor:durations.filter(d=>d<=.1+1e-7).length,belowPointTwo:durations.filter(d=>d>.1+1e-7&&d<.2).length,pointTwoToPointFive:durations.filter(d=>d>=.2&&d<.5).length,atLeastPointFive:durations.filter(d=>d>=.5).length}},
  external:{cycles:schedule.logisticsCycles,resourceChanges:schedule.logisticsCorridorPlan.resourceChanges,unresolved:schedule.logisticsCorridorPlan.unresolved},
  components:{complete:schedule.componentPlan.complete,kits:schedule.componentPlan.missions.length,deliveries:schedule.componentTransfers.map(e=>({id:e.id,kitId:e.kitId,from:e.from,to:e.to,start:e.start,end:e.end,vehicleId:e.vehicleId}))},audit:a.audit,
  consumption:{simulation:'DbrSimulation',snapshot:'internalTransportPlan + internalAllocation + handlingBays',poses:'sampleDbrHandling(snapshot)',scene:'mps-scene creates the five carriers once',c1:'Remove superseded rollers; merge existing operator poses by ID. Keep the separate Act 2 demonstration.'}};
}
if(typeof process!=='undefined'&&process.argv?.includes('--operational')){const {DbrSimulation}=await import('../dbr-simulation.js');console.log(JSON.stringify(operationalLogisticsContract(new DbrSimulation().schedule),null,2));}
