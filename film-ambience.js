// Factory ambience: a recorded background loop (audio/ambiente-fabrica.*) when
// present, otherwise a synthesized machine hum; plus synthesized footsteps and
// forklift reverse beeps. It ducks under dialogue, is muffled inside the
// meeting room, follows pause and 2x/4x, and never touches the film clock.
import {cinematicState} from './factory-cinematic.js';
const LOOP_CANDIDATES=['audio/ambiente-fabrica.mp3','audio/ambiente-fabrica.m4a','audio/ambiente-fabrica.wav','audio/ambiente-fabrica.ogg'];
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export class FilmAmbience{
 constructor(){this.ctx=null;this.loopSrc=null;this.lastStep=0;this.nextBeep=0;this.enabled=true;}
 async prepare(){for(const src of LOOP_CANDIDATES){try{const r=await fetch(src,{method:'HEAD'});if(r.ok&&/^audio\//.test(r.headers.get('content-type')||'')){this.loopSrc=src;break;}}catch{}}return this.loopSrc;}
 // Must be called from a user gesture (the start button).
 start(){
  if(this.ctx){this.ctx.resume?.();return;}
  const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
  const ctx=this.ctx=new Ctx();
  this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
  this.room=ctx.createBiquadFilter();this.room.type='lowpass';this.room.frequency.value=18000;this.room.connect(this.master);
  this.bed=ctx.createGain();this.bed.gain.value=0;this.bed.connect(this.room);
  this.fx=ctx.createGain();this.fx.gain.value=.9;this.fx.connect(this.room);
  if(this.loopSrc){const el=this.loopEl=new Audio(this.loopSrc);el.loop=true;el.crossOrigin='anonymous';ctx.createMediaElementSource(el).connect(this.bed);this.bedLevel=.55;}
  else this.synthBed();
  this.noise=this.makeNoise(2);
  this.truckEngine();
  this.gateMotor();
 }
 // Industrial roll-up door: motor hum + chain rattle while moving, thuds at the ends.
 gateMotor(){
  const ctx=this.ctx;this.gateGain=ctx.createGain();this.gateGain.gain.value=0;this.gateGain.connect(this.fx);
  const m=ctx.createOscillator();m.type='sawtooth';m.frequency.value=92;const ml=ctx.createBiquadFilter();ml.type='lowpass';ml.frequency.value=420;const mg=ctx.createGain();mg.gain.value=.22;m.connect(ml).connect(mg).connect(this.gateGain);m.start();this.gateOsc=m;
  const n=ctx.createBufferSource();n.buffer=this.makeNoise(2);n.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=2300;bp.Q.value=2.2;
  const rattle=ctx.createGain();rattle.gain.value=0;const lfo=ctx.createOscillator();lfo.type='square';lfo.frequency.value=13;const lg=ctx.createGain();lg.gain.value=.16;lfo.connect(lg).connect(rattle.gain);n.connect(bp).connect(rattle).connect(this.gateGain);n.start();lfo.start();
 }
 thud(volume=.5){const ctx=this.ctx,t=ctx.currentTime,o=ctx.createOscillator();o.type='sine';o.frequency.setValueAtTime(120,t);o.frequency.exponentialRampToValueAtTime(45,t+.25);const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.01);g.gain.exponentialRampToValueAtTime(.0005,t+.45);o.connect(g).connect(this.fx);o.start(t);o.stop(t+.5);
  const s=ctx.createBufferSource();s.buffer=this.noise;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=900;const sg=ctx.createGain();sg.gain.setValueAtTime(volume*.5,t);sg.gain.exponentialRampToValueAtTime(.0005,t+.2);s.connect(bp).connect(sg).connect(this.fx);s.start(t,0,.25);}
 gate(s,f){
  const ctx=this.ctx,now=ctx.currentTime,st=cinematicState(f.presentationTime,{windows:f.story?.windows}),g=st.active?st.gate:null;
  const moving=g!=null&&this.lastGate!=null&&Math.abs(g-this.lastGate)>1e-4&&g>.001&&g<.999;
  if(moving&&!this.gateMoving)this.thud(.45);
  if(!moving&&this.gateMoving)this.thud(.55);
  this.gateMoving=moving;this.lastGate=g;
  this.gateGain.gain.setTargetAtTime(moving?.9:0,now,moving?.08:.12);
  if(moving)this.gateOsc.frequency.setTargetAtTime(88+10*Math.sin(f.presentationTime*7),now,.1);
 }
 // Diesel truck: two detuned saws through a low-pass, plus a rumble.
 truckEngine(){
  const ctx=this.ctx;this.truckGain=ctx.createGain();this.truckGain.gain.value=0;this.truckGain.connect(this.fx);
  const lp=this.truckLp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=260;lp.Q.value=.8;lp.connect(this.truckGain);
  this.truckOsc=[38,38.7,76].map((f,i)=>{const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=f;const g=ctx.createGain();g.gain.value=i<2?.32:.12;o.connect(g).connect(lp);o.start();return o;});
  const r=ctx.createBufferSource();r.buffer=this.makeNoise(2);r.loop=true;const rl=ctx.createBiquadFilter();rl.type='lowpass';rl.frequency.value=180;const rg=ctx.createGain();rg.gain.value=.35;r.connect(rl).connect(rg).connect(lp);r.start();
 }
 hiss(volume=.12){const ctx=this.ctx,t=ctx.currentTime,s=ctx.createBufferSource();s.buffer=this.noise;const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=2600;const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.03);g.gain.exponentialRampToValueAtTime(.0005,t+.8);s.connect(hp).connect(g).connect(this.fx);s.start(t,0,.9);}
 truck(s,f,speed,inRoom){
  const ctx=this.ctx,now=ctx.currentTime,op=s.elapsed??0,trip=(s.trips||[]).find(tr=>Number.isFinite(tr.arrivalAt)&&op>=tr.arrivalAt&&op<(tr.exitAt??tr.departAt+3));
  const near=f.shot?.target==='truck'||f.shot?.sector==='dispatch'||f.shot?.tripId,phase=!trip?null:op<(tr=>tr.reverseAt??tr.arrivalAt)(trip)?'arrive':op<(trip.dockAt??trip.loadStart)?'reverse':op<(trip.departAt??trip.loadEnd)?'idle':'depart';
  // Progress inside the current phase drives loudness (approach / leave) and RPM.
  const span=(a,b)=>Math.max(0,Math.min(1,(op-a)/Math.max(1e-6,b-a)));
  const p=!trip?0:phase==='arrive'?span(trip.arrivalAt,trip.reverseAt):phase==='reverse'?span(trip.reverseAt,trip.dockAt??trip.loadStart):phase==='depart'?span(trip.departAt,trip.exitAt??trip.departAt+3):0;
  const featured=!!f.shot?.tripId,shape=phase==='arrive'?.45+.45*p:phase==='reverse'?.75+.25*p:phase==='idle'?.4:1-.75*p;
  const level=!trip||inRoom?0:shape*(featured?1:near?.55:.16);
  this.truckGain.gain.setTargetAtTime(level*(featured?.95:.6),now,.15);
  // Departure: pull away in first gear, shift, then second gear fading out.
  const rpm=phase==='depart'?(p<.5?.95+1.5*p:.95+1.5*(p-.45)):phase==='arrive'?1.3-.35*p:phase==='reverse'?1.12:.82;
  this.truckOsc.forEach((o,i)=>o.frequency.setTargetAtTime([38,38.7,76][i]*rpm,now,.12));this.truckLp.frequency.setTargetAtTime(220*rpm*(featured?1.25:1),now,.12);
  const key=trip?.id;
  if(phase!==this.truckPhase||key!==this.truckId){if(trip&&!inRoom&&(phase==='idle'||phase==='depart')&&this.truckPhase&&this.truckId===key)this.hiss(featured?.22:near?.12:.04);this.truckPhase=phase;this.truckId=key;}
  if(phase==='reverse'&&!inRoom){const t=f.presentationTime;if(t-(this.lastReverseBeep??-9)>=.9||t<(this.lastReverseBeep??-9)){this.beep(featured?.11:near?.05:.015,1000,1);this.lastReverseBeep=t;}}
 }
 makeNoise(seconds){const ctx=this.ctx,b=ctx.createBuffer(1,ctx.sampleRate*seconds,ctx.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=w;}return b;}
 synthBed(){
  const ctx=this.ctx;this.bedLevel=.5;
  // Brown-ish rumble + electric hum + a slow pulsing press.
  const n=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),d=n.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;d[i]=last*3.2;}
  const src=ctx.createBufferSource();src.buffer=n;src.loop=true;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=420;const g=ctx.createGain();g.gain.value=.55;src.connect(lp).connect(g).connect(this.bed);src.start();
  for(const [f,v]of [[50,.05],[100,.03],[150,.012]]){const o=ctx.createOscillator();o.frequency.value=f;const og=ctx.createGain();og.gain.value=v;o.connect(og).connect(this.bed);o.start();}
  const press=ctx.createOscillator();press.type='triangle';press.frequency.value=0.9;const pg=ctx.createGain();pg.gain.value=.025;const carrier=ctx.createOscillator();carrier.frequency.value=72;const cg=ctx.createGain();cg.gain.value=0;press.connect(pg).connect(cg.gain);carrier.connect(cg).connect(this.bed);press.start();carrier.start();
 }
 step(volume=.18,pitch=1){const ctx=this.ctx,t=ctx.currentTime,s=ctx.createBufferSource();s.buffer=this.noise;s.playbackRate.value=.7+.3*pitch;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=900+Math.random()*500;bp.Q.value=1.4;const g=ctx.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.006);g.gain.exponentialRampToValueAtTime(.0005,t+.09);s.connect(bp).connect(g).connect(this.fx);s.start(t,Math.random()*1.5,.12);}
 beep(volume=.035,freq=1250,count=2){const ctx=this.ctx,t=ctx.currentTime;for(const k of [0,.45].slice(0,count)){const o=ctx.createOscillator();o.type='square';o.frequency.value=freq;const g=ctx.createGain();g.gain.setValueAtTime(0,t+k);g.gain.linearRampToValueAtTime(volume,t+k+.01);g.gain.setValueAtTime(volume,t+k+.2);g.gain.linearRampToValueAtTime(0,t+k+.23);const hp=ctx.createBiquadFilter();hp.type='bandpass';hp.frequency.value=freq;o.connect(hp).connect(g).connect(this.fx);o.start(t+k);o.stop(t+k+.25);}}
 update(s,playing,speed=1){
  if(!this.ctx||!s?.film)return;const ctx=this.ctx,f=s.film,t=f.presentationTime,now=ctx.currentTime;
  if(!playing||!this.enabled){if(ctx.state==='running')ctx.suspend();this.loopEl?.pause();return;}
  if(ctx.state!=='running')ctx.resume();if(this.loopEl&&this.loopEl.paused)this.loopEl.play().catch(()=>{});
  // Level by act: lights come up in the opening; muffled in the meeting room; fade at the end.
  const opening=smooth((t-6)/10),closing=1-smooth((t-(f.story?.windows?.exit?.[1]??590))/((f.story?.windows?.credits?.[0]??595)-(f.story?.windows?.exit?.[1]??590))),inRoom=f.shot?.type==='geral-sala'||f.act==='problem';
  const bed=(this.bedLevel??.5)*opening*closing*(f.speech?.id?.length?.42:1);
  this.bed.gain.setTargetAtTime(bed,now,.25);this.master.gain.setTargetAtTime(.9,now,.3);
  this.room.frequency.setTargetAtTime(inRoom?650:16000,now,.35);
  // Footsteps: staff entering (opening), the tour walks, people walking on screen, the exit.
  const walkers=Object.values(f.actors||{}).filter(a=>a.walking&&a.visible!==false).length+(t>9&&t<19?6:0)+(t>=(f.story?.windows?.exit?.[0]??565)&&t<(f.story?.windows?.exit?.[1]??590)?4:0);
  if(walkers>0){const interval=.52/Math.min(3,Math.sqrt(walkers))/speed;if(t-this.lastStep>=interval*speed||t<this.lastStep){this.step(Math.min(.42,.17+.042*walkers)*(inRoom?.6:1),Math.random());this.lastStep=t;}}
  this.truck(s,f,speed,inRoom);
  this.gate(s,f);
  // Forklift reverse beeps while the plant is running.
  if(f.act==='weeks'&&!inRoom){if(t<this.nextBeep-30)this.nextBeep=t;if(t>=this.nextBeep){if(this.nextBeep)this.beep();this.nextBeep=t+(7+Math.random()*9)*Math.max(1,speed/2);}}
 }
 reset(){this.lastGate=null;this.gateMoving=false;this.lastStep=0;this.nextBeep=0;this.truckPhase=null;this.truckId=null;this.lastReverseBeep=-9;}
}
