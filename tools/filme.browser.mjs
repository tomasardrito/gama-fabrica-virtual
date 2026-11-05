// Invoke with a Playwright Page. No browser dependency is added to the site.
export default async function verifyFilmMode(page, baseURL='http://127.0.0.1:8765/') {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];
  const onError=error=>errors.push(error.message);
  page.on('pageerror',onError);
  await page.route('**/*',route=>route.continue()); // Avoid stale ES modules during local review.
  await page.clock.install();
  await page.setViewportSize({width:1456,height:829});
  await page.goto(baseURL);
  await page.getByRole('button',{name:'▶ Iniciar filme'}).waitFor();
  assert(await page.getByRole('button').count()===1,'Only the start button should be visible');
  await page.getByRole('button',{name:'▶ Iniciar filme'}).click();
  await page.clock.fastForward(27000);
  await page.keyboard.press('Space');
  await page.clock.runFor(300);
  const paused=await page.locator('#elapsed-clock').innerText();
  await page.clock.fastForward(5000);
  assert(await page.locator('#elapsed-clock').innerText()===paused,'Space must freeze playback');
  assert(await page.getByRole('button').count()===0,'Controls visible after play');
  assert(await page.locator('input,select,[role=tab],a').count()===0,'Interactive navigation remains');
  assert(await page.locator('body').evaluate(e=>getComputedStyle(e).cursor)==='none','Idle cursor must disappear');
  assert(await page.locator('#world').evaluate(e=>getComputedStyle(e).pointerEvents)==='none','Pointer must not interrupt the directed camera');
  await page.mouse.move(700,400);
  assert(await page.locator('body').evaluate(e=>getComputedStyle(e).cursor)!=='none','Mouse movement should restore cursor');
  await page.keyboard.press('r');
  await page.clock.runFor(300);
  assert(await page.locator('#film-start').isHidden(),'Restart must keep film mode');
  assert(await page.locator('#elapsed-clock').innerText()==='00:00','R must restart from the opening');
  await page.keyboard.press('Space');
  const layouts=[];
  for(const size of [{width:1456,height:829},{width:1920,height:1080}]) {
    await page.setViewportSize(size);
    const result=await page.evaluate(async()=>{
      const {FactoryFilm}=await import('./factory-film.js');
      const {filmContext,trendHTML}=await import('./film-ui.js');
      const film=new FactoryFilm({preparedSchedule:(await (await import('/film-prepared.js')).loadPreparedFilm(new URL('/',location.href))).schedule}),panel=document.querySelector('#panel-content'),trend=document.querySelector('#film-trend');
      const failures=[],kinds=new Set();
      // Every half-second, including all eight reports and every spoken segment.
      for(let t=0;t<=600;t+=.5) {
        const s=film.seekPresentation(t),context=filmContext(s);kinds.add(context.kind);
        panel.dataset.kind=context.kind;panel.innerHTML=context.html;trend.innerHTML=trendHTML(s);
        for(const container of [panel,trend,document.querySelector('.control-panel'),document.querySelector('.command-deck')]) {
          const box=container.getBoundingClientRect();
          if(container.scrollHeight>container.clientHeight+1||container.scrollWidth>container.clientWidth+1)failures.push({t,kind:context.kind,container:container.id||container.className,reason:'overflow'});
          for(const node of container.querySelectorAll('*')) {
            const rect=node.getBoundingClientRect();
            if(rect.width&&rect.height&&(rect.bottom>box.bottom+1||rect.right>box.right+1||rect.left<box.left-1||rect.top<box.top-1))failures.push({t,kind:context.kind,reason:'outside bounds',text:node.textContent.slice(0,50)});
          }
        }
        if(failures.length)break;
      }
      return {samples:1201,kinds:[...kinds],failures};
    });
    assert(result.failures.length===0,`${size.width}×${size.height}: ${JSON.stringify(result.failures.slice(0,4))}`);
    layouts.push({size,...result});
  }
  await page.keyboard.press('r');
  await page.clock.fastForward(601000);
  await page.clock.runFor(300);
  assert(await page.locator('#elapsed-clock').innerText()==='10:00','Film should stop at 10:00');
  assert((await page.locator('#metric-shipped').innerText()).includes('44.825'),'Final shipped quantity changed');
  assert((await page.locator('#metric-backlog').innerText()).trim()==='0 un','Final backlog changed');
  await page.clock.fastForward(5000);
  assert(await page.locator('#elapsed-clock').innerText()==='10:00','Film repeated automatically');
  assert(await page.getByRole('button').count()===0,'Controls reappeared at the end');
  assert(await page.locator('.scene-error,#runtime-error').count()===0,'Runtime error shown');
  assert(errors.length===0,`JavaScript errors: ${errors.join('; ')}`);
  page.off('pageerror',onError);
  return {playback:'OK',layouts,errors};
}
