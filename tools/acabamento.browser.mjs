import verifyFilmMode from './filme.browser.mjs';
// Invoke with an isolated Playwright Page. No dependency is added to the site.
export default async function verifyFinish(page,baseURL='http://127.0.0.1:8768/',outputDir='/tmp'){
 const shared=await verifyFilmMode(page,baseURL),shots=[],cameraChecks=[],continuous=[],demonstrations=[],operationalChecks=[];
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const size of [{width:1456,height:829},{width:1920,height:1080}]){
  await page.setViewportSize(size);
  const operational=await page.evaluate(async()=>{
   const [{FactoryFilm},{createFactoryScene,createAct2Demonstration},{sampleDbrHandling},{withFilmDemonstration},{sampleTruckVisit}]=await Promise.all([import('./factory-film.js'),import('./scene.js'),import('./dbr-handling.js'),import('./film-actors.js'),import('./mps-scene.js')]);
   const mount=document.createElement('div');Object.assign(mount.style,{position:'fixed',inset:'48px 360px 84px 0'});document.body.append(mount);
   const prepared=await (await import('./film-prepared.js')).loadPreparedFilm(new URL('.',location.href));
   const model=createAct2Demonstration(prepared.demonstration),scene=createFactoryScene(mount,{demonstration:model,signage:'physical'}),film=new FactoryFilm({preparedSchedule:prepared.schedule,preparedDemonstration:prepared.demonstration}),failures=[];
   const times=[...new Set([...Array.from({length:1201},(_,i)=>i/2),78.99,79.01,94.59,94.61,134.99,135.01,137.233333,140.56,141.2,143.933333,355.595,464.1,509.99,510.01])].sort((a,b)=>a-b);
   const close=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[1])<1e-5;
   try{for(const t of times){const s=film.seek(t);scene.direct(s.film.shot);scene.update(s,.5);const actual=scene.getOperationalState();
    let expected=sampleDbrHandling(s);if(s.film.demonstration)expected=withFilmDemonstration(s,expected,model.sample(model.plan,s.film.demonstration.sourceTime),model);
    if(!actual.complete||actual.internalCount!==535||!actual.logisticsMounted||actual.conveyorGroups)failures.push({t,reason:'incomplete scene or retained conveyor',actual});
    if(actual.forklifts.length!==5||actual.forklifts.some((p,i)=>!p.visible||!close(p.position,expected.fleet[i].position)))failures.push({t,reason:'fleet pose differs from A1'});
    const carriers=expected.carriers.filter(p=>p.visible!==false&&(!(expected.demonstration?.carrierId===p.id)||expected.demonstration.opacity>0));
    if(actual.carriers.length!==carriers.length||carriers.some(p=>actual.carriers.filter(a=>close(a.position,p.position)).length!==1))failures.push({t,reason:'carrier missing, duplicated or moved independently',count:actual.carriers.length,expected:carriers.length});
    if(t>=135&&t<510){if(new Set(actual.operators.map(p=>p.id)).size!==actual.operators.length||actual.operators.some(p=>!p.visible||!expected.operators.has(p.id)||!close(p.position,expected.operators.get(p.id).position)))failures.push({t,reason:'operator missing, duplicated or outside its reserved pose'});}
    const trucks=s.trips.map(tr=>sampleTruckVisit([tr],s.animationTime)).filter(p=>p.visible);
    if(actual.trucks.length!==trucks.length||trucks.some(p=>actual.trucks.filter(a=>Math.hypot(a.position[0]-p.position[0],a.position[2]-p.position[2])<1e-5&&Math.abs(Math.sin(a.yaw-p.yaw))<1e-5).length!==1))failures.push({t,reason:'truck pose differs from A1'});
   }return {samples:times.length,failures};}finally{scene.destroy();mount.remove();}
  });
  if(operational.failures.length)throw new Error(JSON.stringify(operational.failures.slice(0,4)));operationalChecks.push({size,...operational});
  const cameraCheck=await page.evaluate(async()=>{
   const [{FactoryFilm},{createFactoryScene}]=await Promise.all([import('./factory-film.js'),import('./scene.js')]);
   const mount=document.createElement('div');Object.assign(mount.style,{position:'fixed',inset:'48px 360px 110px 0'});document.body.append(mount);
   const prepared=await (await import('./film-prepared.js')).loadPreparedFilm(new URL('.',location.href));
   const scene=createFactoryScene(mount,{signage:'physical'}),film=new FactoryFilm({preparedSchedule:prepared.schedule}),failures=[];
   try{for(const cue of film.plan.cues.filter(c=>c.t>=25&&c.t<580)){
    const state=film.seekPresentation(cue.t+Math.min(1.6,cue.duration/2));scene.resetView();scene.direct(state.film.shot);scene.update(state,0);
    const pose=scene.getCameraPose(),shot=state.film.shot;
    if(Math.abs(pose.position[1]-(shot.cameraHeight??35))>.0001||Math.abs(pose.span-shot.span)>.0001)failures.push({t:state.elapsed,reason:'rig projection not applied',pose,shot});
    if(shot.speaker&&!scene.projectActor(shot.speaker).visible)failures.push({t:state.elapsed,reason:'actual rig speaker off screen',speaker:shot.speaker});
    for(const sector of shot.visibleSectors||[])if(!scene.projectSector(sector).visible)failures.push({t:state.film.presentationTime,reason:'declared sector off screen',sector});
   }return {takes:film.plan.cues.length,failures};}finally{scene.destroy();mount.remove();}
  });
  if(cameraCheck.failures.length)throw new Error(JSON.stringify(cameraCheck.failures.slice(0,3)));cameraChecks.push({size,...cameraCheck});
  const demonstration=await page.evaluate(async()=>{
   const [{FactoryFilm},{createFactoryScene}]=await Promise.all([import('./factory-film.js'),import('./scene.js')]);
   const mount=document.createElement('div');Object.assign(mount.style,{position:'fixed',inset:'48px 360px 84px 0'});document.body.append(mount);
   const prepared=await (await import('./film-prepared.js')).loadPreparedFilm(new URL('.',location.href));
   const {createAct2Demonstration}=await import('./scene.js');
   const scene=createFactoryScene(mount,{demonstration:createAct2Demonstration(prepared.demonstration),signage:'physical'}),film=new FactoryFilm({preparedSchedule:prepared.schedule,preparedDemonstration:prepared.demonstration}),phases=new Set(),failures=[],trace=[];
   const [start,end]=film.plan.story.windows.demonstration;
   try{for(let tick=Math.round((start-1.5)*20);tick<=Math.round((end+1.5)*20);tick++){
    const t=tick/20,s=film.seekPresentation(t);scene.direct(s.film.shot);scene.update(s,.05);const demo=scene.getDemonstrationState();
    if(t>=start&&t<end){if(!demo){failures.push({t,reason:'demo absent'});continue;}phases.add(demo.phase);
     if(demo.sourceBay!==3||demo.requestedSourceBay!==4)failures.push({t,reason:'staging does not use the free D1 bay',demo});
     if(demo.operatorInstances!==1||demo.industrialHours!==0||s.completed!==0||s.shipped!==0)failures.push({t,reason:'identity or industrial effect',demo});
     if(demo.opacity>.95&&(!demo.palletVisible||!demo.carrierVisible||!demo.palletInFrame||!demo.operatorInFrame||!demo.carrierInFrame))failures.push({t,reason:'props off frame or invisible',demo});
     if(s.film.speech&&!scene.projectActor(s.film.speech.speaker).visible)failures.push({t,reason:'actual speaker off frame',speaker:s.film.speech.speaker});
     trace.push({t,phase:demo.phase,opacity:demo.opacity,pallet:demo.palletPosition,operator:demo.operatorPosition,carrier:demo.carrierPosition,carrierInFrame:demo.carrierInFrame,carrierPark:demo.carrierPark,operatorHome:demo.operatorHome});
    }else if(demo)failures.push({t,reason:'demo leaked beyond its window'});
   }for(const phase of ['approach','pick','push','place','return'])if(!phases.has(phase))failures.push({reason:'phase absent',phase});return {samples:Math.round((end-start+3)*20)+1,phases:[...phases],failures,trace};}finally{scene.destroy();mount.remove();}
  });
  if(demonstration.failures.length)throw new Error(JSON.stringify(demonstration.failures.slice(0,3)));demonstrations.push({size,...demonstration});
  for(const t of [23,36,63,78.9,79.1,82,83.95,84.1,85.5,87,90,91.55,93.8,94.55,94.65,96.45,98,106,110,134.9,135.1,137.23,140.56,143.93,144.8,343.6,350.4,355.595,360,450,465,477,482,488,494,510,523,540,596]){
   await page.keyboard.press('r');await page.clock.runFor(32);await page.clock.fastForward(t*1000);await page.clock.runFor(32);await page.keyboard.press('Space');
   const state=await page.evaluate(()=>{const card=document.querySelector('#film-card'),bounds=card.getBoundingClientRect();return {clock:document.querySelector('#elapsed-clock').textContent,kind:card.hidden?null:card.dataset.kind,text:card.textContent,overflow:!card.hidden&&(card.scrollHeight>card.clientHeight+1||card.scrollWidth>card.clientWidth+1||[...card.children].some(n=>{const r=n.getBoundingClientRect();return r.bottom>bounds.bottom+1||r.top<bounds.top-1||r.left<bounds.left-1||r.right>bounds.right+1;})),controls:[...document.querySelectorAll('button,input,select,[role=tab]')].filter(n=>n.getBoundingClientRect().height>0).length,errors:document.querySelectorAll('.scene-error,#runtime-error').length};});
   if(state.controls||state.errors||state.overflow)throw new Error(JSON.stringify({t,size,state}));
   if(t===23&&state.kind!=='title')throw new Error('Title card absent');
   if(t===596&&(state.kind!=='credits'||!state.text.includes('[NOME 6]')))throw new Error('JSON credits absent');
   const path=`${outputDir}/gama-c1-${size.width}-${t}.png`;await page.screenshot({path});shots.push({size,t,path,...state});
  }
  await page.keyboard.press('r');await page.clock.runFor(32);await page.clock.fastForward(340000);
  const clocks=[];
  for(const [step,t,expected]of [[3600,343.6,'05:43'],[6800,350.4,'05:50']]){
   await page.clock.runFor(step);const clock=await page.locator('#elapsed-clock').innerText();
   if(clock!==expected)throw new Error(`Continuous playback did not advance to ${expected}: ${clock}`);
   const path=`${outputDir}/gama-c1-continuous-${size.width}-${t}.png`;await page.screenshot({path});clocks.push({t,clock,path});
  }
  await page.keyboard.press('Space');continuous.push({size,clocks});

 }
 if(errors.length)throw new Error(errors.join('; '));
 return {shared,operationalChecks,cameraChecks,demonstrations,shots,continuous,errors};
}
