import { FILM_EXCEL as X } from './film-excel.js';
import { MPS_PARAMETERS as M } from './mps-simulation.js';
import { DBR_PARAMETERS as P } from './dbr-simulation.js';
import { escapeHTML as escape, filmContext, SECTOR_NAMES, trendHTML } from './film-ui.js';
import { mergeBreakdowns, STATION_NAMES } from './scenario-engine.js';
import { scenarioSnapshot } from './scenario-snapshot.js';
import { scenarioTrendHTML } from './scenario-ui.js';
import { createScenarioLab } from './scenario-lab.js';

const n = (value, digits = 0) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: digits });
const EPS = 1e-7;
const UPSTREAM = ['torno', 'us1', 'us2'];
const PREVIOUS = { rosq: 'lap', m2: 'm1', insp: 'm2' };
const ZONES = { green: 'Verde', yellow: 'Amarela', red: 'Vermelha' };
const sum = values => values.reduce((total, value) => total + value, 0);

export function operationAtHours(hours) {
  if (!Number.isFinite(hours)) throw new TypeError('Invalid work hours');
  return P.productionStart + Math.max(0, Math.min(P.workHours, hours)) * P.weekSeconds / P.weekHours;
}

export function hoursAtOperation(seconds) {
  if (!Number.isFinite(seconds)) throw new TypeError('Invalid operation time');
  return Math.max(0, Math.min(P.workHours, (seconds - P.productionStart) * P.weekHours / P.weekSeconds));
}

// The existing scene enables its manual camera when film is absent. Keep the
// industrial snapshot intact; editorial state stays available only to charts.
export function explorationSnapshot(snapshot) {
  const { film, ...operation } = snapshot;
  return { ...operation, phase: 'production', dialogue: null, cameraHint: 'overview' };
}

function shiftHours(start, end, dailyHours) {
  if (end <= start) return 0;
  let hours = 0;
  for (let day = Math.floor(start / 24); day < Math.ceil(end / 24); day++) {
    hours += Math.max(0, Math.min(end, day * 24 + dailyHours) - Math.max(start, day * 24));
  }
  return hours;
}

function observedOccupancy(intervals, lo, hi, dailyHours, downtime = []) {
  const available = shiftHours(lo, hi, dailyHours);
  if (available <= EPS) return null;
  const merged = [];
  for (const [start, end] of intervals.map(([a, b]) => [Math.max(a, lo), Math.min(b, hi)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0])) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  const occupied = sum(merged.map(([a, b]) => shiftHours(a, b, dailyHours)
    - sum(downtime.map(([start, end]) => shiftHours(Math.max(a, start), Math.min(b, end), dailyHours)))));
  return occupied / available;
}

export function stationDetails(s, id) {
  const hours = s.dbr.workHours;
  const upstream = UPSTREAM.includes(id);
  const station = s.stations.find(item => item.id === id);
  if (!station) throw new Error(`Unknown station: ${id}`);
  const jobs = s.upstream.jobs;
  const processes = upstream ? jobs.flatMap(job => job.timeline.filter(event => event.station === id && event.kind === 'replenishment-process')
    .map(event => ({ ...event, id: job.id, product: job.body === 'z3' ? 'Z3' : 'Genérico', quantity: job.quantity }))) : [];
  const active = upstream
    ? processes.filter(event => event.startHours <= hours + EPS && event.endHours > hours + EPS)
    : s.lots.filter(lot => Number.isFinite(lot[`${id}StartHours`]) && lot[`${id}StartHours`] <= hours + EPS && lot[`${id}EndHours`] > hours + EPS);
  const queue = upstream ? jobs.filter(job => {
    const stage = job.timeline.find(event => event.station === id && event.kind === 'replenishment-process');
    const previous = job.timeline.find(event => event.station === UPSTREAM[UPSTREAM.indexOf(id) - 1] && event.kind === 'replenishment-process');
    return stage && (previous?.endHours ?? job.triggerHours) <= hours + EPS && stage.startHours > hours + EPS;
  }) : s.lots.filter(lot => {
    const start = lot[`${id}StartHours`] ?? Infinity;
    if (!(start > hours + EPS)) return false;
    const ready = id === 'lap' ? (lot.initial ? null : lot.releasedHours)
      : id === 'm1' ? lot.enteredBufferHours : lot[`${PREVIOUS[id]}EndHours`];
    return Number.isFinite(ready) && ready <= hours + EPS;
  });
  const intervals = upstream ? processes.map(event => [event.startHours, event.endHours])
    : s.lots.map(lot => [lot[`${id}ArrivalHours`] ?? lot[`${id}StartHours`], lot[`${id}EndHours`]]);
  const lo = (s.week - 1) * P.weekHours;
  const occupancy = observedOccupancy(intervals, lo, Math.min(hours, lo + P.weekHours), M.shifts[id] * 8,
    s.scenario ? mergeBreakdowns(s.scenario.params.breakdowns, id).map(stop => [stop.start, stop.end]) : id === 'rosq' ? [[s.breakdown.start, s.breakdown.end]] : []);
  const nominal = upstream ? ['Z', 'Z3'].map(product => M.machines[id] / M.nominalTimes[product][UPSTREAM.indexOf(id)]) : null;
  const rate = upstream ? (nominal[0] === nominal[1] ? `${n(nominal[0], 2)} un/h` : `${n(nominal[0], 2)} / ${n(nominal[1], 2)} un/h`) : `${n(P.rates[id], 2)} un/h`;
  return { id, machines: M.machines[id], shifts: M.shifts[id], active, queue, queueUnits: sum(queue.map(lot => lot.quantity)), occupancy, rate,
    rateLabel: upstream ? `Taxa nominal conjunta${nominal[0] === nominal[1] ? '' : ' · genérico / Z3'}` : 'Taxa efetiva conjunta',
    status: station.status !== 'Manutenção' && upstream && active.length && hours % 24 >= M.shifts[id] * 8 ? 'Fora do turno' : station.status };
}

const metrics = rows => `<dl class="metrics">${rows.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
const sourceNote = (text, scenario) => `<p class="report-source">Excel · ${escape(text)}<br>Saldos, filas e estados: ${scenario ? 'calculados para este cenário' : 'agenda operacional do filme'}.</p>`;
const badge = (label, zone = 'green') => `<span class="status ${escape(zone)}">● ${escape(label)}</span>`;
const title = (kicker, heading) => `<div class="film-card-kicker">${escape(kicker)}</div><h2>${escape(heading)}</h2>`;
const lotsHTML = lots => lots.length ? `<ul class="list">${lots.map(lot => `<li><b>${escape(lot.id)}</b> · ${escape(lot.product ?? (lot.body === 'z3' ? 'Z3' : 'Genérico'))}<br><span>${n(lot.quantity)} un</span></li>`).join('')}</ul>` : '<p class="note">Nenhum lote neste instante.</p>';

function chartSnapshot(s, sector) {
  return { ...s, film: { ...s.film, act: 'exploration', shot: { target: sector, sector }, report: null, demonstration: null, comparison: null, mct: null, showFinal: false } };
}

export function sectorHTML(s, sector) {
  const source = text => sourceNote(text, Boolean(s.scenario));
  const trend = sector => s.scenario ? scenarioTrendHTML(s) : trendHTML(chartSnapshot(s, sector));
  if (M.machines[sector]) {
    const d = stationDetails(s, sector), upstream = UPSTREAM.includes(sector);
    const stops = s.scenario ? s.breakdowns.filter(stop => stop.station === sector) : sector === 'rosq' && s.breakdown.active ? [{ duration: X.breakdown.durationHours, remaining: s.breakdownRemaining }] : [];
    const rateSource = upstream ? X.sources.times : sector === 'm1' ? 'DBR Personalizado!B43' : `Simulação DBR!I${{ lap: 6, rosq: 7, m2: 9, insp: 10 }[sector]}`;
    return title(sector === 'm1' ? 'TAMBOR · RITMO DA LINHA' : 'CENTRO DE TRABALHO', SECTOR_NAMES[sector])
      + badge(d.status, d.status === 'Manutenção' ? 'yellow' : d.status === 'Produzindo' ? 'green' : 'neutral')
      + metrics([['Máquinas / turnos', `${d.machines} / ${d.shifts}`], [d.rateLabel, d.rate],
        [`Ocupação · S${s.week} até agora`, d.occupancy === null ? '—' : `${n(d.occupancy * 100, 1)}%`], ['Fila de entrada', `${d.queue.length} lotes <small>· ${n(d.queueUnits)} un</small>`]])
      + stops.map(stop => `<p class="event-note">Manutenção por ${n(stop.duration, 1)} h. Restam ${n(stop.remaining, 1)} h úteis.<br>Tambor: ${escape(s.stations.find(item => item.id === 'm1').status.toLowerCase())}.</p>`).join('')
      + '<h3>Lote em processo</h3>' + lotsHTML(d.active) + (d.queue.length ? '<h3>Lotes aguardando entrada</h3>' + lotsHTML(d.queue) : '')
      + `<p class="note">Ocupação observada: ${upstream ? 'produção e setup' : 'processamento'} / horas de turno disponíveis desde o início da semana. Filas incluem lotes prontos no setor anterior, aguardando transferência.${upstream ? ' A taxa nominal não desconta setup.' : ' A taxa indicada já reúne todas as máquinas do centro.'}</p>`
      + (sector === 'm1' ? `<p class="note">Plano da semana no Excel: ${n(X.plannedOccupancy[s.week - 1] * 100, 1)}% de ocupação.</p>` : '')
      + source(`${X.sources.machines}; turnos: Enunciado, Tabela 3; taxa: ${rateSource}${sector === 'm1' ? `; ocupação planejada: ${X.sources.occupancy}` : ''}${sector === 'rosq' ? `; quebra: ${X.sources.breakdown}` : ''}`);
  }
  if (sector === 'buffer') {
    return title('PROTEÇÃO DO TAMBOR', 'Pulmão da Montagem 1') + badge(ZONES[s.buffer.zone], s.buffer.zone)
      + `<div class="hero-number">${n(s.buffer.units)} <small>unidades</small></div>`
      + metrics([['Alvo', `${n(s.buffer.target)} un`], ['Nas pistas / alimentação', `${s.buffer.pallets.length} pallets`], ['Verde a partir de', `${n(s.buffer.min)} un`], ['Vermelho abaixo de', `${n(s.buffer.red)} un`]])
      + trend(sector)
      + `<p class="note">Amarela: de ${n(s.buffer.red)} a ${n(s.buffer.min)} un. O saldo inclui o pallet em alimentação e cai conforme o tambor consome peças. O gráfico mostra somente o que já aconteceu nesta semana.</p>`
      + source('DBR Personalizado!B34, B37; Simulação DBR!B8:B10');
  }
  if (sector === 'dispatch') {
    const next = s.dispatch.nextCollectionHours;
    const nextWeek = next === null ? null : Math.min(8, Math.max(1, Math.ceil(next / 120)));
    return title('SAÍDA DO FLUXO', 'Expedição') + metrics([['Pallets na doca', n(s.dispatch.pallets.length)], ['Coletas realizadas', n(s.dispatch.collected)],
      ['Próxima coleta', next === null ? 'Concluídas' : `S${nextWeek} · ${n(next, 1)} h`], ['Até a próxima', next === null ? '—' : `${n(s.dispatch.countdownHours, 1)} h úteis`]])
      + `<p class="note">${n(s.shipped)} unidades expedidas. Coleta consolidada, até 10 pallets, pelo menos 6 h úteis após a inspeção. Horários no relógio acumulado das oito semanas.</p>`
      + '<h3>Pallets aguardando na doca</h3>' + lotsHTML(s.dispatch.pallets) + source('MCT Personalizado!B7; limite de 10 pallets: premissa logística');
  }
  if (sector === 'office' || sector === 'rope') {
    const rope = s.dbr.rope;
    if (rope.status === 'disabled') {
      const released = s.lots.filter(lot => !lot.initial && lot.releasedHours <= s.dbr.workHours);
      return title('PRODUÇÃO EMPURRADA', 'Sala do PCP / Corda') + badge('Corda desligada', 'neutral')
        + metrics([['Lotes liberados', n(released.length)], ['Tambor · taxa efetiva', `${n(s.dbr.drum.rate, 2)} un/h`]])
        + '<p class="note">Ordens liberadas conforme a disponibilidade da demanda e dos corpos. Sem crédito da corda, sem lotes de proteção e sem teto por saldo; as posições físicas continuam limitando o fluxo.</p><h3>Últimas liberações</h3>'
        + lotsHTML(released.sort((a, b) => b.releasedHours - a.releasedHours).slice(0, 5)) + source(`DBR Personalizado!B24, B43; ${X.sources.mps}`);
    }
    return title('COORDENAÇÃO · DBR', 'Sala do PCP / Corda') + badge({ normal: 'Reposição pelo consumo', priority: 'Reposição em prioridade', stop: 'Liberação suspensa' }[rope.status], rope.status === 'priority' ? 'yellow' : 'green')
      + metrics([['Autorizados agora', `${n(rope.authorizedLots)} lotes`], ['Lotes já liberados', n(s.dbr.ropeCards.length)], ['Tambor · taxa efetiva', `${n(s.dbr.drum.rate, 2)} un/h`], ['Ritmo médio planejado', `${n(s.dbr.drum.planningRate, 2)} un/h`], ['Antecedência', `${n(rope.advanceHours, 1)} h úteis`], ['Intervalo médio de referência', `${n(rope.intervalHours, 2)} h`]])
      + `<p class="note">Cada retirada do pulmão gera crédito para a Lapidação. Autorizados agora são créditos ainda disponíveis; os já liberados estão na agenda.</p><h3>Últimas liberações</h3>`
      + `<ul class="list">${s.dbr.ropeCards.slice(-5).reverse().map(card => `<li><b>${escape(card.lotIds.join(', '))}</b><br><span>${n(card.quantity)} un · ${n(card.hours, 1)} h úteis${card.priority ? ' · prioridade' : ''}</span></li>`).join('') || '<li>Nenhuma liberação até este instante.</li>'}</ul>`
      + source(`DBR Personalizado!B24, B43, B52; ${X.sources.advance}`);
  }
  if (['stock', 'components', 'parking'].includes(sector)) {
    if (s.scenario && sector === 'parking') return title('MODO CENÁRIO', 'Empilhadeiras') + '<p class="event-note">Movimentação das empilhadeiras desligada.</p><p class="note">Os cálculos mantêm a disputa por transporte e pelas posições físicas. A animação preparada pertence à base, por isso os veículos e pallets em trânsito ficam ocultos neste modo.</p>' + source('DBR Personalizado; Enunciado · recursos existentes');
    if (s.scenario && sector === 'components') {
      const quantities = Array(8).fill(0);
      s.weeks[s.week - 1].products.forEach(row => M.bom[row.product].forEach((count, index) => { quantities[index] += row.planned * count; }));
      return title('KITS DE MONTAGEM', `Componentes · S${s.week}`) + `<div class="context-components"><span>Necessidade do cenário · BOM × demanda</span>${quantities.map((quantity, index) => `<div>C${index + 1}<b>${n(quantity)}</b></div>`).join('')}</div><p class="note">Necessidade calculada para a demanda desta semana, incluindo pedidos extras e picos.</p>` + source('DBR Personalizado!B69:I76');
    }
    // filmContext prioritizes breakdowns and editorial cards. Neutralize only
    // those display predicates so a selected sector always keeps its own data.
    const context = chartSnapshot(s, sector);
    context.breakdown = { ...s.breakdown, active: false };
    return filmContext(context).html + (sector === 'stock' ? metrics([['Reposição em aberto · genérico', `${n(s.upstream.onOrder.generic)} un`], ['Reposição em aberto · Z3', `${n(s.upstream.onOrder.z3)} un`]]) : '');
  }
  return title('OITO SEMANAS · FAMÍLIA Z', 'A fábrica, no seu ritmo.')
    + '<p class="intro-copy">Clique na maquete ou escolha um setor acima. Os dados acompanham o instante selecionado na linha do tempo.</p>'
    + metrics([['Meta do MPS', `${n(s.planned)} un`], ['Inspecionado', `${n(s.completed)} un`], ['Expedido', `${n(s.shipped)} un`], ['Em atraso', `${n(s.backlog)} un`]])
    + badge(`Pulmão · ${ZONES[s.buffer.zone].toLowerCase()}`, s.buffer.zone)
    + trend('overview')
    + `<p class="note">Montagem 1 é o tambor. ${s.scenario && !s.scenario.params.rope ? 'Corda desligada: produção empurrada.' : 'O pulmão protege seu abastecimento e a corda autoriza a reposição pelo consumo.'}</p>`
    + (s.scenario ? `<p class="event-note">${s.scenario.params.breakdowns.map(stop => `${escape(STATION_NAMES[stop.station])}: S${Math.floor(stop.start / P.weekHours) + 1}, +${n(stop.start % P.weekHours)} h, duração ${n(stop.duration)} h`).join('<br>') || 'Sem quebras configuradas.'}</p>` : `<p class="event-note">Na S${X.breakdown.week}, a Rosqueadora para por ${X.breakdown.durationHours} h, a partir de ${(X.breakdown.week - 1) * P.weekHours + X.breakdown.offsetHours} h úteis. Avance também após a manutenção para observar a queda e a recuperação do pulmão.</p>`)
    + source(X.sources.mps);
}

// Browser-only entry point; pure inspection functions are importable by tests.
if (typeof document !== 'undefined' && document.querySelector('#sector-panel')) startExploration();

async function startExploration() {
  const $ = selector => document.querySelector(selector);
  const loading = $('#loading'), panel = $('#sector-panel'), timeline = $('#timeline');
  let scene, film, snapshot, lab, activeScenario = null, operation = P.productionStart, selected = 'overview';
  let playing = false, speed = 1, lastFrame = performance.now(), lastPanel = 0, frameId;
  function sample() {
    const base = film.seek(operation);
    return activeScenario ? scenarioSnapshot(activeScenario, hoursAtOperation(operation), base) : base;
  }
  function updateControls() {
    $('#play').textContent = playing ? 'Ⅱ Pausar' : operation >= P.productionEnd ? '↻ Recomeçar' : '▶ Reproduzir';
    $('#play').setAttribute('aria-label', playing ? 'Pausar simulação' : 'Reproduzir simulação');
    const hours = snapshot.dbr.workHours;
    timeline.value = hours;
    timeline.style.setProperty('--progress', `${hours / 960 * 100}%`);
    timeline.setAttribute('aria-valuetext', `Semana ${snapshot.week}, ${n(hours, 1)} horas úteis acumuladas`);
    $('#week-label').textContent = `Semana ${snapshot.week}`;
    $('#hours-label').textContent = `${n(hours, 1)} / 960 h úteis`;
    $('#inspector-time').textContent = `S${snapshot.week} · ${n(hours, 1)} h`;
    $('#scene-state').textContent = `${playing ? 'Em reprodução' : 'Pausado'} · câmera livre`;
    document.querySelectorAll('[data-week]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.week) === snapshot.week)));
  }
  function renderPanel() {
    const scroll = panel.scrollTop;
    panel.innerHTML = sectorHTML(snapshot, selected);
    panel.scrollTop = scroll;
    lab?.renderComparison(snapshot.dbr.workHours);
    updateControls();
  }
  function chooseSector(id, focus = true) {
    id = { 'body-stock': 'stock', truck: 'dispatch', shipping: 'dispatch', rope: 'office' }[id] ?? id;
    if (![...$('#sector').options].some(option => option.value === id)) id = 'overview';
    selected = id;
    lab?.showSector();
    $('#sector').value = id;
    if (focus) scene.focus(id);
    panel.scrollTop = 0;
    renderPanel();
  }
  function seek(hours) {
    playing = false;
    operation = operationAtHours(hours);
    snapshot = sample();
    renderPanel();
  }
  function togglePlayback() {
    if (operation >= P.productionEnd) {
      operation = P.productionStart;
      snapshot = sample();
    }
    playing = !playing;
    lastFrame = performance.now();
    renderPanel();
  }
  function fail(error) {
    playing = false;
    cancelAnimationFrame(frameId);
    scene?.destroy();
    document.querySelectorAll('button, select, #timeline').forEach(control => { control.disabled = true; });
    loading.hidden = false;
    loading.setAttribute('role', 'alert');
    loading.innerHTML = `<h1>Não foi possível abrir a maquete</h1><p>${escape(error.message)}<br>Confira a conexão e tente novamente.</p><a href="./explore.html">Recarregar exploração</a>`;
    console.error(error);
  }
  try {
    const [{ loadPreparedFilm }, { FactoryFilm }, { createFactoryScene }] = await Promise.all([
      import('./film-prepared.js'), import('./factory-film.js'), import('./scene.js')
    ]);
    const prepared = await loadPreparedFilm();
    film = new FactoryFilm({ preparedSchedule: prepared.schedule, preparedDemonstration: prepared.demonstration });
    snapshot = film.seek(operation);
    scene = createFactoryScene($('#world'), { onSelect: id => chooseSector(id, false), onInteract: () => scene.followTransport(false), signage: 'floating' });
    scene.followTransport(false);
    scene.resetView();
    scene.update(explorationSnapshot(snapshot), .016, { transportPlaying: false, playbackStarted: true });
    loading.hidden = true;
    document.querySelectorAll('button, select, #timeline').forEach(control => { control.disabled = false; });
    lab = createScenarioLab({ onScenario: result => { activeScenario = result; playing = false; snapshot = sample(); renderPanel(); }, onSeek: (hours, sector) => { seek(hours); chooseSector(sector); } });
    $('#sector').addEventListener('change', event => chooseSector(event.target.value));
    $('#overview').addEventListener('click', () => { scene.resetView(); chooseSector('overview', false); });
    $('#zoom-in').addEventListener('click', () => scene.zoom(-5));
    $('#zoom-out').addEventListener('click', () => scene.zoom(5));
    $('#dismiss-welcome').addEventListener('click', () => { $('#welcome').hidden = true; });
    $('#play').addEventListener('click', togglePlayback);
    $('#speed').addEventListener('change', event => { speed = Number(event.target.value); });
    timeline.addEventListener('input', event => seek(Number(event.target.value)));
    document.querySelectorAll('[data-week]').forEach(button => button.addEventListener('click', () => seek((Number(button.dataset.week) - 1) * 120)));
    $('#breakdown').addEventListener('click', () => { seek((X.breakdown.week - 1) * P.weekHours + X.breakdown.offsetHours); chooseSector('rosq'); });
    $('#world').addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); scene.setOrbit(event.key === 'ArrowLeft' ? -.15 : .15); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); scene.zoom(-5); }
      if (event.key === '-') { event.preventDefault(); scene.zoom(5); }
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { playing = false; renderPanel(); } lastFrame = performance.now(); });
    window.addEventListener('pagehide', () => { playing = false; cancelAnimationFrame(frameId); });
    window.addEventListener('pageshow', event => { if (event.persisted) { lastFrame = performance.now(); frameId = requestAnimationFrame(frame); } });
    renderPanel();
    function frame(now) {
      const dt = Math.min(.25, (now - lastFrame) / 1000);
      lastFrame = now;
      try {
        if (playing) {
          operation = Math.min(P.productionEnd, operation + dt * speed);
          snapshot = sample();
          if (operation >= P.productionEnd) playing = false;
        }
        scene.update(explorationSnapshot(snapshot), dt, { transportPlaying: playing, playbackStarted: true });
        if (now - lastPanel > 150) { renderPanel(); lastPanel = now; }
        frameId = requestAnimationFrame(frame);
      } catch (error) { fail(error); }
    }
    frameId = requestAnimationFrame(frame);
  } catch (error) { fail(error); }
}
