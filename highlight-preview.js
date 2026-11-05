import {FactoryFilm} from './factory-film.js';
import {createFactoryScene} from './scene.js';
import {selectPreviewHighlights} from './film-highlights.js';
import {createTimeMap} from './film-time-map.js';
import {loadPreparedPreview} from './film-prepared.js';
import {sampleLogisticsTruck} from './logistics-motion.js';
import {sampleDbrHandling} from './dbr-handling.js';

const $=selector=>document.querySelector(selector),number=n=>Math.round(n).toLocaleString('pt-BR');
const format=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
let ready=false,started=false,playing=false,time=0,lastFrame=null,lastUI=-1,scene,film,clock,manifest,latest;
function shotFor(sample,snapshot){
 const {segment,sourceTime}=sample,m=manifest.mission,trip=film.schedule.trips.find(t=>t.id===manifest.trip.id);
 const base={id:segment.id,type:'travelling',transitionSeconds:1.25,orbit:.26,target:'overview',sector:'overview'};
 if(segment.kind==='jack')return {...base,id:'delivery-sequence',position:[(m.from[0]+m.to[0])/2,(m.from[1]+m.to[1])/2-1.5],span:23,cameraHeight:16,orbit:.3,target:'m2',sector:'internal-transport'};
 if(segment.kind==='fast-dock')return {...base,position:[6,23],span:42,cameraHeight:35,orbit:.3,target:'dispatch',sector:'dispatch'};
 if(segment.kind==='loading'){
  const load=sampleDbrHandling(snapshot).loads.get(manifest.trip.trackedLotId),p=load?.position??[16,27];
  return {...base,id:'loading-sequence',position:[p[0]*.7+16*.3,p[1]+1],span:23,cameraHeight:18,orbit:.55,target:'dispatch',sector:'dispatch'};
 }
 if(segment.kind==='truck'){
  const truck=sampleLogisticsTruck([trip],Math.min(sourceTime,trip.exitAt-.0001));
  const p=truck.position;
  return {...base,position:[p[0],p[2]-1],span:segment.id==='arrival'?31:segment.id==='departure'?33:26,cameraHeight:23,orbit:segment.id==='departure'?.5:-.65,target:'dispatch',sector:'dispatch'};
 }
 return {...base,type:'geral',position:[3,7],span:77,cameraHeight:53,orbit:.12};
}
const details={
 fast:{tag:'A FÁBRICA INTEIRA',title:'O fluxo não para.',description:'Os intervalos passam mais rápido. Nos destaques, chegamos perto.',steps:['Personalização','Montagem e inspeção','Coleta diária']},
 jack:{tag:'ENTRE AS MONTAGENS',title:'Um pallet. Uma entrega.',description:'O operador leva o lote na paleteira até a próxima máquina.',steps:['Retirar o pallet','Transportar pela célula','Posicionar na chegada']},
 truck:{tag:'EXPEDIÇÃO',title:'A entrega começa aqui.',description:'Da entrada no pátio à saída, uma coleta vista de perto.',steps:['Chegar e manobrar','Carregar pela doca','Fechar e partir']},
 loading:{tag:'EXPEDIÇÃO',title:'Cada pallet a bordo.',description:'A empilhadeira acessa o caminhão pela plataforma niveladora.',steps:['Chegar e manobrar','Carregar pela doca','Fechar e partir']},
};
function renderUI(sample,s){
 const kind=sample.segment.kind,d=details[kind==='fast-dock'?'truck':kind],fast=kind.startsWith('fast');
 $('#pace-label').textContent=fast?'TEMPO ACELERADO':'EM DESTAQUE';
 const hours=s.dbr.workHours,local=hours%120;
 $('#week').textContent=`Semana ${s.week} · ${String(Math.floor(local/24)+1)}º dia`;
 $('#hand').style.transform=`rotate(${fast?time*220:time*12}deg)`;
 $('#context-tag').textContent=d.tag;$('#context-title').textContent=d.title;$('#context-description').textContent=d.description;
 const m=manifest.mission,tr=manifest.trip;
 $('#identity').innerHTML=kind==='jack'?`<b>${m.lotId} · ${m.product}</b><br>${number(m.quantity)} unidades · Montagem 1 → 2`:kind==='truck'||kind==='loading'||kind==='fast-dock'?`<b>Doca ${String(tr.dockIndex+1).padStart(2,'0')}</b><br>${tr.pallets} pallets · ${number(tr.quantity)} unidades`:`<b>Família Z · Personalizados</b><br>8 semanas de produção`;
 let active=0;
 if(kind==='jack')active=sample.segment.id==='delivered'?2:sample.segment.id==='settle'?0:sample.progress<.06?0:sample.progress>.94?2:1;
 else if(kind==='truck'||kind==='loading'||kind==='fast-dock')active=['departure','closing'].includes(sample.segment.id)?2:kind==='loading'||kind==='fast-dock'?1:0;
 else active=Math.floor(time/2)%3;
 $('#steps').innerHTML=d.steps.map((text,i)=>`<li class="${i===active?'active':''}">${text}</li>`).join('');
 $('#scene-kicker').textContent=fast?'VISTA GERAL · TEMPO ACELERADO':kind==='jack'?'MONTAGEM 1 → MONTAGEM 2':'EXPEDIÇÃO · COLETA DIÁRIA';
 $('#scene-title').textContent=sample.segment.title;
 $('#buffer-value').textContent=number(s.buffer.units);
 $('#zone').textContent=s.buffer.zone==='green'?'Verde':s.buffer.zone==='yellow'?'Amarelo':'Vermelho';
 $('#buffer-marker').style.left=`${Math.min(100,s.buffer.units/s.buffer.target*100)}%`;
 $('#shipped').innerHTML=`${number(s.shipped)} <small>un</small>`;$('#backlog').textContent=`${number(s.backlog)} em atraso`;
 $('#time').innerHTML=`${format(time)} <small>/ ${format(clock.duration)}</small>`;
 $('#progress-fill').style.width=`${time/clock.duration*100}%`;
 $('#paused').hidden=!started||playing||time>=clock.duration;
 $('#footer-note').textContent=time>=clock.duration?'Fim da prévia · R para rever':'Prévia visual · Espaço pausa · R reinicia';
}
function render(dt=0){
 const sample=clock.sample(time),s=film.seek(sample.sourceTime),shot=shotFor(sample,s);
 // All samplers retain the original elapsed/animationTime. Only the camera
 // transition uses wall time; it must not jump during accelerated intervals.
 s.film={...s.film,shot,speech:null,audioSpeech:null,demonstration:null,presentationTime:time};
 latest={sample,snapshot:s,shot};scene.direct(shot);scene.update(s,dt,{transportPlaying:playing,playbackStarted:started});
 if(Math.abs(time-lastUI)>.08||dt===0||!playing){renderUI(sample,s);lastUI=time;}
}
function start(){if(!ready)return;started=true;playing=true;document.body.classList.add('started');lastFrame=performance.now();render();}
$('#start').addEventListener('click',start);
window.addEventListener('keydown',event=>{
 if(!ready)return;
 if(event.code==='Space'){event.preventDefault();if(!started)start();else{playing=!playing;lastFrame=performance.now();render();}}
 if(event.key.toLowerCase()==='r'){time=0;scene.resetView();start();}
});
function frame(now){
 const dt=lastFrame===null?0:Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
 if(ready&&playing){time=Math.min(clock.duration,time+dt);if(time>=clock.duration)playing=false;render(dt);}
 requestAnimationFrame(frame);
}
try{
 const loaded=await loadPreparedPreview();manifest={...loaded.manifest,...selectPreviewHighlights(loaded.schedule)};clock=createTimeMap(manifest.segments);
 film=new FactoryFilm({preparedSchedule:loaded.schedule});
 scene=createFactoryScene($('#world'),{demonstration:null,signage:'physical'});
 ready=true;render();$('#start').disabled=false;$('#start').textContent=`▶ Ver prévia · ${format(clock.duration)}`;
 // Read-only diagnostics and deterministic seeking for local visual QA.
 window.gamaPreview={get ready(){return ready;},manifest,get state(){return latest;},getOperationalState:()=>scene.getOperationalState(),seek(seconds){time=Math.max(0,Math.min(clock.duration,seconds));started=true;playing=false;document.body.classList.add('started');scene.resetView();render();return {time,sourceTime:latest.sample.sourceTime,segment:latest.sample.segment.id};}};
 requestAnimationFrame(frame);
}catch(error){$('#start').textContent='Prévia indisponível';$('#start-note').textContent=error.message;console.error(error);}
