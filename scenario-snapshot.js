import { DBR_PARAMETERS as P, dbrScreen } from './dbr-simulation.js';
import { dbrWorkToCalendar } from './dbr-upstream.js';
import { MPS_PARAMETERS as M } from './mps-simulation.js';
import { scenarioBufferAt, scenarioConsumed, productiveHours, STATION_NAMES } from './scenario-engine.js';

const EPS = 1e-7, STAGES = ['lap', 'rosq', 'm1', 'm2', 'insp'];
const sum = values => values.reduce((total, value) => total + value, 0);
const reached = (time, now) => Number.isFinite(time) && time <= now + EPS;
const reportCache = new WeakMap();

function reportsFor(result) {
  if (!reportCache.has(result)) reportCache.set(result, Array.from({ length: P.weeks }, (_, index) => ({
    week: index + 1, buffer: { points: result.bufferLedger.filter(point => point.hours >= index * P.weekHours && point.hours <= (index + 1) * P.weekHours) }, leadMean: null
  })));
  return reportCache.get(result);
}

export function scenarioSnapshot(result, hours, baseSnapshot) {
  if (!Number.isFinite(hours)) throw new TypeError('Invalid scenario time');
  const now = Math.max(0, Math.min(P.workHours, hours)), elapsed = dbrScreen(now);
  const week = Math.min(P.weeks, Math.floor(now / P.weekHours) + 1);
  const done = lot => reached(lot.inspectionHours, now), sent = lot => reached(lot.shippedHours, now);
  const stageAt = lot => {
    if (sent(lot)) return 'shipped';
    if (reached(lot.truckLoadHours, now)) return 'truck';
    if (done(lot)) return 'dispatch';
    if ((lot.initial || reached(lot.enteredBufferHours, now)) && !reached(lot.bufferReleasedHours, now)) return 'buffer';
    for (const id of STAGES.slice().reverse()) if (reached(lot[`${id}StartHours`], now)) return id;
    return reached(lot.releasedHours, now) ? 'stock' : 'planned';
  };
  const lots = result.lots.map(lot => ({ ...lot, stage: stageAt(lot), status: sent(lot) ? 'Expedido' : done(lot) ? 'Aprovado' : stageAt(lot) === 'planned' ? 'Programado' : 'Em processo' }));
  const demand = lots.filter(lot => !lot.protection);
  const breakdowns = result.breakdowns.filter(stop => now >= stop.start && now < stop.start + stop.duration)
    .map(stop => ({ ...stop, end: stop.start + stop.duration, remaining: stop.start + stop.duration - now, active: true }));
  const isBroken = id => breakdowns.some(stop => stop.station === id);
  const upstream = result.bodySupply.snapshotAt(now);
  upstream.currentProcesses = upstream.currentProcesses.filter(event => !isBroken(event.station));
  // The inherited body model knows the original MPS; scenario demand is local.
  upstream.bomNeeded = Array(8).fill(0);
  for (const order of result.orders) M.bom[order.product].forEach((count, index) => { upstream.bomNeeded[index] += order.quantity * count; });
  const stations = Object.entries(STATION_NAMES).map(([id, name]) => {
    const replenishment = !STAGES.includes(id);
    const active = replenishment ? upstream.jobs.flatMap(job => job.timeline.filter(event => event.kind === 'replenishment-process' && event.station === id)
      .map(event => ({ ...event, id: job.id, quantity: job.quantity }))).filter(event => event.startHours <= now + EPS && event.endHours > now + EPS)
      : lots.filter(lot => reached(lot[`${id}StartHours`], now) && lot[`${id}EndHours`] > now + EPS);
    const inShift = now % 24 < M.shifts[id] * 8 - EPS;
    const processing = active.length > 0 && inShift && !isBroken(id);
    const activeLots = active.map(lot => {
      const start = replenishment ? lot.startHours : lot[`${id}StartHours`], end = replenishment ? lot.endHours : lot[`${id}EndHours`];
      const total = productiveHours(start, end, M.shifts[id] * 8, result.stops[id]);
      return { id: lot.id, machineIndex: lot.machineSlots?.[id] ?? 0, processing,
        progress: total ? Math.max(0, Math.min(1, productiveHours(start, now, M.shifts[id] * 8, result.stops[id]) / total)) : 0 };
    });
    return { id, name, machines: M.machines[id], shifts: M.shifts[id], status: isBroken(id) ? 'Manutenção' : processing ? 'Produzindo' : active.length ? 'Fora do turno' : 'Aguardando',
      activeLotId: active[0]?.id, activeBatchId: active[0]?.id, activeLots, processingUnits: processing ? sum(active.map(lot => lot.quantity)) : 0, progress: activeLots[0]?.progress ?? 0 };
  });
  const buffer = scenarioBufferAt(result, now);
  const cards = result.ropeCards.filter(card => reached(card.hours, now)).map(card => ({ ...card, animate: false }));
  const consumed = sum(lots.filter(lot => reached(lot.bufferReleasedHours, now)).map(lot => lot.quantity));
  const released = sum(cards.map(card => card.quantity)), credit = result.params.rope ? consumed - released : 0;
  const nextStart = lots.filter(lot => lot.m1StartHours > now).sort((a, b) => a.m1StartHours - b.m1StartHours)[0]?.m1StartHours ?? null;
  const nextCollection = result.trips.find(trip => trip.scheduledHours > now + EPS);
  const trace = lots.filter(lot => lot.initial || reached(lot.releasedHours, now)).map(lot => ({
    lotId: lot.id, product: lot.product, week: lot.week, quantity: lot.quantity, initial: lot.initial, preloaded: false,
    releaseHours: lot.releasedHours, releaseAt: lot.releasedAt, inspectionHours: done(lot) ? lot.inspectionHours : null,
    inspectionAt: done(lot) ? lot.completedAt : null, shippedHours: sent(lot) ? lot.shippedHours : null,
    observedLeadTimeDays: !lot.initial && done(lot) ? (lot.inspectionHours - lot.releasedHours) / 24 : null,
    plannedLeadTimeDays: P.plannedLeadTimeDays
  }));
  const productRow = (product, list) => ({ product, planned: sum(list.map(lot => lot.quantity)), completed: sum(list.filter(done).map(lot => lot.quantity)),
    shipped: sum(list.filter(sent).map(lot => lot.quantity)), backlog: sum(list.filter(lot => lot.dueHours <= now + EPS && !sent(lot)).map(lot => lot.quantity)) });
  const products = ['Z', 'Z1', 'Z2', 'Z3'].map(product => productRow(product, demand.filter(lot => lot.product === product)));
  const weeks = Array.from({ length: P.weeks }, (_, index) => {
    const list = demand.filter(lot => lot.week === index + 1), row = productRow(null, list);
    const onTimeShipped = sum(list.filter(lot => sent(lot) && lot.shippedHours <= lot.dueHours + EPS).map(lot => lot.quantity));
    return { ...row, week: index + 1, onTimeShipped, deviation: now >= (index + 1) * P.weekHours ? onTimeShipped - row.planned : null,
      products: ['Z', 'Z1', 'Z2', 'Z3'].map(product => productRow(product, list.filter(lot => lot.product === product))) };
  });
  const completed = sum(products.map(row => row.completed)), shipped = sum(products.map(row => row.shipped));
  const breakdown = breakdowns.find(stop => stop.station === 'rosq') ?? breakdowns[0] ?? { active: false, start: null, end: null };
  return { ...baseSnapshot, mode: 'dbr', phase: 'production', elapsed, animationTime: elapsed, week, weekProgress: Math.min(1, (now - (week - 1) * P.weekHours) / P.weekHours),
    scenario: { name: result.params.name || 'Cenário personalizado', params: result.params }, scenarioComparison: { buffer: baseSnapshot.buffer, reports: baseSnapshot.film?.allReports }, breakdowns, breakdown, breakdownRemaining: breakdown.remaining ?? 0,
    lots, stations, buffer, weeks, products, completed, shipped, planned: result.kpis.planned, backlog: sum(products.map(row => row.backlog)), outstanding: result.kpis.planned - shipped,
    wip: sum(lots.filter(lot => (lot.initial || reached(lot.releasedHours, now)) && !done(lot)).map(lot => lot.quantity)), finishedGoods: completed - shipped,
    upstream, replenishments: upstream.jobs, timeline: result.timeline, trips: result.trips, poolPallets: result.poolPallets,
    initialStockDraws: result.draws.filter(draw => draw.workHours <= now), events: result.events.filter(event => event.hours <= now).sort((a, b) => b.hours - a.hours).slice(0, 20),
    dispatch: { nextCollectionHours: nextCollection?.scheduledHours ?? null, countdownHours: nextCollection ? nextCollection.scheduledHours - now : 0,
      countdownSeconds: nextCollection ? nextCollection.scheduledAt - elapsed : 0, collected: result.trips.filter(trip => trip.departHours <= now + EPS).length,
      pallets: lots.filter(lot => reached(lot.dispatchArrivalHours, now) && !reached(lot.truckLoadHours, now) && !sent(lot)) },
    dbr: { ...baseSnapshot.dbr, logistics: null, workHours: now, calendarHours: dbrWorkToCalendar(now),
      drum: { ...baseSnapshot.dbr.drum, produced: sum(lots.map(lot => scenarioConsumed(lot, now, result.stops.m1))), consumedBuffer: consumed, nextStartHours: nextStart },
      rope: { intervalHours: P.ropeIntervalHours, advanceHours: P.advanceHours, credit, authorizedLots: Math.max(0, Math.floor(credit / M.lotSize)), nextReleaseAt: nextStart,
        status: !result.params.rope ? 'disabled' : buffer.units > buffer.target ? 'stop' : buffer.units < buffer.min ? 'priority' : 'normal' },
      ropeCards: cards, trace, plannedLeadTimeDays: P.plannedLeadTimeDays, shippingDelayDays: P.shippingDelayDays },
    film: { ...baseSnapshot.film, report: null, reports: [], allReports: reportsFor(result) }, dialogue: null, cameraHint: 'overview' };
}
