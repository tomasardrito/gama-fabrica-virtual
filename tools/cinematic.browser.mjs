// Pass an isolated Playwright Page. Uses the actual bootstrap, prepared assets,
// renderer and playback; installs no dependency and never invokes a planner.
export default async function verifyCinematic(page,baseURL,outputDir='/tmp'){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results=[];
 for(const size of [{width:1456,height:829},{width:1920,height:1080}]){
  await page.setViewportSize(size);await page.goto(baseURL);
  await page.locator('#start-film:not([disabled])').waitFor({timeout:30000});
  await page.getByRole('button',{name:'▶ Iniciar filme'}).click();
  const times=await page.evaluate(async()=>{const {film}=await import('./app.js');return [...new Set([0,22,30,98,110,125,...film.plan.selection.highlights.flatMap(h=>[(h.presentation[0]+h.presentation[1])/2]),...film.plan.story.speeches.flatMap(s=>s.segments.map(c=>c.start+.01)),566,575,585,590,595,600])].sort((a,b)=>a-b);});
  const samples=[];
  for(const t of times){
   const result=await page.evaluate(async t=>{
    const app=await import('./app.js'),state=app.reviewFrame(t),failures=[];
    for(const selector of ['body','.control-panel','#panel-content','#film-trend','#workspace']){const node=document.querySelector(selector);if(node.scrollHeight>node.clientHeight+1||node.scrollWidth>node.clientWidth+1)failures.push(`${selector}: overflow`);}
    if([...document.querySelectorAll('button,input,select,[role=tab]')].some(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height))failures.push('visible controls');
    const speech=app.film.snapshot().film.speech;if(speech){const p=document.querySelector('#dialogue-text'),style=getComputedStyle(p);if(p.scrollHeight>p.clientHeight+1||parseFloat(style.fontSize)<18)failures.push('speech clipped or too small');if(p.textContent!==app.film.snapshot().film.audioSpeech.text)failures.push('incomplete speech balloon');}
    if(speech&&!app.scene.projectActor(speech.speaker).visible)failures.push(`speaker offscreen: ${speech.speaker}`);
    if(state.backlog!==0)failures.push('backlog');
    if(t>=590&&Object.values(state.actors).some(a=>a.exitPhase!=='exited'))failures.push('unfinished exit');
    return {...state,failures};
   },t);
   if(result.failures.length)throw new Error(`${size.width} ${t}: ${result.failures.join(', ')}`);
   samples.push(result);
  }
  for(const t of [22,110,210,340,420,575,585,595]){await page.evaluate(async t=>(await import('./app.js')).reviewFrame(t),t);await page.screenshot({path:`${outputDir}/gama-b2-${size.width}-${t}.png`});}
  results.push({size,samples});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 return {results,errors};
}
