import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DbrSimulation } from './prepared-test-helpers.mjs';
import { DBR_PARAMETERS as P } from '../dbr-simulation.js';
import { MPS_PLAN } from '../mps-simulation.js';
import { runScenario, scenarioBufferAt, DEFAULT_SCENARIO_PARAMS, SCENARIO_PRESETS } from '../scenario-engine.js';

const prepared = new DbrSimulation().schedule;
const base = runScenario();
const preset = id => SCENARIO_PRESETS.find(item => item.id === id).params;
const near = (actual, expected, label) => {
  if (actual == null || expected == null || !Number.isFinite(expected)) assert.equal(actual, expected, label);
  else assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
};

test('defaults reproduce every industrial lot, collection and rope card of the prepared agenda', () => {
  const fields = ['quantity', 'releasedHours', 'enteredBufferHours', 'inspectionHours', 'shippedHours',
    ...['lap', 'rosq', 'm1', 'm2', 'insp'].flatMap(id => [`${id}StartHours`, `${id}EndHours`])];
  assert.equal(base.lots.length, prepared.lots.length);
  for (const expected of prepared.lots) {
    const actual = base.lots.find(lot => lot.id === expected.id);
    assert.ok(actual, expected.id);
    assert.equal(actual.product, expected.product);
    for (const field of fields) near(actual[field], expected[field], `${expected.id}.${field}`);
  }
  assert.equal(base.trips.length, 38);
  for (const [index, expected] of prepared.trips.entries()) {
    near(base.trips[index].departHours, expected.departHours, `collection ${index}`);
    assert.deepEqual(base.trips[index].lotIds, expected.lotIds);
  }
  assert.equal(base.ropeCards.length, prepared.ropeCards.length);
});

test('base delivers all demand on time and reports real material starvation', () => {
  near(base.kpis.onTimePercent, 100, 'on time');
  assert.equal(base.kpis.lateUnits, 0);
  console.log(`Base: ${base.kpis.drumStarvedHours.toFixed(4)} h de tambor sem material.`);
});

test('minimum buffer exposes greater starvation and a lower balance than base', () => {
  const result = runScenario(preset('half-buffer'));
  assert.ok(result.kpis.drumStarvedHours > base.kpis.drumStarvedHours);
  assert.ok(result.kpis.bufferMin < base.kpis.bufferMin);
  console.log(`Pulmão 25%: ${result.kpis.drumStarvedHours.toFixed(4)} h sem material; mínimo ${result.kpis.bufferMin.toFixed(4)} un.`);
});

test('drum breakdown stops consumption for eight hours and preserves the buffer', () => {
  const result = runScenario(preset('drum-breakdown'));
  near(result.kpis.drumBreakdownHours, 16, 'M1 downtime');
  assert.ok(result.kpis.lateUnits > 0);
  const { start, duration } = result.breakdowns[0];
  let previous = scenarioBufferAt(result, start).units;
  for (let h = start + .1; h <= start + duration; h += .1) {
    const current = scenarioBufferAt(result, h).units;
    assert.ok(current >= previous - 1e-6, `buffer fell during repair at ${h}`);
    previous = current;
  }
  assert.equal(result.ropeCards.filter(card => card.hours > start && card.hours < start + duration).length, 0);
});

test('pushed production increases WIP and lead time without creating protection lots', () => {
  const result = runScenario(preset('push'));
  assert.ok(result.kpis.averageWip > base.kpis.averageWip);
  assert.ok(result.kpis.meanLeadDays > base.kpis.meanLeadDays);
  assert.equal(result.lots.some(lot => lot.id.startsWith('PROT-')), false);
  assert.equal(result.ropeCards.length, 0);
});

test('urgent demand never starts before arrival, peaks preserve the frozen plan, and totals reconcile', () => {
  const planBefore = JSON.stringify(MPS_PLAN);
  const urgent = runScenario(preset('urgent-s3'));
  const extras = urgent.lots.filter(lot => lot.extra);
  assert.equal(extras.reduce((n, lot) => n + lot.quantity, 0), 2000);
  for (const lot of extras) {
    assert.equal(lot.availableHours, 2 * P.weekHours);
    assert.equal(lot.dueHours, 3 * P.weekHours);
    assert.ok(lot.releasedHours >= lot.availableHours);
  }
  near(urgent.kpis.planned, base.kpis.planned + 2000, 'urgent demand');
  const peak = runScenario({ peaks: [{ week: 3, percent: 20 }] });
  near(peak.kpis.planned, base.kpis.planned + MPS_PLAN[2].products.Z3 * .2, 'peak demand');
  assert.equal(JSON.stringify(MPS_PLAN), planBefore);
});

test('upstream breakdowns respect shifts, overlap is not double counted and boundaries are half open', () => {
  const baselineJob = base.bodySupply.jobs[0];
  const baselineProcess = baselineJob.timeline.find(event => event.kind === 'replenishment-process' && event.station === 'torno');
  const start = baselineProcess.startHours;
  const result = runScenario({ breakdowns: [{ station: 'torno', start, duration: 8 }, { station: 'm1', start: 520, duration: 8 }, { station: 'm1', start: 524, duration: 8 }] });
  assert.ok(result.bodySupply.jobs[0].timeline.find(event => event.kind === 'replenishment-process' && event.station === 'torno').endHours > baselineProcess.endHours);
  near(result.kpis.drumBreakdownHours, 12, 'overlapping downtime');
  assert.equal(result.kpis.breakdowns.length, 3);
  assert.ok(result.kpis.breakdowns.every(item => item.shiftHours <= item.hours + 1e-6));
});

test('scaled buffer fits eleven positions, accepts zero urgent demand and rejects invalid inputs', () => {
  const result = runScenario({ bufferFactor: 1.5, urgentOrders: [{ week: 1, quantity: 0 }] });
  const initial = scenarioBufferAt(result, 0);
  near(initial.units, 5071.3125, 'initial buffer');
  near(initial.min, 5071.3125 * .7, 'yellow threshold');
  near(initial.red, 5071.3125 * .35, 'red threshold');
  assert.ok(initial.pallets.length <= 11);
  assert.throws(() => runScenario({ bufferFactor: 0 }));
  assert.throws(() => runScenario({ breakdowns: Array(4).fill(DEFAULT_SCENARIO_PARAMS.breakdowns[0]) }));
  assert.throws(() => runScenario({ breakdowns: [{ station: 'unknown', start: 0, duration: 1 }] }));
  assert.throws(() => runScenario({ urgentOrders: [{ week: 9, quantity: 500 }] }));
});

test('identical parameters produce identical results without mutating their input', () => {
  const params = structuredClone(preset('half-buffer'));
  const before = structuredClone(params);
  const a = runScenario(params), b = runScenario(params);
  assert.deepEqual(a.kpis, b.kpis);
  assert.deepEqual(a.lots, b.lots);
  assert.deepEqual(a.bufferLedger, b.bufferLedger);
  assert.deepEqual(params, before);
});

test('Little accounting reconciles the finite horizon including unfinished WIP', () => {
  for (const result of [base, runScenario(preset('push')), runScenario({ urgentOrders: [{ week: 8, quantity: 3000 }] })]) {
    const check = result.kpis.little;
    near(check.completedContribution + check.boundaryContribution, result.kpis.averageWip, 'finite-window Little identity');
    assert.ok(Number.isFinite(result.kpis.throughput));
    assert.ok(result.kpis.unshippedUnits >= 0);
  }
});

test('every protected source and prepared asset retains its manifest SHA-256', async () => {
  for (const kind of ['preview', 'demo']) {
    const manifest = JSON.parse(await readFile(new URL(`../dados/${kind}-manifest.json`, import.meta.url)));
    for (const [path, digest] of Object.entries(manifest.sources)) {
      assert.equal(createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex'), digest, path);
    }
    assert.equal(createHash('sha256').update(await readFile(new URL(`../dados/${kind}-agenda.json.gz`, import.meta.url))).digest('hex'), manifest.assetHash);
  }
});

test('scenario snapshots drive all eight station failures without mutating base geometry or state', async () => {
  const { scenarioSnapshot } = await import('../scenario-snapshot.js');
  const simulation = new DbrSimulation();
  const original = simulation.seek(P.productionStart + 530 * P.weekSeconds / P.weekHours);
  const originalLots = original.lots;
  for (const station of ['torno', 'us1', 'us2', 'lap', 'rosq', 'm1', 'm2', 'insp']) {
    const result = runScenario({ breakdowns: [{ station, start: 528, duration: 8 }], bufferFactor: .5 });
    const snapshot = scenarioSnapshot(result, 530, original);
    assert.equal(snapshot.stations.find(item => item.id === station).status, 'Manutenção');
    assert.equal(snapshot.breakdowns.length, 1);
    assert.equal(snapshot.breakdowns[0].station, station);
    assert.equal(snapshot.internalTransportPlan, original.internalTransportPlan);
    assert.equal(snapshot.componentPlan, original.componentPlan);
    near(snapshot.buffer.target, 1571.3125, 'snapshot target');
    assert.equal(snapshot.scenario.params.bufferFactor, .5);
  }
  assert.equal(original.scenario, undefined);
  assert.equal(original.lots, originalLots);
});

test('scenario snapshots and static view use scenario inventories, disable transport and honor the horizon', async () => {
  const { scenarioSnapshot } = await import('../scenario-snapshot.js');
  const { scenarioPresentation } = await import('../scenario-view.js');
  const simulation = new DbrSimulation();
  const original = simulation.seek(P.productionEnd);
  const result = runScenario(preset('urgent-s3'));
  const snapshot = scenarioSnapshot(result, P.workHours, original);
  near(snapshot.planned, result.kpis.planned, 'snapshot planned');
  near(snapshot.shipped, result.kpis.shippedUnits, 'snapshot shipments');
  assert.equal(snapshot.week, P.weeks);
  const view = scenarioPresentation(snapshot);
  assert.equal(view.fleet.length, 0);
  assert.equal(view.carriers.length, 0);
  assert.equal(view.visualTrips.length, 0);
  assert.ok([...view.loads.values()].every(load => load.partLocation !== 'vehicle' && load.stage !== 'transport'));
  near([...view.loads.values()].filter(load => load.inventoryLabel).reduce((n, load) => n + load.quantity, 0), snapshot.buffer.units, 'visible buffer inventory');
  assert.throws(() => scenarioSnapshot(result, NaN, original));
});

test('comparison uses scaled thresholds, finite values, workbook gain formula and escaped names', async () => {
  const { comparisonHTML, scenarioInterpretation, bufferComparisonChart } = await import('../scenario-ui.js');
  const result = runScenario({ ...preset('half-buffer'), name: '<img src=x>' });
  const html = comparisonHTML(base, result);
  assert.match(html, /Base/);
  assert.match(html, /Cenário/);
  assert.match(html, /Diferença/);
  assert.match(html, /M10.*M9/);
  assert.doesNotMatch(html, /<img|NaN|undefined/);
  const chart = bufferComparisonChart(base.bufferLedger, result.bufferLedger, result.parameters, 480, 600, 540);
  assert.match(chart, /1\.100/);
  assert.match(chart, /550/);
  assert.doesNotMatch(chart, /NaN|undefined/);
  assert.match(scenarioInterpretation(base, runScenario(preset('drum-breakdown'))), /16 h/);
});

test('existing sector panels show scenario thresholds, disabled rope and every active repair', async () => {
  const { scenarioSnapshot } = await import('../scenario-snapshot.js');
  const { sectorHTML, stationDetails } = await import('../explore.js');
  const simulation = new DbrSimulation();
  const original = simulation.seek(P.productionStart + 530 * P.weekSeconds / P.weekHours);
  original.film = { allReports: Array.from({ length: 8 }, () => ({ buffer: { points: base.bufferLedger } })) };
  const result = runScenario({ rope: false, bufferFactor: .5, breakdowns: [{ station: 'us1', start: 528, duration: 24 }] });
  const snapshot = scenarioSnapshot(result, 550, original);
  assert.equal(stationDetails(snapshot, 'us1').status, 'Manutenção');
  assert.match(sectorHTML(snapshot, 'us1'), /24 h/);
  assert.match(sectorHTML(snapshot, 'office'), /Corda desligada/);
  assert.match(sectorHTML(snapshot, 'buffer'), /550/);
  for (const sector of ['torno', 'us1', 'us2', 'lap', 'rosq', 'm1', 'm2', 'insp', 'buffer', 'stock', 'dispatch', 'office', 'components', 'parking', 'overview']) {
    assert.doesNotMatch(sectorHTML(snapshot, sector), /undefined|NaN|agenda operacional do filme/);
  }
});

test('released lots remain in the input queue even when a long repair prevents scheduling', async () => {
  const { scenarioSnapshot } = await import('../scenario-snapshot.js');
  const { stationDetails } = await import('../explore.js');
  const result = runScenario({ breakdowns: [{ station: 'lap', start: 0, duration: P.workHours + 240 }] });
  const original = new DbrSimulation().seek(P.productionStart);
  const snapshot = scenarioSnapshot(result, 100, original);
  const waiting = result.lots.filter(lot => !lot.initial && lot.releasedHours <= 100 && !(lot.lapStartHours <= 100));
  assert.ok(waiting.length > 0);
  assert.deepEqual(stationDetails(snapshot, 'lap').queue.map(lot => lot.id), waiting.map(lot => lot.id));
});

test('pallet buffer uses a fixed reserve', () => {
 for (const pallets of [3, 7, 10]) {
 const result = runScenario({bufferPallets:pallets});
 near(result.parameters.target, pallets * 500 + 71.3125, 'target');
 near(result.lots.find(lot => lot.id === 'BUF-RESERVE').quantity, 71.3125, 'reserve');
 }
});

test('preset readings agree with late units and reduced buffer reaches red', async () => {
 const {scenarioInterpretation}=await import('../scenario-ui.js');
 for(const item of SCENARIO_PRESETS){const r=runScenario(item.params);const text=scenarioInterpretation(base,r);if(r.kpis.drumBreakdownHours) assert.equal(text.includes('folga da semana'),r.kpis.lateUnits===base.kpis.lateUnits);}
 const r=runScenario(preset('half-buffer'));assert.ok(r.kpis.redHours>0);
});
