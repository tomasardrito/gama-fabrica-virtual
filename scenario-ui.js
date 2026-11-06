import { escapeHTML as escape } from './film-ui.js';
import { FILM_EXCEL as X } from './film-excel.js';
import { DBR_PARAMETERS as P } from './dbr-simulation.js';
import { STATION_NAMES } from './scenario-engine.js';

const n = (value, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
const currency = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function scenarioInterpretation(base, result) {
  const k = result.kpis, additional = k.drumStarvedHours - base.kpis.drumStarvedHours;
  if (k.drumBreakdownHours > .01) return k.lateUnits > base.kpis.lateUnits ? `${n(k.drumBreakdownHours)} h de tambor em manutenção: ${n(k.lateUnits, 0)} un ficam fora do prazo. Hora perdida no tambor é hora perdida da fábrica.` : `${n(k.drumBreakdownHours)} h de tambor em manutenção. O pulmão não repõe capacidade do tambor; a folga da semana absorveu a perda.`;
  if (!result.params.rope) return `Sem corda, o WIP médio é ${n(k.averageWip / base.kpis.averageWip)}× o da base e o lead time passa de ${n(base.kpis.meanLeadDays, 2)} para ${n(k.meanLeadDays, 2)} dias úteis.`;
  if (additional > .05) return `O cenário acrescenta ${n(additional)} h de tambor sem processamento; ${n(k.lateUnits, 0)} unidades ficam fora do prazo.`;
  if (result.params.urgentOrders.length || result.params.peaks.length) return `A demanda passa a ${n(k.planned, 0)} unidades: ${n(k.onTimePercent)}% saem no prazo e ${n(k.unshippedUnits, 0)} ainda não foram expedidas em 960 h.`;
  return `O pulmão protege o tambor: ${n(Math.max(0, additional))} h adicionais sem processamento em relação à base.`;
}

export function comparisonHTML(base, result) {
  const rows = [
    ['Demanda · un', 'planned', 0], ['Expedido até 960 h · un', 'shippedUnits', 0], ['Expedido no prazo · %', 'onTimePercent', 1, 'pp'],
    ['Unidades em atraso¹', 'lateUnits', 0], ['M1 sem processamento² · h', 'drumStarvedHours', 1], ['M1 em manutenção · h', 'drumBreakdownHours', 1],
    ['Pulmão mínimo · un', 'bufferMin', 1], ['Pulmão amarelo · h', 'yellowHours', 1], ['Pulmão vermelho · h', 'redHours', 1],
    ['WIP médio · un', 'averageWip', 1], ['LT médio ponderado · dias', 'meanLeadDays', 2], ['Throughput · un/h', 'throughput', 2],
    ['Ganho não realizado · R$', 'unrealizedGain', 0]
  ];
  const rowHTML = rows.map(([label, key, digits, suffix]) => {
    const a = base.kpis[key], b = result.kpis[key], delta = a == null || b == null ? null : b - a;
    return `<tr><th scope="row">${escape(label)}</th><td>${n(a, digits)}</td><td>${n(b, digits)}</td><td>${delta == null ? '—' : `${delta > 1e-7 ? '+' : ''}${n(delta, digits)}${suffix ? ` ${suffix}` : ''}`}</td></tr>`;
  }).join('');
  const stopRows = result.kpis.breakdowns.map(stop => `<tr><th scope="row">${escape(STATION_NAMES[stop.station])}<small>S${Math.floor(stop.start / P.weekHours) + 1} · +${n(stop.start % P.weekHours)} h</small></th><td>${n(stop.hours)} h</td><td>${n(stop.shiftHours)} h</td></tr>`).join('');
  const little = result.kpis.little;
  return `<div class="film-card-kicker">RESULTADO DAS OITO SEMANAS</div><h2>${escape(result.params.name || 'Cenário personalizado')}</h2>
    <p class="scenario-reading">${escape(scenarioInterpretation(base, result))}</p>
    <table class="comparison-table"><caption>Base × Cenário</caption><thead><tr><th scope="col">Indicador</th><th scope="col">Base</th><th scope="col">Cenário</th><th scope="col">Diferença</th></tr></thead><tbody>${rowHTML}</tbody></table>
    <p class="note">¹ Entregas após o prazo e unidades não expedidas até 960 h. O prazo considera a quantidade de cada lote.<br>² M1 no turno, sem quebra e sem lote em processo, com demanda disponível. Inclui carregamento: a base mede ${n(base.kpis.drumStarvedHours)} h. WIP inclui o estoque inicial e os lotes de proteção; LT ponderado por unidades dos lotes liberados e inspecionados no horizonte.</p>
    <p class="note">Modelo determinístico: considera só as paradas escolhidas, sem a variabilidade dos tempos (CV da Tabela 2). O pulmão da base foi dimensionado para cobrir essa variabilidade (Factory Physics).</p><h3>Paradas deste cenário</h3>${stopRows ? `<table class="comparison-table"><thead><tr><th>Máquina</th><th>Parada</th><th>No turno</th></tr></thead><tbody>${stopRows}</tbody></table>` : '<p class="note">Nenhuma quebra configurada.</p>'}
    <p class="note">A base tem a parada da Rosqueadora: ${n(base.kpis.breakdowns[0].hours)} h, das quais ${n(base.kpis.breakdowns[0].shiftHours)} h no turno. Sobreposições são contadas uma vez na capacidade. Durações exibidas dentro das 960 h.</p>
    <h3>Lei de Little · janela finita</h3><p class="note">Para os lotes liberados e inspecionados no período: TH ${n(little.cohortThroughput, 2)} un/h × LT ${n(result.kpis.meanLeadDays == null ? null : result.kpis.meanLeadDays * 24, 2)} h = ${n(little.completedContribution)} un.<br>Somando ${n(little.boundaryContribution)} un do estoque inicial e dos lotes ainda abertos, chega-se ao WIP médio observado de ${n(result.kpis.averageWip)} un. A diferença da aproximação simples é ${n(little.relativeGap * 100)}%.</p>
    <h3>Origem do ganho não realizado</h3><p class="note">${n(result.kpis.unshippedUnits, 0)} un não expedidas até 960 h × (${currency(X.comparison.B.lostGain)} ÷ ${n(X.comparison.B.lostUnits, 3)} un) = <strong>${currency(result.kpis.unrealizedGain)}</strong>.<br>Taxa de referência: Simulação DBR!M10 ÷ M9; aplicada às unidades não expedidas do cenário, sem confundir com as entregas atrasadas.</p>
    <p class="report-source">${escape(X.source)} · ${escape(X.sources.mps)}; DBR Personalizado!B34, B37; Simulação DBR!B8:B10, I6:I10, L6:M10; Factory Physics Personalizado.<br>Enunciado · Tabelas 2 e 3 (reparos e turnos).</p>`;
}

export function bufferComparisonChart(basePoints, scenarioPoints, parameters, lo = 0, hi = P.workHours, now = hi, full = false) {
  const cutoff = full ? hi : Math.min(now, hi);
  const select = points => points.filter(point => point.hours >= lo && point.hours <= cutoff + 1e-7);
  const a = select(basePoints), b = select(scenarioPoints);
  const ceiling = Math.max(parameters.target * 1.1, ...a.map(point => point.units), ...b.map(point => point.units));
  const x = hour => 8 + (hour - lo) / (hi - lo) * 274, y = units => 94 - units / ceiling * 78;
  const path = points => points.map(point => `${x(point.hours).toFixed(2)},${y(point.units).toFixed(2)}`).join(' ');
  const cursor = x(Math.min(hi, Math.max(lo, now)));
  return `<div class="scenario-chart"><div class="trend-heading"><b>Pulmão · ${full ? 'oito semanas' : `S${Math.floor(lo / P.weekHours) + 1}`}</b><span>Saldo · un</span></div>
    <svg viewBox="0 0 340 112" role="img" aria-label="Pulmão: Base em cinza e Cenário em verde, com limites do cenário">
      <rect x="8" y="16" width="274" height="${Math.max(0, y(parameters.min) - 16)}" fill="#d8e7db"/>
      <rect x="8" y="${y(parameters.min)}" width="274" height="${y(parameters.red) - y(parameters.min)}" fill="#f1e2b6"/>
      <rect x="8" y="${y(parameters.red)}" width="274" height="${94 - y(parameters.red)}" fill="#efcfca"/>
      <text x="287" y="${y(parameters.min) + 3}">${n(parameters.min, 0)}</text><text x="287" y="${y(parameters.red) + 3}">${n(parameters.red, 0)}</text>
      <polyline points="${path(a)}" fill="none" stroke="#8a959a" stroke-width="1.6"/>
      <polyline points="${path(b)}" fill="none" stroke="#216b59" stroke-width="2"/>
      <line x1="${cursor}" x2="${cursor}" y1="13" y2="96" stroke="#203e39" stroke-dasharray="2 3" opacity=".65"/>
      <text x="8" y="108">${n(lo, 0)} h</text><text x="255" y="108">${n(hi, 0)} h</text>
    </svg><div class="chart-legend"><span>━ Base</span><span>━ Cenário</span><span>┆ Instante selecionado</span></div></div>`;
}

export function scenarioTrendHTML(snapshot) {
  const lo = (snapshot.week - 1) * P.weekHours, hi = lo + P.weekHours, now = snapshot.dbr.workHours;
  const scenario = [...snapshot.film.allReports[snapshot.week - 1].buffer.points, { hours: now, units: snapshot.buffer.units }].sort((a, b) => a.hours - b.hours);
  const base = [...snapshot.scenarioComparison.reports[snapshot.week - 1].buffer.points, { hours: now, units: snapshot.scenarioComparison.buffer.units }].sort((a, b) => a.hours - b.hours);
  return bufferComparisonChart(base, scenario, snapshot.buffer, lo, hi, now);
}
