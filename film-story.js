import {FILM_DIALOGUE} from './film-dialogue.js';
export const words=text=>text.trim().split(/\s+/).length;
export const readingTime=text=>Math.max(3,words(text)/2.5+.8);
export function speechChunks(text){const all=text.split(/\s+/),chunks=[];while(all.length)chunks.push(all.splice(0,21).join(' '));return chunks;}
export const SCREEN_DIALOGUE=FILM_DIALOGUE.map(f=>({...f,fullText:f.text}));
export const FILM_TIMING=Object.freeze({duration:600,openingSeconds:25,act1Start:25,act2Start:75,productionStart:135,productionEnd:510,resultsStart:510,closingStart:580,weekSeconds:46.875});
export const FILM_CAST={Carlos:{name:'Carlos',role:'Vendedor · Comercial',color:0x397eb6,sector:'office'},Ricardo:{name:'Ricardo',role:'Diretor da GAMA',color:0x33414e,sector:'office'},Marcos:{name:'Marcos',role:'Gerente de PCP',color:0xd7e3de,sector:'office'},Rafael:{name:'Rafael',role:'Consultor · FEI PCP',color:0x46845a,sector:'office'},Jorge:{name:'Jorge',role:'Supervisor · Montagem 1',color:0xd78435,sector:'m1'},André:{name:'André',role:'Operador · Lapidação',color:0x7885a0,sector:'lap'}};
export const STORY_WINDOWS=Object.freeze({opening:[0,25],problem:[25,94],solution:[94,194],production:[194,481],results:[481,541],closing:[541,600],exit:[541,566],credits:[595,600],demonstration:[98,113.6]});
export function createFilmStory({audioDurations={}}={}){
 // With a recorded voice the line lasts exactly as long as the recording;
 // without one, it lasts its reading time. Pauses between lines are natural.
 const natural=id=>speechChunks(SCREEN_DIALOGUE.find(f=>f.id===id).text).reduce((n,t)=>n+readingTime(t)+.4,0)-.4;
 const duration=id=>audioDurations[id]>0?audioDurations[id]:natural(id);
 const speeches=[];const add=(id,start,sector,gap=.4,squeeze=1)=>{const f=SCREEN_DIALOGUE.find(f=>f.id===id);let at=start;const raw=speechChunks(f.text).map((text,i)=>{const s={id:`${id}-${i+1}`,text,start:at,end:at+readingTime(text)};at=s.end+.4;return s;});const naturalEnd=at-.4,length=duration(id)*(audioDurations[id]>0?1:squeeze),scale=length/(naturalEnd-start);const segments=raw.map(seg=>({...seg,start:start+(seg.start-start)*scale,end:start+(seg.end-start)*scale}));const speech={...f,start,end:start+length,sector:sector||FILM_CAST[f.speaker].sector,segments};speeches.push(speech);return speech.end+gap;};
 const pause=(slack,n)=>Math.max(.4,Math.min(1.3,slack/Math.max(1,n)));
 // Ato 1: the meeting ends ~3 s before the tour so the exit stays unhurried.
 const act1=['F01','F02','F03','F04','F05','F06'],act1End=STORY_WINDOWS.problem[1]-3,act1Total=act1.reduce((n,id)=>n+duration(id),0);
 if(25+act1Total+.4*5>STORY_WINDOWS.problem[1])throw new Error('Ato 1 excedeu sua janela.');
 const gap1=pause(act1End-25-act1Total,5),lead1=Math.max(0,act1End-25-act1Total-gap1*5);
 let at=25+Math.min(lead1,4);for(const id of act1)at=add(id,at,'office',gap1);
 const tour=['stock','lap','buffer','m1','office','overview'],walks=[];at=94;
 const act2Total=[7,8,9,10,11,12].reduce((n,i)=>n+duration(`F${String(i).padStart(2,'0')}`)+4,0),arrive=Math.max(0,Math.min(.9,(194-94-act2Total-2.4-.5)/6));
 for(let i=0;i<6;i++){const id=`F${String(i+7).padStart(2,'0')}`;walks.push({id:`WALK-${id}`,start:at,end:at+4,sector:tour[i],tourIndex:i});at+=4+Math.min(arrive,.9);at=add(id,at,tour[i],.4);}
 if(at>194)throw new Error('Ato 2 excedeu sua janela.');
 at=490;const act4=[25,26,27,28,29,30].map(i=>`F${i}`),act4Total=act4.reduce((n,id)=>n+duration(id),0),gap4=pause(STORY_WINDOWS.results[1]-STORY_WINDOWS.results[0]-3-act4Total-4,5);
 // Reading-time fallback (no recordings) is squeezed to fit the shorter window.
 const room4=STORY_WINDOWS.exit[0]-2-(STORY_WINDOWS.results[0]+3)-gap4*5,squeeze4=Math.min(1,room4/act4Total);
 at=Math.max(STORY_WINDOWS.results[0]+3,STORY_WINDOWS.exit[0]-4-act4Total*squeeze4-gap4*5);
 for(const id of act4)at=add(id,at,id==='F27'||id==='F28'?'overview':'office',gap4,squeeze4);
 if(at>STORY_WINDOWS.results[1])throw new Error('Ato 4 excedeu sua janela.');
 return {...FILM_TIMING,windows:STORY_WINDOWS,speeches,walks,addWeekly:add};
}
export const FILM_STORY=createFilmStory();
