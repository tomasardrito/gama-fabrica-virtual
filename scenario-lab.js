import { DBR_PARAMETERS as P } from './dbr-simulation.js';
import { escapeHTML as escape } from './film-ui.js';
import { DEFAULT_SCENARIO_PARAMS, SCENARIO_PRESETS, STATION_NAMES, REPAIR_HOURS, normalizeScenarioParams, runScenario } from './scenario-engine.js';
import { comparisonHTML, bufferComparisonChart } from './scenario-ui.js';

const n = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const weekOptions = Array.from({ length: P.weeks }, (_, index) => `<option value="${index + 1}">S${index + 1}</option>`).join('');

export function createScenarioLab({ onScenario, onSeek }) {
  const $ = selector => document.querySelector(selector);
  const drawer = $('#scenario-drawer'), form = $('#scenario-form'), preset = $('#scenario-preset');
  const rows = $('#scenario-breakdowns'), comparison = $('#comparison-panel');
  let base, result = null, comparing = false, lastHours = 0;
  preset.insertAdjacentHTML('beforeend', SCENARIO_PRESETS.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join(''));
  $('#demand-week').innerHTML = weekOptions;
  $('#urgent-quantity').innerHTML = Array.from({ length: 7 }, (_, index) => `<option value="${index * 500}">+${n(index * 500)} un</option>`).join('');

  function addRow(stop) {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `<label class="field machine-field">Máquina<select data-field="station">${Object.entries(STATION_NAMES).map(([id, name]) => `<option value="${id}">${escape(name)}</option>`).join('')}</select></label>
      <label class="field">Semana<select data-field="week">${weekOptions}</select></label>
      <label class="field">Início · h<input data-field="offset" type="number" min="0" max="119" step="1" required></label>
      <label class="field">Duração · h<input data-field="duration" type="number" min="0.1" step="any" required></label>
      <button type="button" class="remove-breakdown" aria-label="Remover quebra">Remover</button>`;
    row.querySelector('[data-field="station"]').value = stop.station;
    row.querySelector('[data-field="week"]').value = Math.floor(stop.start / P.weekHours) + 1;
    row.querySelector('[data-field="offset"]').value = stop.start % P.weekHours;
    row.querySelector('[data-field="duration"]').value = stop.duration;
    row.querySelector('[data-field="station"]').addEventListener('change', event => { row.querySelector('[data-field="duration"]').value = REPAIR_HOURS[event.target.value]; });
    row.querySelector('.remove-breakdown').addEventListener('click', () => { row.remove(); preset.value = 'custom'; updateFields(); });
    rows.append(row);
    updateFields();
  }
  function updateFields() {
    const mode = $('#demand-mode').value, pallets = Number($('#buffer-factor').value), target = pallets * 500 + 71.3125;
    $('#demand-fields').hidden = mode === 'none';
    $('#urgent-field').hidden = mode !== 'urgent';
    $('#peak-field').hidden = mode !== 'peak';
    $('#demand-note').hidden = mode === 'none';
    $('#demand-note').textContent = mode === 'peak' ? 'O Z3 planejado aumenta nesta semana, com o mesmo prazo do MPS.' : 'Pedido chega no início da semana e vence no fim dela.';
    $('#buffer-limits').textContent = `${pallets} pallets · ${n(Math.round(target))} un · ${Math.round(target / P.target * 100)}% da base · amarelo abaixo de ${n(target * .7)} · vermelho abaixo de ${n(target * .35)}.`;
    $('#add-breakdown').disabled = rows.children.length >= 3;
  }
  function fill(params) {
    rows.replaceChildren();
    $('#buffer-factor').value = params.bufferPallets;
    $('#scenario-rope').value = params.rope ? 'on' : 'off';
    const urgent = params.urgentOrders[0], peak = params.peaks[0];
    $('#demand-mode').value = urgent ? 'urgent' : peak ? 'peak' : 'none';
    $('#demand-week').value = urgent?.week ?? peak?.week ?? 3;
    $('#urgent-quantity').value = urgent?.quantity ?? 2000;
    $('#peak-percent').value = peak?.percent ?? 20;
    params.breakdowns.forEach(addRow);
    updateFields();
  }
  function read() {
    const mode = $('#demand-mode').value, week = Number($('#demand-week').value);
    return {
      name: SCENARIO_PRESETS.find(item => item.id === preset.value)?.name ?? 'Cenário personalizado',
      breakdowns: [...rows.children].map(row => {
        const value = field => row.querySelector(`[data-field="${field}"]`).value;
        return { station: value('station'), start: (Number(value('week')) - 1) * P.weekHours + Number(value('offset')), duration: Number(value('duration')) };
      }),
      bufferPallets: Number($('#buffer-factor').value), rope: $('#scenario-rope').value === 'on',
      urgentOrders: mode === 'urgent' ? [{ week, quantity: Number($('#urgent-quantity').value) }] : [],
      peaks: mode === 'peak' ? [{ week, percent: Number($('#peak-percent').value) }] : []
    };
  }
  function showComparison(value) {
    comparing = Boolean(value && result);
    $('#sector-panel').hidden = comparing;
    comparison.hidden = !comparing;
    $('#show-sector').setAttribute('aria-pressed', String(!comparing));
    $('#show-comparison').setAttribute('aria-pressed', String(comparing));
    renderComparison(lastHours);
  }
  function renderComparison(hours) {
    lastHours = hours;
    if (result && comparing) $('#comparison-chart').innerHTML = bufferComparisonChart(base.bufferLedger, result.bufferLedger, result.parameters, 0, P.workHours, hours, true);
  }
  function markers() {
    const stops = result.params.breakdowns.map(stop => ({ hours: stop.start, duration: stop.duration, station: stop.station,
      label: `${STATION_NAMES[stop.station]} · S${Math.floor(stop.start / P.weekHours) + 1} +${n(stop.start % P.weekHours)} h · ${n(stop.duration)} h` }));
    const demand = [...result.params.urgentOrders.map(order => ({ ...order, label: `Pedido urgente +${n(order.quantity)} Z3 · S${order.week}` })),
      ...result.params.peaks.map(order => ({ ...order, label: `Pico +${order.percent}% Z3 · S${order.week}` }))]
      .map(order => ({ ...order, hours: (order.week - 1) * P.weekHours, station: 'office', duration: 0 }));
    $('#scenario-markers').innerHTML = [...stops, ...demand].map((event, index) => `<button type="button" data-hour="${event.hours}" data-station="${event.station}" class="event-marker ${event.duration ? 'repair' : 'demand'}" style="left:${event.hours / P.workHours * 100}%;--event-width:${Math.min(event.duration, P.workHours - event.hours) / P.workHours * 100}%;--lane:${index % 3}" title="${escape(event.label)}" aria-label="${escape(event.label)}">${event.duration ? '◆' : '＋'}</button>`).join('');
  }
  function activate(next) {
    result = next;
    $('#scenario-badge').hidden = !result;
    $('#scenario-view-tabs').hidden = !result;
    $('#scenario-markers').hidden = !result;
    $('#breakdown').hidden = Boolean(result);
    if (result) {
      $('#scenario-badge strong').textContent = `Cenário: ${result.params.name}`;
      $('#welcome').hidden = true;
      $('#comparison-content').innerHTML = comparisonHTML(base, result);
      comparison.scrollTop = 0;
      markers();
    }
    showComparison(Boolean(result));
    onScenario(result);
    drawer.close();
  }
  $('#open-scenarios').addEventListener('click', () => { drawer.showModal(); $('#scenario-status').textContent = ''; });
  $('#close-scenarios').addEventListener('click', () => drawer.close());
  preset.addEventListener('change', () => fill(normalizeScenarioParams(SCENARIO_PRESETS.find(item => item.id === preset.value)?.params)));
  form.addEventListener('input', event => { if (event.target !== preset) preset.value = 'custom'; updateFields(); });
  $('#add-breakdown').addEventListener('click', () => { if (rows.children.length < 3) { addRow(DEFAULT_SCENARIO_PARAMS.breakdowns[0]); preset.value = 'custom'; } });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    try {
      base ??= runScenario();
      const start = performance.now(), next = runScenario(read());
      form.dataset.runMilliseconds = (performance.now() - start).toFixed(1);
      activate(next);
    } catch (error) { $('#scenario-status').textContent = error.message; }
  });
  $('#return-base').addEventListener('click', () => { preset.value = 'custom'; fill(normalizeScenarioParams()); activate(null); });
  $('#show-sector').addEventListener('click', () => showComparison(false));
  $('#show-comparison').addEventListener('click', () => showComparison(true));
  $('#scenario-markers').addEventListener('click', event => {
    const marker = event.target.closest('[data-hour]');
    if (marker) onSeek(Number(marker.dataset.hour), marker.dataset.station);
  });
  fill(normalizeScenarioParams());
  return { renderComparison, showSector: () => showComparison(false) };
}
