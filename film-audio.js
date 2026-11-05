import {AUDIO} from './film-dialogue.js';
export class FilmAudio{
 constructor(){this.rate=1;this.enabled=true;this.assets=new Map();this.player=new Audio();this.player.preload='metadata';this.activeId=null;this.loading=false;this.status='Áudios opcionais';}
 async prepare(){if(this.loading)return;this.loading=true;await Promise.all(Object.entries(AUDIO).map(async([id,src])=>{try{const response=await fetch(src,{method:'HEAD'});if(!response.ok||!/^audio\//.test(response.headers.get('content-type')||''))return;const audio=new Audio(src);const duration=await new Promise(resolve=>{audio.onloadedmetadata=()=>resolve(audio.duration);audio.onerror=()=>resolve(null);setTimeout(()=>resolve(null),5000);});if(duration>0)this.assets.set(id,{src,duration});}catch{}}));this.status=this.assets.size?`${this.assets.size} áudios disponíveis`:'Balões sem áudio';}
 setEnabled(value){this.enabled=!!value;this.player.muted=!this.enabled;}
 sync(s,playing,speed){const speech=s.film?.audioSpeech||s.film?.speech;if(!speech||!this.assets.has(speech.id)){this.player.pause();this.activeId=null;return;}const asset=this.assets.get(speech.id),speechTime=((s.film?.presentationTime??s.elapsed)-speech.start);
  if(this.activeId!==speech.id){this.player.pause();this.player.src=asset.src;this.activeId=speech.id;}
  this.player.muted=!this.enabled;this.player.playbackRate=this.rate||1;if(Number.isFinite(this.player.duration)&&Math.abs(this.player.currentTime-speechTime)>.4*(this.rate||1))this.player.currentTime=Math.min(this.player.duration,speechTime);
  if(playing&&this.enabled&&this.player.paused)this.player.play().catch(()=>{});if(!playing)this.player.pause();
 }
 reset(){this.player.pause();this.player.currentTime=0;this.activeId=null;}
}
