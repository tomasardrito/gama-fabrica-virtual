import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {restoreSchedule} from '../film-prepared.js';
const preparedSchedule=restoreSchedule(JSON.parse(gunzipSync(fs.readFileSync(new URL('../dados/preview-agenda.json.gz',import.meta.url)))));
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sampleFilmCard,loadFilmCredits} from '../film-cards.js';
import {cinematicState} from '../factory-cinematic.js';
import {STORY_WINDOWS} from '../film-story.js';

test('title holds for 3 seconds after the facade sign lights up',()=>{
 assert.equal(sampleFilmCard(21.999,{}),null);
 assert.ok(cinematicState(22).sign>.95);
 for(const t of [22,23,24.999])assert.equal(sampleFilmCard(t,{}).kind,'title');
 assert.equal(sampleFilmCard(25,{}),null);
});
test('credits occupy the final 5 seconds and remain on the final frame',()=>{
 const credits={titulo:'Grupo de PCP',nomes:['Alice & Bob','<NOME>']};
 assert.equal(sampleFilmCard(594.999,credits),null);
 assert.equal(cinematicState(595).day,0);
 for(const t of [595,596,599.999,600]){const c=sampleFilmCard(t,credits);assert.equal(c.kind,'credits');assert.equal(c.title,credits.titulo);assert.deepEqual(c.names,credits.nomes);}
 assert.equal(sampleFilmCard(600.001,credits),null);
});
test('credits are loaded from the JSON without inventing group names',async()=>{
 const data=JSON.parse(await readFile(new URL('../config/creditos.json',import.meta.url),'utf8'));let path;
 const credits=await loadFilmCredits(async url=>{path=url;return {ok:true,json:async()=>data};});
 assert.equal(path,'./config/creditos.json');assert.deepEqual(credits,{titulo:data.titulo,nomes:data.nomes});assert.equal(credits.nomes.length,6);
 await assert.rejects(loadFilmCredits(async()=>({ok:false,status:404})),/404/);
});
test('new sector cards use snapshot logistics metrics and explicit period',async()=>{
 const {FactoryFilm}=await import('../factory-film.js'),{filmContext,sceneCaption}=await import('../film-ui.js');const s=new FactoryFilm({preparedSchedule}).seek(250);
 for(const sector of ['components','internal-transport','parking','rope']){s.film.shot={...s.film.shot,target:sector,sector};assert.equal(sceneCaption(s).sector==='Chão de fábrica',false);assert.equal(filmContext(s).kind,sector);}
 s.film.shot={...s.film.shot,target:'parking',sector:'parking'};s.dbr.logistics={fleetSize:5,missions:18,busyHours:3.6,availableHours:64,utilization:.05625,periodStartHours:120,periodEndHours:240};
 const html=filmContext(s).html;assert.match(html,/18/);assert.match(html,/120/);assert.match(html,/240/);assert.match(html,/5,6/);
});
test('act-two example is explicitly identified without suggesting industrial production',async()=>{
 const {FactoryFilm}=await import('../factory-film.js'),{filmContext,sceneCaption}=await import('../film-ui.js'),film=new FactoryFilm({preparedSchedule});
 const [start,end]=STORY_WINDOWS.demonstration;
 for(const t of [start,start+4,start+8,end-.01]){const s=film.seekPresentation(t),card=filmContext(s),caption=sceneCaption(s);assert.equal(card.kind,'demonstration');assert.match(caption.sector,/DEMONSTRAÇÃO/);assert.match(card.html,/0 h/);assert.match(card.html,/não.*estoque/);assert.match(card.html,/Lapidação/);assert.equal(s.shipped,0);}
 for(const t of [start-.01,end,194])assert.notEqual(filmContext(film.seekPresentation(t)).kind,'demonstration');
});
