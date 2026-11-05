// Run with an isolated Playwright Page against C1's actual scene integration.
// Uses existing browser dependencies; creates no application fixture or second camera.
export default async function verifyCamera(page,baseURL='http://127.0.0.1:8768/',outputDir='/tmp'){
 const errors=[],onError=e=>errors.push(e.message);page.on('pageerror',onError);
 const results=[];
 try{
  await page.route('**/*',route=>route.continue());
  await page.clock.install();
  for(const size of [{width:1456,height:829},{width:1920,height:1080}]){
   await page.setViewportSize(size);await page.goto(baseURL);
   await page.getByRole('button',{name:'▶ Iniciar filme'}).waitFor();
   const result=await page.evaluate(async()=>{
    const {FactoryFilm}=await import('/factory-film.js');
    const {createFactoryScene,createAct2Demonstration}=await import('/scene.js');
    const prepared=await (await import('/film-prepared.js')).loadPreparedFilm(new URL('/',location.href));
    const {sampleDbrHandling}=await import('/dbr-handling.js');
    const film=new FactoryFilm({preparedSchedule:prepared.schedule,preparedDemonstration:prepared.demonstration}),mount=document.createElement('div');
    const world=document.querySelector('#world'),bounds=world.getBoundingClientRect();
    Object.assign(mount.style,{position:'fixed',left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,zIndex:100});document.body.append(mount);
    const scene=createFactoryScene(mount,{demonstration:createAct2Demonstration(prepared.demonstration),signage:'physical'}),failures=[],sectors=new Set(),sweeps=[];
    function applied(state,settled){
     const shot=state.film.shot,pose=scene.getCameraPose();
     if(settled){
      const reach=(shot.cameraHeight??35)*38/35,orbit=shot.orbit??.7;
      const expected=[shot.position[0]+Math.sin(orbit)*reach,shot.cameraHeight??35,shot.position[1]+Math.cos(orbit)*reach];
      if(pose.position.some((v,i)=>Math.abs(v-expected[i])>.001)||Math.abs(pose.span-shot.span)>.001)
       failures.push({t:state.elapsed,reason:'actual scene did not apply camera rig',pose,expected,shotId:shot.id});
      if(shot.speaker&&!scene.projectActor(shot.speaker).visible)
       failures.push({t:state.elapsed,reason:'actual scene speaker off-screen',speaker:shot.speaker});
     }
     if(shot.target==='tracked'){
      const load=sampleDbrHandling(state).loads.get(state.film.trackedLotId);
      if(!load||shot.position.some((v,i)=>Math.abs(v-load.position[i])>.00001))
       failures.push({t:state.elapsed,reason:'camera target differs from actual load',loadId:load?.lotId});
     }
     return pose;
    }
    try{
     if(typeof scene.getCameraPose!=='function')throw new Error('C1 camera integration absent: getCameraPose unavailable');
     for(const cue of film.plan.cues.filter(c=>c.t>=25&&c.t<580)){
      const state=film.seekPresentation(cue.t+Math.min(1.6,cue.duration/2));
      scene.resetView();scene.direct(state.film.shot);scene.update(state,0,{playbackStarted:true,transportPlaying:false});
      sectors.add(state.film.shot.sector);applied(state,true);
     }
     // Consecutive frames exercise transitions; static seeks alone cannot verify them.
     for(const [label,start,end]of [['ACT2-DEMO',97.7,125.3],['S1',194,230],['S5',330,365],['S8',450,480]]){
      scene.resetView();let frames=0,trackedFrames=0,shortFrames=0,flowFrames=0,demonstrationFrames=0;
      const samples=[];
      // Warm up the existing shot before measuring, including a moving tour.
      // resetView() starts a fresh rig; shot.t alone does not settle that rig.
      for(let t=start-1.5;t<=end+.00001;t+=.1){
       const state=film.seekPresentation(t),shot=state.film.shot;
       scene.direct(shot);scene.update(state,.1,{playbackStarted:true,transportPlaying:false});
       const pose=applied(state,t>=start-.00001&&t-shot.t>=1.3);
       if(t<start-.00001)continue;
       if(state.film.demonstration){
        demonstrationFrames++;
        if(state.dbr.workHours!==0||state.shipped!==0||state.completed!==0||shot.demonstrationId!==state.film.demonstration.id)
         failures.push({t,reason:'demonstration framing or industrial isolation violated'});
       }
       frames++;if(shot.target==='tracked')trackedFrames++;
       if(shot.duration<4-.00001)shortFrames++;if(shot.type==='travelling'&&label==='S8')flowFrames++;
       samples.push({t,shotId:shot.id,sector:shot.sector,position:shot.position,camera:pose.position});
      }
      sweeps.push({label,frames,trackedFrames,shortFrames,flowFrames,demonstrationFrames,samples});
     }
     return {sectors:[...sectors],takes:film.plan.cues.length,failures,sweeps};
    }finally{scene.destroy();mount.remove();}
   });
   if(result.failures.length)throw new Error(JSON.stringify(result.failures.slice(0,6)));
   const shots=[];
   await page.getByRole('button',{name:'▶ Iniciar filme'}).click();
   for(const t of [98,110,117.5,124.4,200,210,280,335,350,420,460,575,585]){
    await page.keyboard.press('r');await page.clock.runFor(32);
    await page.clock.fastForward(t*1000);await page.clock.runFor(32);await page.keyboard.press('Space');
    const state=await page.evaluate(()=>({clock:document.querySelector('#elapsed-clock').textContent,
     sector:document.querySelector('#scene-sector').textContent,detail:document.querySelector('#scene-detail').textContent,
     errors:document.querySelectorAll('.scene-error,#runtime-error').length}));
    if(state.errors)throw new Error(JSON.stringify({t,size,state}));
    const path=`${outputDir}/gama-b2-${size.width}-${t}.png`;await page.screenshot({path});shots.push({t,path,...state});
   }
   results.push({size,...result,shots});
  }
  if(errors.length)throw new Error(errors.join('\n'));
  return results;
 }finally{page.off('pageerror',onError);}
}
