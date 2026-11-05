import {FactoryFilm} from '../factory-film.js';
import {DBR_PARAMETERS, dbrScreen} from '../dbr-simulation.js';
import {sampleTruckVisit} from '../mps-scene.js';
import {DBR_REFERENCE} from '../dbr-reference.js';
import {sampleDbrHandling} from '../dbr-handling.js';
import {FilmPlayback} from '../film-playback.js';
import {filmContext, bufferTrend} from '../film-ui.js';
import {INTERNAL_LINKS, INTERNAL_LAYOUT} from '../internal-layout.js';
import {LOGISTICS_LAYOUT, boxCorners, boxesOverlap} from '../logistics-layout.js';
import {CAMERA_FLOW} from '../film-camera.js';
import {FILM_DIALOGUE} from '../film-dialogue.js';
import {loadPreparedFilm} from '../film-prepared.js';

// Verify the same hash-checked assets loaded by the browser, without replanning.
const prepared = await loadPreparedFilm(new URL('../', import.meta.url));
const filmOptions = {preparedSchedule: prepared.schedule, preparedDemonstration: prepared.demonstration};
const film = new FactoryFilm(filmOptions);
const samples = [];
for (let tick = 0; tick <= 1200; tick++) samples.push(film.seek(tick / 2));
const presentationSamples = [];
for (let tick = 0; tick <= 1200; tick++) presentationSamples.push(film.seekPresentation(tick / 2));
const allSamples = [...samples, ...presentationSamples];
const errors = [];
const pending = [];
const recordingStage = process.argv.some(arg => /^--etapa=[123]$/.test(arg));
const futureCheck = label => /Câmera|Frota visual|Duas docas|Caminhões|Empilhadeiras/.test(label);
const check = (label, ok, detail = '') => {
  const deferred = recordingStage && !ok && futureCheck(label);
  console.log(`${ok ? 'OK' : deferred ? 'PENDENTE' : 'FALHA'} · ${label}${detail ? ` · ${detail}` : ''}`);
  if (!ok) (deferred ? pending : errors).push(label);
};
const fmt = n => Number(n).toLocaleString('pt-BR', {maximumFractionDigits: 1});

check('Duração', film.plan.cues.at(-1).t + film.plan.cues.at(-1).duration === 600 && samples.at(-1).duration === 600 && film.plan.clock.duration === 600 && presentationSamples.at(-1).film.presentationTime === 600 && presentationSamples.at(-1).elapsed === 600, '600 s em operação e apresentação');
check('Expedido ao fim', samples.at(-1).shipped === 44825, `${fmt(samples.at(-1).shipped)} / 44.825 un`);
const playback = new FilmPlayback(new FactoryFilm(filmOptions));
playback.toggle();playback.advance(610);playback.advance(10);
check('Modo filme: termina sem repetir', !playback.playing && playback.film.snapshot().elapsed === 600);
check('Cards automáticos sem controles', allSamples.every(s => !/<(button|input|select|details|a)\b/i.test(filmContext(s).html)));
check('Gráfico mostra somente o saldo já observado', allSamples.every(s => bufferTrend(s).points.every(p => p.hours <= s.dbr.workHours + 1e-6)));
const late = allSamples.filter(s => s.backlog > 0);
const maxLate = Math.max(0, ...late.map(s => s.backlog));
const lateWeeks = [...new Set(late.flatMap(s => s.lots.filter(l => !l.protection && l.dueHours <= s.dbr.workHours && l.shippedAt > s.elapsed).map(l => l.week)))].sort((a, b) => a - b);
const dueLate = lateWeeks.map(week => ({week, units: film.schedule.lots.filter(l => !l.protection && l.week === week && l.shippedHours > week * 120 + 1e-6).reduce((n, l) => n + l.quantity, 0)}));
check('Em atraso em todo instante', late.length === 0, `${late.length} amostras de 0,5 s; pico ${fmt(maxLate)} un${dueLate.length ? `; fora do prazo: ${dueLate.map(x => `S${x.week} ${fmt(x.units)}`).join(', ')} un` : ''}`);

const minBuffer = Math.min(...allSamples.map(s => s.buffer.units));
check('Pulmão acima de 1.250 un', minBuffer >= 1250, `mínimo ${fmt(minBuffer)} un`);
const industrialMinBuffer = Math.min(...film.schedule.bufferLedger.map(e => e.units));
check('Pulmão industrial nunca vermelho', industrialMinBuffer >= 1250, `mínimo ${fmt(industrialMinBuffer)} un`);
const yellowS5 = film.schedule.bufferLedger.filter(e => e.units < DBR_PARAMETERS.min && e.hours >= 520 && e.hours < 600);
check('Amarelo real durante a quebra/recuperação S5', yellowS5.length > 0, `${yellowS5.length} estados industriais`);
check('Referência Excel: 12 h amarelas, zero vermelhas, mínimo 2.209,44', DBR_REFERENCE.metricsA.yellowZoneHours === 12 && DBR_REFERENCE.metricsA.redZoneHours === 0 && Math.abs(DBR_REFERENCE.metricsA.minimumBufferUnits-2209.4375)<1e-6);
const yellowHours = Array(8).fill(0);
const ledger = film.schedule.bufferLedger, threshold = DBR_PARAMETERS.min;
for(let i=1;i<ledger.length;i++) {
  const a=ledger[i-1],b=ledger[i],dt=b.hours-a.hours;
  let duration=0;
  if(a.units<threshold&&b.units<threshold)duration=dt;
  else if((a.units<threshold)!==(b.units<threshold)) {
    const crossing=(threshold-a.units)/(b.units-a.units);
    duration=dt*(a.units<threshold?crossing:1-crossing);
  }
  yellowHours[Math.min(7,Math.floor(a.hours/120))]+=duration;
}
console.log(`INFO · Amarelo observado no MPS variável · ${yellowHours.map((h,i)=>`S${i+1}: ${fmt(h)} h`).join('; ')} · não substitui a semana média do cenário A/B`);
const eventTimes = new Set(film.schedule.lots.filter(l=>!l.protection).flatMap(l=>[l.dueHours,l.shippedHours]).flatMap(h=>[dbrScreen(h)-1e-5,dbrScreen(h),dbrScreen(h)+1e-5]).filter(t=>t>=0&&t<=600));
const lateEvents = [...eventTimes].filter(t=>film.seek(t).backlog>0);
check('Atraso também nos vencimentos e saídas exatos', lateEvents.length===0, `${eventTimes.size} instantes adicionais`);

const transfers = film.schedule.timeline.filter(e => e.kind === 'transfer');
const wrongIndustrialTransfer = transfers.filter(e => {
  const expected = DBR_PARAMETERS.transferHours;
  return Math.abs((e.endHours - e.startHours) - expected) > 1e-6;
});
check('Relógio industrial: 12 min por missão, independente da animação', wrongIndustrialTransfer.length === 0, `${wrongIndustrialTransfer.length} durações divergentes em ${transfers.length} transferências`);
// R1/R2/R3 replace rollers with complete manual cycles, without changing industry.
const internalTransfers=transfers.filter(e=>INTERNAL_LINKS.includes(`${e.from}>${e.to}`));
const internalPlan=film.schedule.internalTransportPlan;
const allocation=film.schedule.internalAllocation;
const missions=internalPlan?.missions??[];
const internalIds=new Set(internalTransfers.map(e=>e.id));
check('Cinco ligações internas por paleteira, sem empilhadeira', internalTransfers.length===535&&internalIds.size===535&&INTERNAL_LINKS.every(link=>internalTransfers.filter(e=>`${e.from}>${e.to}`===link).length===107)&&internalTransfers.every(e=>e.transportMode==='trolley'&&e.vehicleIndex===null&&e.vehicleId===null), `${internalTransfers.length} transferências`);
check('535 ciclos completos ligados à agenda real', film.schedule.complete===true&&allocation?.complete===true&&allocation.assignments.length===535&&new Set(allocation.assignments.map(e=>e.id)).size===535&&allocation.assignments.every(e=>internalIds.has(e.id))&&missions.length===535&&new Set(missions.map(m=>m.transfer.id)).size===535&&missions.every(m=>internalIds.has(m.transfer.id)));
const badCycles=missions.filter(m=>{
  const e=internalTransfers.find(e=>e.id===m.transfer.id);
  return !e||!(m.start<m.pickupStart&&m.pickupStart<m.transfer.end&&m.transfer.end<m.end)||m.start<135-1e-7||m.end>510+1e-7||m.pickupStart<e.start-1e-7||m.transfer.end>e.end+1e-7||m.transfer.end-m.pickupStart<.1-1e-7||e.startHours!==m.transfer.startHours||e.endHours!==m.transfer.endHours||e.cycleStart!==m.start||e.cycleEnd!==m.end||e.pickupStart!==m.pickupStart||e.loadedEnd!==m.transfer.end;
});
check('Ciclos respeitam âncoras industriais e piso carregado de 0,1 s', missions.length===535&&badCycles.length===0, badCycles.slice(0,3).map(m=>m.transfer.id).join(', '));
const resourceConflicts=[];
for(const [i,m] of missions.entries()){
  for(const n of missions.slice(i+1))if((m.operator.id===n.operator.id||m.carrier.id===n.carrier.id||m.transfer.lotId===n.transfer.lotId)&&m.start<n.end-1e-7&&n.start<m.end-1e-7)resourceConflicts.push(`${m.transfer.id}/${n.transfer.id}`);
  for(const p of film.schedule.timeline.filter(p=>p.kind==='process'))if(`${p.station}:${p.machineIndex??0}`===m.operator.id&&m.start<p.end-1e-7&&p.start<m.end-1e-7)resourceConflicts.push(`${m.transfer.id}/${p.id}`);
}
check('Operador, paleteira e pallet reservados até o retorno', missions.length===535&&resourceConflicts.length===0, resourceConflicts.slice(0,3).join(', '));
const audit=allocation?.audit;
const auditKeys=['missing','duplicates','unexpected','conflicts','bayConflicts','staticConflicts','palletConflicts'];
check('Circulação conjunta entre quadros, incluindo vagas e postos', audit?.complete===true&&audit.interval?.[0]===0&&audit.interval?.[1]===600&&audit.parkedCarriers===5&&audit.externalSweeps>0&&audit.internalEnvelopes>0&&audit.upstreamOperatorEnvelopes>0&&auditKeys.every(key=>Array.isArray(audit[key])&&audit[key].length===0), audit?`${audit.externalSweeps} envelopes externos; ${audit.internalEnvelopes} internos; 0–600 s`:'auditoria ausente');
const internalDurations=missions.map(m=>m.transfer.end-m.pickupStart);
console.log(`INFO · R3 provisório: duração carregada · ${internalDurations.filter(d=>d<=.1+1e-7).length} no piso de 0,1 s; ${internalDurations.filter(d=>d>.1+1e-7&&d<.2).length} entre 0,1–0,2 s; ${internalDurations.filter(d=>d>=.2&&d<.5).length} entre 0,2–0,5 s; ${internalDurations.filter(d=>d>=.5).length} ≥ 0,5 s · aproximação/retorno adicionais`);
const dbrFleet = sampleDbrHandling(samples.find(s => s.elapsed >= DBR_PARAMETERS.productionStart)).fleet;
check('Frota visual com cinco empilhadeiras', dbrFleet.length === 5, `${dbrFleet.length} veículos`);
const usedDocks = new Set(film.schedule.trips.map(t => t.dockIndex));
check('Duas docas usadas', usedDocks.size === 2, `${usedDocks.size} doca(s)`);
const drumRuns = film.schedule.drumRuns.slice().sort((a, b) => a.start - b.start);
let drumBusyUntil = 0;
const drumGaps = [];
for (const run of drumRuns) {
  if (run.loadingStart > drumBusyUntil + 1e-6) drumGaps.push([drumBusyUntil, run.loadingStart]);
  drumBusyUntil = Math.max(drumBusyUntil, run.end);
}
check('M1 sem espera por material entre os ciclos (inclui carregamento)', drumGaps.length === 0, drumGaps.slice(0, 3).map(([a, b]) => `${fmt(a)}–${fmt(b)} h`).join('; '));

// W2 replaces time quotas with legible highlights and aerial intervals.
// Cue times are presentation seconds; weekly industrial boundaries use inverse.
// Declared aerial visibility is additionally checked against the actual renderer
// by the browser suite. A followed pallet still uses its physical sector.
const cameraSeconds = new Map();
const cues=film.plan.cues,clock=film.plan.clock;
const cuts=cues.flatMap(c=>[c.t,c.t+c.duration]);
cuts.push(...film.schedule.timeline.filter(e=>e.lotId===film.plan.trackedLotId).flatMap(e=>[e.start,e.end,e.pickupStart,e.loadedEnd]).filter(Number.isFinite).map(t=>clock.inverse(t)));
for(let week=1;week<=8;week++){
  const lo=clock.inverse(dbrScreen((week-1)*120)),hi=clock.inverse(dbrScreen(week*120));
  const boundaries=[...new Set([lo,hi,...cuts.filter(t=>t>lo&&t<hi)])].sort((a,b)=>a-b),counts=new Map();
  for(let i=1;i<boundaries.length;i++){
    const shot=film.seekPresentation((boundaries[i-1]+boundaries[i])/2).film.shot;
    for(const sector of new Set(shot.visibleSectors??[shot.sector??'MISSING']))counts.set(sector,(counts.get(sector)??0)+boundaries[i]-boundaries[i-1]);
  }
  cameraSeconds.set(week,counts);
}
const shown = new Set([...cameraSeconds.values()].flatMap(counts=>[...counts.keys()]));
const knownSectors=new Set([...CAMERA_FLOW,'stock','components','office','rope','overview','exterior','internal-transport']);
check('Câmera: todos os alvos têm setor físico', [...shown].every(sector=>knownSectors.has(sector)));
check('Câmera: tomadas cobrem 600 s sem lacunas', cues[0].t===0&&cues.every((c,i)=>c.duration>0&&c.transitionSeconds>=1&&c.transitionSeconds<=1.5&&(!i||Math.abs(c.t-cues[i-1].t-cues[i-1].duration)<1e-7))&&cues.at(-1).t+cues.at(-1).duration===600);
const highlights=film.plan.selection.highlights;
check('Câmera: dez highlights com fontes e intervalos reais', highlights.length===10&&Array.from({length:10},(_,i)=>`H${String(i+1).padStart(2,'0')}`).every(id=>highlights.some(h=>h.id===id))&&highlights.every(h=>h.source&&h.operation.every(Number.isFinite)&&h.presentation.every(Number.isFinite)&&h.operation[1]>h.operation[0]&&h.presentation[1]>h.presentation[0]));
const selectedTruck=film.plan.selection.truck,truckCues=cues.filter(c=>c.tripId===selectedTruck.id);
check('Câmera: caminhão acompanhado da chegada até a saída', truckCues.length>0&&truckCues[0].t<=clock.inverse(selectedTruck.arrivalAt)&&truckCues.at(-1).t+truckCues.at(-1).duration>=clock.inverse(selectedTruck.exitAt)&&truckCues.every((c,i)=>!i||(c.id===truckCues[0].id&&Math.abs(c.t-truckCues[i-1].t-truckCues[i-1].duration)<1e-7)), selectedTruck.id);
const sparse = [...cameraSeconds].filter(([, counts]) => [...counts.keys()].filter(x => x !== 'overview' && x !== 'tracked').length < 5);
check('Câmera: cinco setores por semana', sparse.length === 0, sparse.map(([w, c]) => `S${w}: ${[...c.keys()].join('/')}`).join('; '));
for (const [label, targets] of [['Tornearia', ['torno']], ['Usinagens', ['us1', 'us2']], ['Montagem 2', ['m2']], ['Inspeção', ['insp']], ['componentes', ['components']], ['transporte interno por paleteira', ['internal-transport']]]) {
  check(`Câmera mostra ${label}`, targets.every(x => shown.has(x)));
}
const followed=film.plan.selection.mission,followCues=cues.filter(c=>c.transportId===followed.transfer.id);
check('Paleteira seguida com retirada, percurso e colocação legíveis', followCues.length>0&&followCues[0].t<=clock.inverse(followed.pickupStart)&&followCues.at(-1).t+followCues.at(-1).duration>=clock.inverse(followed.transfer.end)&&clock.inverse(followed.transfer.end)-clock.inverse(followed.pickupStart)>=followed.request.loaded-1e-7, followed.transfer.id);
check('Relógio único contínuo, crescente e reversível', presentationSamples.every((s,i)=>s.elapsed===s.film.operationTime&&Math.abs(clock.inverse(s.elapsed)-s.film.presentationTime)<1e-7&&(!i||s.elapsed>presentationSamples[i-1].elapsed)));

const emptyTrips = film.schedule.trips.filter(t => t.pallets <= 0 || t.lotIds.length === 0);
check('Coletas com pallets', emptyTrips.length === 0, `${film.schedule.trips.length} coletas; ${emptyTrips.length} vazias`);
const lateFridays = Array.from({length: 8}, (_, i) => (i + 1) * 120).flatMap(h => film.schedule.trips.filter(t => t.scheduledHours === h && t.departHours > h + 1e-6).map(t => `S${h / 120}: ${fmt(t.departHours - h)} h`));
check('Última coleta sai até a hora 120 da semana', lateFridays.length === 0, lateFridays.join('; '));
const weeklyLastCollections = Array.from({length: 8}, (_, i) => {
  const week = i + 1;
  const trips = film.schedule.trips.filter(t => t.week === week).sort((a, b) => a.departHours - b.departHours);
  return {week, trip: trips.at(-1), deadline: week * 120};
});
const wrongWeeklyLast = weeklyLastCollections.filter(x => !x.trip || x.trip.departHours > x.deadline + 1e-6);
// If all eligible cargo has already left, an empty Friday visit is forbidden.
check('Fechamento semanal sem partida tardia nem coleta vazia', wrongWeeklyLast.length === 0, weeklyLastCollections.map(x => `S${x.week} ${x.trip ? `${fmt(x.trip.departHours - x.deadline)} h` : 'sem coleta'}`).join('; '));
const missedFriday = Array.from({length: 8}, (_, i) => (i + 1) * 120).flatMap(h => film.schedule.lots.filter(l => !l.protection && l.dueHours <= h && l.inspectionHours <= h - 6 && l.shippedHours > h + 1e-6).map(l => `S${h / 120}:${l.id}`));
check('Coleta de sexta leva aprovados até 6 h antes', missedFriday.length === 0, `${missedFriday.length} pallets pendentes`);
let truckCollision = null;
let forkliftRoad = null;
let internalMismatch = null;
let fleetMismatch = null;
let bufferMismatch = null;
const road=boxCorners([0,0],0,LOGISTICS_LAYOUT.road);
for (const s of allSamples) {
  const visits = s.trips.map(tr => sampleTruckVisit([tr], s.elapsed)).filter(v => v.visible);
  for (let i = 0; i < visits.length; i++) for (let j = i + 1; j < visits.length; j++) {
    if (!visits[i].corners||!visits[j].corners||boxesOverlap(visits[i].corners,visits[j].corners)) truckCollision ??= {t: s.elapsed, a: visits[i].trip.id, b: visits[j].trip.id};
  }
  const handling=sampleDbrHandling(s),fleet=handling.fleet;
  const physicalBuffer=[...handling.bufferPallets.values()].reduce((n,p)=>n+p.quantity,0);
  if(Math.abs(physicalBuffer-s.buffer.units)>1e-6)bufferMismatch??={t:s.elapsed,indicator:s.buffer.units,physical:physicalBuffer};
  for (const v of fleet) if (v.visible && boxesOverlap(boxCorners(v.position,Math.atan2(-v.direction[0],-v.direction[1]),LOGISTICS_LAYOUT.forkliftBounds),road)) forkliftRoad ??= {t: s.elapsed, id: v.id, position: v.position};
  if(fleet.length!==5||new Set(fleet.map(v=>v.id)).size!==5||!fleet.every(v=>v.visible&&LOGISTICS_LAYOUT.fleet.some(p=>p.id===v.id))||handling.carriers.length!==5||new Set(handling.carriers.map(v=>v.id)).size!==5||!handling.carriers.every(v=>v.visible&&INTERNAL_LAYOUT.parking.some(p=>p.id===v.id)))fleetMismatch??=s.elapsed;
  for(const load of handling.loads.values()){
    if(load.partLocation==='conveyor')internalMismatch??={t:s.elapsed,lotId:load.lotId,reason:'esteira legada'};
    if(load.partLocation!=='trolley')continue;
    const carrier=handling.carriers.find(v=>v.id===load.carrierId),operator=handling.operators.get(load.operatorId);
    if(!carrier||!operator||load.onCart||load.vehicleId!==null||Math.hypot(...load.position.map((v,i)=>v-carrier.position[i]))>1e-6||Math.abs(load.palletY-carrier.deckHeight)>1e-6)internalMismatch??={t:s.elapsed,lotId:load.lotId,reason:'carga sem suporte/operador'};
  }
}
check('Cinco empilhadeiras e cinco paleteiras identificadas durante todo o filme', fleetMismatch===null, fleetMismatch===null?'0–600 s':`${fleetMismatch} s`);
check('Pulmão visível soma o mesmo saldo do indicador industrial', bufferMismatch===null, bufferMismatch?JSON.stringify(bufferMismatch):'0–600 s, incluindo pallets em alimentação');
check('Pallets apoiados na paleteira com operador, sem esteiras', internalMismatch===null, internalMismatch?JSON.stringify(internalMismatch):'sampler integrado de 0–600 s; todos os 535 percursos na suíte etapa3');
check('Caminhões sem sobreposição de caixas', truckCollision == null, truckCollision ? `${truckCollision.a}/${truckCollision.b} em ${fmt(truckCollision.t)} s` : 'amostragem de 0,5 s');
check('Empilhadeiras fora da pista dos caminhões', forkliftRoad == null, forkliftRoad ? `${forkliftRoad.id} em ${fmt(forkliftRoad.t)} s` : 'amostragem de 0,5 s');

const speeches = film.plan.story.speeches;
const ids = new Set(speeches.map(f => f.id));
check('30 falas programadas', speeches.length === 30 && Array.from({length: 30}, (_, i) => `F${String(i + 1).padStart(2, '0')}`).every(id => ids.has(id)), `${speeches.length} IDs`);
const seen = new Set(presentationSamples.map(s => s.film.audioSpeech?.id).filter(Boolean));
check('30 falas aparecem na amostragem', ids.size === 30 && [...ids].every(id => seen.has(id)), `${seen.size} / 30`);
const windows=film.plan.story.windows;
const wrongBlock = speeches.filter(f => {const [start,end]=windows[f.id<='F06'?'problem':f.id<='F12'?'solution':f.id<='F24'?'production':'results'];return f.start<start||f.end>end;});
check('Falas nos blocos correspondentes', wrongBlock.length === 0, wrongBlock.map(f => f.id).join(', '));
check('30 falas com texto original integral', FILM_DIALOGUE.every(original=>{const actual=speeches.find(s=>s.id===original.id);return actual?.text===original.text&&actual.segments.map(s=>s.text).join(' ')===original.text;}));
const tracked=film.schedule.lots.find(l=>l.id===film.plan.trackedLotId);
const rope=film.schedule.ropeCards.find(c=>c.lotIds.includes(tracked.id));
const replenishment=film.schedule.bodySupply.jobs.find(j=>j.body==='z3'&&j.triggerHours>=240&&j.triggerHours<360);
const yellow=film.schedule.bufferLedger.find(e=>e.hours>=520&&e.units<DBR_PARAMETERS.min);
const m1Week7=film.schedule.lots.find(l=>l.m1EndHours>=720&&l.m1EndHours<840);
const triggers={F13:rope.time,F14:tracked.timeline.find(e=>e.to==='truck').end,F15:dbrScreen(120)+6,F16:replenishment.triggerAt,F17:dbrScreen(360)+7,F18:dbrScreen(520),F19:dbrScreen(yellow.hours),F20:dbrScreen(536),F21:dbrScreen(600)+5,F22:dbrScreen(m1Week7.m1EndHours),F23:selectedTruck.departAt,F24:dbrScreen(840)+5};
// A line starts at its industrial event or, if someone is still speaking when
// the event happens (F20 → F19 during the Rosqueadora breakdown), right after
// that line ends: the factory never freezes to make room for dialogue.
const wrongTriggers=Object.entries(triggers).filter(([id,t])=>{const speech=speeches.find(s=>s.id===id);if(!speech)return true;const at=clock.inverse(t),previous=speeches.filter(s=>s.start<speech.start).at(-1);const onEvent=Math.abs(clock.sample(speech.start).sourceTime-t)<=1e-7,chained=!!previous&&previous.end>at&&Math.abs(speech.start-(previous.end+.4))<1e-6&&speech.start-at<8;return !(onEvent||chained)||film.seekPresentation(speech.start+1e-7).film.audioSpeech?.id!==id;});
check('Falas semanais nos gatilhos industriais (ou logo após a fala anterior)', wrongTriggers.length===0, wrongTriggers.map(([id])=>id).join(', '));
const overlaps = speeches.flatMap((a, i) => speeches.slice(i + 1).filter(b => a.start < b.end && b.start < a.end).map(b => `${a.id}/${b.id}`));
check('Balões sem sobreposição', overlaps.length === 0, overlaps.slice(0, 8).join(', '));

console.log(`RESULTADO${recordingStage?` · ETAPA ${process.argv.find(arg=>/^--etapa=[123]$/.test(arg)).at(-1)}`:''} · ${errors.length ? `${errors.length} FALHA(S)` : 'OK'}${pending.length?` · ${pending.length} pendências das próximas etapas`:''}`);
if (errors.length) process.exitCode = 1;
