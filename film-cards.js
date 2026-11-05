// Premissas do vídeo (escala e origem dos dados), mostradas na abertura.
export const FILM_PREMISES=Object.freeze([
 '8 semanas de produção (960 h úteis) em cerca de 5 minutos: 1 segundo de filme ≈ 4 horas de fábrica. Os momentos em destaque passam mais devagar.',
 'Cada evento acontece no horário calculado pela simulação, na ordem real; a animação não altera a produção.',
 'Dados: planilha do trabalho (PCPIII-Case-GAMA-completo.xlsx).'
]);
// Cards use film seconds; they never advance or pause the industrial clock.
export function sampleFilmCard(elapsed,credits){
 if(elapsed>=3&&elapsed<21)return {kind:'premises',title:'Como ler este filme',items:FILM_PREMISES};
 if(elapsed>=22&&elapsed<25)return {kind:'title',title:'GAMA',subtitle:'Compressores automotivos',detail:'Linha de personalizados · Família Z'};
 if(elapsed>=595&&elapsed<=600)return {kind:'credits',title:credits.titulo,names:[...credits.nomes]};
 return null;
}
export async function loadFilmCredits(fetcher=globalThis.fetch){
 const response=await fetcher('./config/creditos.json');
 if(!response.ok)throw new Error(`Créditos indisponíveis: HTTP ${response.status}`);
 const data=await response.json();
 if(typeof data.titulo!=='string'||!Array.isArray(data.nomes)||data.nomes.some(n=>typeof n!=='string'))throw new Error('Formato inválido de config/creditos.json');
 return {titulo:data.titulo,nomes:[...data.nomes]};
}
export function renderFilmCard(container,card){
 if(!card){container.hidden=true;return;}
 const key=JSON.stringify(card);
 if(container.dataset.key!==key){
  const kicker=document.createElement('span');kicker.className='film-card-label';kicker.textContent=card.kind==='title'?'FÁBRICA VIRTUAL · FEI PCP':card.kind==='premises'?'PREMISSAS DO VÍDEO':'TRABALHO FINAL · PCP III';
  const title=document.createElement('h1');title.textContent=card.title;
  const body=document.createElement('div');body.className=card.kind==='credits'?'credit-names':'title-detail';
  if(card.items){body.className='premise-list';for(const item of card.items){const li=document.createElement('p');li.textContent=item;body.append(li);}}
  else if(card.names)for(const name of card.names){const p=document.createElement('span');p.textContent=name;body.append(p);}
  else {const p=document.createElement('p');p.textContent=card.subtitle;const small=document.createElement('span');small.textContent=card.detail;body.append(p,small);}
  container.replaceChildren(kicker,title,body);container.dataset.key=key;container.dataset.kind=card.kind;
 }
 container.hidden=false;
}
