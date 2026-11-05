import {sampleFilmCard,loadFilmCredits,renderFilmCard} from './film-cards.js';
import {FactoryFilm} from './factory-film.js';
import {FilmAudio} from './film-audio.js';
import {FilmAmbience} from './film-ambience.js';
import {FilmPlayback} from './film-playback.js';
import {filmContext, filmChapter, sceneCaption, trendHTML} from './film-ui.js';
import {createFactoryScene,createAct2Demonstration} from './scene.js';
import * as prepared from './film-prepared.js';

const $=selector=>document.querySelector(selector);
const number=(v,d=0)=>Number(v??0).toLocaleString('pt-BR',{maximumFractionDigits:d});
const clock=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const credits=await loadFilmCredits();
// Paint the preparation state before compiling the validated operating schedule.
await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const audio=new FilmAudio();
await audio.prepare();
const ambience=new FilmAmbience();await ambience.prepare();
let sim,preparedFilm;
try{if(!prepared.loadPreparedFilm)throw new Error('Agenda W2 ainda não disponível');preparedFilm=await prepared.loadPreparedFilm(new URL('.',import.meta.url));sim=new FactoryFilm({preparedSchedule:preparedFilm.schedule,preparedDemonstration:preparedFilm.demonstration,audioDurations:Object.fromEntries([...audio.assets].map(([id,a])=>[id,a.duration]))});}catch(error){$('#film-preparing').textContent=`Não foi possível preparar o filme: ${error.message}`;$('#film-start').setAttribute('aria-busy','false');throw error;}
const player=new FilmPlayback(sim);
let state=sim.snapshot(),scene,lastFrame=null,lastUI=-Infinity,lastDialogue='',runtimeError=false,cursorTimer;
const chapters=[{t:0,label:'Abertura'},{t:25,label:'Problema'},{t:94,label:'Solução'},...Array.from({length:8},(_,i)=>({t:sim.plan.clock.inverse(135+i*46.875),label:`S${i+1}`})),{t:481,label:'Resultados'},{t:sim.plan.story.windows.closing[0],label:'Encerramento'}];
// Labels sit under their real stretch of the timeline (weeks differ in length).
$('#chapter-markers').innerHTML=chapters.map((chapter,i)=>`<span data-chapter="${i}" style="left:${chapter.t/6}%;width:${((chapters[i+1]?.t??600)-chapter.t)/6}%">${chapter.label}</span>`).join('');
$('#film-progress').insertAdjacentHTML('beforeend',chapters.slice(1).map(chapter=>`<span class="chapter-tick" aria-hidden="true" style="left:${chapter.t/6}%"></span>`).join(''));
try{scene=createFactoryScene($('#world'),{signage:'physical',demonstration:createAct2Demonstration(preparedFilm.demonstration)});scene.direct(state.film.shot);scene.update(state,0);$('#film-start').setAttribute('aria-busy','false');$('#film-preparing').hidden=true;}catch(error){scene?.destroy();scene=null;$('#film-start').setAttribute('aria-busy','false');$('#film-preparing').hidden=true;$('#world').insertAdjacentHTML('beforeend','<div class="scene-error" role="alert"><b>Não foi possível preparar a fábrica.</b><br>Recarregue a página para tentar novamente.</div>');console.error(error);}

function showCursor(){
 document.body.classList.remove('cursor-idle');
 clearTimeout(cursorTimer);
 if(player.started)cursorTimer=setTimeout(()=>document.body.classList.add('cursor-idle'),2000);
}
function updatePlayback(){
 $('#film-start').hidden=player.started;
 document.body.classList.toggle('film-started',player.started);
 $('#playback-status').hidden=!player.started||player.playing||state.film.presentationTime>=600;
 audio.sync(state,player.playing,1);
}
function togglePlayback(){
 if(runtimeError||!scene)return;
 player.toggle();ambience.start();
 if(player.playing)void audio.prepare();
 lastFrame=performance.now();
 updatePlayback();showCursor();
}
function restart(){
 if(!scene)return;
 audio.reset();ambience.reset();ambience.start();player.restart();state=sim.snapshot();lastFrame=performance.now();lastDialogue='';runtimeError=false;
 $('#runtime-error')?.remove();$('#pcp-dialogue').hidden=true;
 scene.resetView();scene.direct(state.film.shot);
 void audio.prepare();updatePlayback();renderUI();showCursor();
}
function momentKey(s){
 const f=s.film;if(!f||f.breakdownSequence)return '';
 // Conversations keep one card on screen from the first relevant line to the
 // end of the scene, including the pauses between lines.
 const t=f.presentationTime,story=f.story,line=id=>story.speeches.find(x=>x.id===id);
 if(f.act==='problem'&&t>=line('F04').start&&t<(story.walks[0]?.start??94))return 'problem';
 if(f.shot?.visualId==='drone')return '';
 if(f.act==='solution')return f.demonstration?'demonstration':t>=story.walks[0].start?'tour':'';
 if(f.comparison)return 'comparison';if(f.mct)return 'mct';if(f.showFinal)return 'final';
 if(f.report)return `report-${f.report.week}`;
 if(f.journey)return 'journey';
 if(['quadro-pulmao','abrasivo'].includes(f.shot.visualId))return `visual-${f.shot.visualId}`;
 return '';
}
function replaceHTML(node,html){if(node.innerHTML!==html)node.innerHTML=html;}
function renderUI(){
 const buffer=state.buffer,rope=state.dbr.rope,zone={green:'Verde',yellow:'Amarela',red:'Vermelha'}[buffer.zone];
 $('#chapter-title').textContent=filmChapter(state);
 // Before Ato 2 the DBR does not exist yet: hide its live indicators.
 document.body.dataset.act=state.film?.act||'';
 $('#pace-clock').hidden=!state.film.shot.accelerated;
 $('#pace-clock i').style.transform=`rotate(${state.film.presentationTime*220}deg)`;
 $('#elapsed-clock').textContent=clock(state.film.presentationTime);
 $('#film-progress').setAttribute('aria-valuenow',state.film.presentationTime.toFixed(1));
 $('#film-progress').setAttribute('aria-valuetext',`${clock(state.film.presentationTime)} de 10:00`);
 $('#film-progress i').style.width=`${state.film.presentationTime/6}%`;
 document.querySelectorAll('[data-chapter]').forEach((node,i)=>{node.classList.toggle('current',state.film.presentationTime>=chapters[i].t&&state.film.presentationTime<(chapters[i+1]?.t??601));node.classList.toggle('complete',state.film.presentationTime>=(chapters[i+1]?.t??601));});
 $('#metric-produced').innerHTML=`${number(state.completed)} <small>un</small>`;
 $('#metric-shipped').innerHTML=`${number(state.shipped)} <small>un</small>`;
 $('#metric-backlog').innerHTML=`${number(state.backlog)} <small>un</small>`;
 $('#sco-hour').textContent=`${state.film.shot.accelerated?'◷ TEMPO ACELERADO · ':''}${number(state.dbr.workHours,1)} h úteis`;
 $('#sco-buffer-units').textContent=number(buffer.units,1);
 $('#sco-buffer-zone').textContent=`${zone} · ${Math.round(buffer.units/buffer.target*100)}%`;
 $('.sco-overview').dataset.zone=buffer.zone;
 $('#sco-zone-marker').style.left=`${Math.min(100,buffer.units/buffer.target*100)}%`;
 $('#sco-drum-rate').textContent=number(state.dbr.drum.rate,2);
 $('#sco-rope-status').textContent={normal:'Normal',priority:'Prioridade',stop:'Travada'}[rope.status];
 $('#sco-next-call').textContent=`${rope.authorizedLots} lotes autorizados`;
 // Cards appear at the moments that matter instead of a fixed side panel.
 const moment=momentKey(state),panel=$('#panel-content'),aside=$('.control-panel');
 if(moment){const context=filmContext(state);panel.dataset.kind=context.kind;replaceHTML(panel,context.html);}
 if(document.body.dataset.moment!==moment){document.body.dataset.moment=moment;if(moment){aside.classList.remove('card-in');void aside.offsetWidth;aside.classList.add('card-in');}}
 replaceHTML($('#film-trend'),trendHTML(state));
 const brk=state.film.breakdownSequence,hud=$('#breakdown-hud');hud.hidden=!brk;
 if(brk){const n=(v,d=0)=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d}),pct=Math.max(0,Math.min(100,brk.buffer/3571.3*100));
  const rosq=brk.phase==='before'?['ok','OPERANDO','']:brk.phase==='broken'?['bad','PARADA',`${n(brk.brokenHours,1)} / ${n(brk.repairHours)} h de reparo`]:['warn','VOLTOU','prioridade até o pulmão voltar ao verde'];
  replaceHTML(hud,`<div class="brk-title">QUEBRA DA ROSQUEADORA · <span>o pulmão em ação</span></div>
  <div class="brk-row"><span>Rosqueadora</span><b class="${rosq[0]}">${rosq[1]}</b><small>${rosq[2]}</small></div>
  <div class="brk-buffer"><div class="brk-row"><span>Pulmão</span><b class="${brk.zone==='green'?'ok':brk.zone==='yellow'?'warn':'bad'}">${n(brk.buffer)} un</b><small>${brk.zone==='green'?'verde':brk.zone==='yellow'?'amarelo · consumindo a proteção':'vermelho'}</small></div>
   <div class="brk-meter"><i class="r"></i><i class="y"></i><i class="g"></i><em style="left:${pct}%"></em></div><div class="brk-scale"><span>0</span><span>1.250</span><span>2.500</span><span>3.571</span></div></div>
  <div class="brk-row"><span>Tambor · Montagem 1</span><b class="ok">PRODUZINDO</b><small>${n(brk.drumIdle)} h parado</small></div>
  <div class="brk-ghost"><span>Sem pulmão (mesma quebra)</span><b>${n(brk.ghostIdle,0)} h de tambor parado</b><small>−${n(brk.ghostLost)} un${brk.ghostIdle>=brk.ghostTotal?` · −R$ ${n(brk.ghostGain/1e6,2)} mi de ganho`:''}</small></div>
  <p class="brk-source">Agenda da simulação · cenário sem pulmão: Simulação DBR!L6:M13</p>`);}
 const caption=sceneCaption(state);
 $('#scene-sector').textContent=caption.sector;
 $('#scene-detail').textContent=caption.detail;
 renderFilmCard($('#film-card'),player.started?sampleFilmCard(state.film.presentationTime,credits):null);
 updatePlayback();
}
function updateDialogue(){
 const speech=player.started?state.film.speech:null,bubble=$('#pcp-dialogue');
 if(!speech){bubble.hidden=true;return;}
 const key=`${speech.id}:${speech.segmentId}`;
 if(lastDialogue!==key){$('#dialogue-speaker').textContent=`${speech.speaker} · ${state.film.actors[speech.speaker].role}`;$('#dialogue-text').textContent=speech.text;lastDialogue=key;}
 bubble.hidden=false;
 const world=$('#world'),anchor=scene?.projectActor(speech.speaker),reserve=(document.body.dataset.moment||!$('#breakdown-hud').hidden)?376:0,width=Math.min(780,world.clientWidth-48-reserve);
 bubble.style.width=`${width}px`;
 const height=bubble.offsetHeight,x=anchor?.visible?anchor.x:world.clientWidth/2;
 const left=Math.max(24,Math.min(world.clientWidth-width-24-reserve,x-width/2));
 const top=anchor?.visible?Math.max(24,Math.min(world.clientHeight-height-100,anchor.y-height-28)):world.clientHeight-height-100;
 bubble.classList.toggle('subtitle-fallback',!anchor?.visible);
 bubble.style.left=`${left}px`;bubble.style.top=`${top}px`;
 bubble.style.setProperty('--tail-x',`${Math.max(22,Math.min(width-22,x-left))}px`);
}
$('#start-film').onclick=event=>{event.currentTarget.blur();togglePlayback();};
$('#start-film').disabled=!scene;
// No visible controls or pointer navigation remain after the initial click.
function setSpeed(value){player.setSpeed(value);audio.rate=player.speed;document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===player.speed));}
document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',event=>{event.stopPropagation();setSpeed(Number(b.dataset.speed));b.blur();}));
window.addEventListener('pointermove',showCursor,{passive:true});
window.addEventListener('keydown',event=>{
 if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.code==='Space'){event.preventDefault();togglePlayback();}
 else if(event.key.toLowerCase()==='r'){event.preventDefault();restart();}
 else if(['1','2','4'].includes(event.key)){event.preventDefault();setSpeed(Number(event.key));}
});
document.addEventListener('visibilitychange',()=>{lastFrame=null;if(document.hidden){player.pause();updatePlayback();}});
function frame(timestamp){
 const dt=lastFrame===null?0:Math.max(0,(timestamp-lastFrame)/1000);lastFrame=timestamp;
 try{
  if(!runtimeError){
   player.advance(dt);state=sim.snapshot();audio.sync(state,player.playing,1);ambience.update(state,player.playing,player.speed);
   scene?.direct(state.film.shot);
   scene?.update(state,dt,{transportPlaying:player.playing,playbackStarted:player.started});
   updateDialogue();renderFilmCard($('#film-card'),player.started?sampleFilmCard(state.film.presentationTime,credits):null);
   if(timestamp-lastUI>=250){renderUI();lastUI=timestamp;}
  }
 }catch(error){
  player.pause();runtimeError=true;audio.reset();updatePlayback();$('#pcp-dialogue').hidden=true;
  if(!$('#runtime-error'))$('#workspace').insertAdjacentHTML('beforeend','<div id="runtime-error" class="runtime-error" role="alert"><strong>Execução pausada.</strong><span>Não foi possível atualizar a fábrica. Pressione R para reiniciar.</span></div>');
  console.error(error);
 }
 requestAnimationFrame(frame);
}
renderUI();requestAnimationFrame(frame);

// Browser QA samples the same live renderer and state used by playback.
export function reviewFrame(presentationTime){
 player.pause();player.started=true;state=sim.seekPresentation(presentationTime);
 scene.resetView();scene.direct(state.film.shot);scene.update(state,0,{playbackStarted:true,transportPlaying:false});
 renderUI();updateDialogue();
 return {presentationTime:state.film.presentationTime,operationTime:state.elapsed,shipped:state.shipped,backlog:state.backlog,actors:state.film.actors,shot:state.film.shot,demonstration:state.film.demonstration};
}
export {sim as film,scene,player};
