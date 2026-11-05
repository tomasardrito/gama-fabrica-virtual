import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimeMap} from '../film-time-map.js';
test('presentation clock inverse preserves boundaries and intermediate times',()=>{
 const map=createTimeMap([{from:0,to:135,duration:200},{from:135,to:510,duration:300},{from:510,to:600,duration:100}]);
 for(let t=0;t<=600;t+=0.5) assert.ok(Math.abs(map.inverse(map.sample(t).sourceTime)-t)<1e-8);
 assert.equal(map.inverse(-1),0);
 assert.equal(map.inverse(601),600);
 assert.equal(map.inverse(135),200);
 assert.throws(()=>map.inverse(NaN),/Invalid/);assert.throws(()=>map.sample(NaN),/Invalid/);
});
import {createFilmStory} from '../film-story.js';
import {FILM_DIALOGUE} from '../film-dialogue.js';
test('approved narrative budget preserves complete original text and credits',()=>{
 const story=createFilmStory();
 for(const speech of story.speeches){assert.equal(speech.text,FILM_DIALOGUE.find(f=>f.id===speech.id).text);assert.equal(speech.segments.map(s=>s.text).join(' '),speech.text);}
 assert.deepEqual(story.windows.credits,[595,600]);
 assert.ok(story.windows.problem[1]<=story.windows.solution[0]);
 assert.ok(story.windows.exit[1]<595);
 for(let i=1;i<story.speeches.length;i++)assert.ok(story.speeches[i].start>=story.speeches[i-1].end+.399);
});
import fs from 'node:fs';
import zlib from 'node:zlib';
import {restoreSchedule} from '../film-prepared.js';
import {FactoryFilm} from '../factory-film.js';
test('one prepared operation drives presentation, event speeches, restart and 600 seconds',()=>{
 const schedule=restoreSchedule(JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
 const film=new FactoryFilm({preparedSchedule:schedule});
 // A speech starts at its event, or right after the previous speech when the
 // event happens while someone is still talking (uniform pace, no freeze).
 for(const trigger of film.plan.selection.triggers){const t=film.plan.clock.inverse(trigger.operationTime),speech=film.plan.story.speeches.find(x=>x.id===trigger.id),previous=film.plan.story.speeches.filter(x=>x.start<speech.start).at(-1);assert.ok(speech.start>=t-1e-7,`${trigger.id} before its event`);assert.ok(Math.abs(speech.start-t)<1e-6||Math.abs(speech.start-(previous.end+.4))<1e-6,`${trigger.id} neither at its event nor chained`);assert.ok(speech.start-t<8,`${trigger.id} ${speech.start-t}s late`);const s=film.seekPresentation(speech.start+1e-7);assert.equal(s.film.speech?.id,trigger.id);}
 for(const speech of film.plan.story.speeches){assert.equal(speech.text,FILM_DIALOGUE.find(f=>f.id===speech.id).text);}
 for(let i=1;i<film.plan.story.speeches.length;i++)assert.ok(film.plan.story.speeches[i].start>=film.plan.story.speeches[i-1].end+.399,'speech overlap');
 const seen=new Set();for(let t=0;t<=600;t+=.5){const s=film.seekPresentation(t);if(s.film.speech)seen.add(s.film.speech.id);assert.equal(s.elapsed,s.film.operationTime);assert.equal(s.backlog,0);assert.ok(s.buffer.units>=1250);}
 assert.equal(seen.size,30);
 assert.equal(film.seekPresentation(600).shipped,44825);assert.equal(film.plan.selection.highlights.length,10);
 const mission=film.plan.selection.mission;assert.ok(film.plan.clock.inverse(mission.transfer.end)-film.plan.clock.inverse(mission.pickupStart)>=mission.request.loaded-1e-7);
 for(const h of film.plan.selection.highlights){assert.ok(h.source);assert.ok(h.operation[1]>h.operation[0]);assert.ok(h.presentation[1]>h.presentation[0]);}
 film.reset();assert.equal(film.presentationTime,0);assert.equal(film.operationTime,0);
});
test('audio keeps its natural duration and rejects an impossible narrative budget',()=>{
 const story=createFilmStory({audioDurations:{F01:12}});assert.equal(story.speeches[0].end-story.speeches[0].start,12);
 assert.throws(()=>createFilmStory({audioDurations:{F01:90}}),/Ato 1/);
});
test('audio follows presentation time without speeding up the recorded voice',async()=>{
 const OriginalAudio=globalThis.Audio;
 globalThis.Audio=class {constructor(){this.duration=10;this.currentTime=0;this.paused=true;}pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}};
 try{const {FilmAudio}=await import('../film-audio.js'),audio=new FilmAudio();audio.assets.set('F13',{src:'audio/F13.m4a',duration:10});audio.sync({elapsed:135,film:{presentationTime:200,audioSpeech:{id:'F13',start:194,end:205}}},true,8);assert.equal(audio.player.playbackRate,1);assert.equal(audio.player.currentTime,6);assert.equal(audio.player.paused,false);}finally{globalThis.Audio=OriginalAudio;}
});
