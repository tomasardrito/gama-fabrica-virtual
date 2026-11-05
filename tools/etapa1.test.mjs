import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FactoryFilm} from './prepared-test-helpers.mjs';
import {DBR_PARAMETERS as P, dbrScreen} from '../dbr-simulation.js';
import {DBR_REFERENCE as R} from '../dbr-reference.js';
import {sampleDbrHandling} from '../dbr-handling.js';

const film = new FactoryFilm();
const schedule = film.schedule;
const orders = schedule.lots.filter(l => !l.protection);
const sum = xs => xs.reduce((n, x) => n + x, 0);

test('all MPS lots leave before their original deadline', () => {
  assert.equal(sum(orders.map(l => l.quantity)), 44825);
  assert.deepEqual(orders.filter(l => !(l.shippedHours <= l.dueHours + 1e-7)).map(l => l.id), []);
});

test('zero backlog at every event, weekly boundary and half second', () => {
  const times = new Set(Array.from({length: 1201}, (_, i) => i / 2));
  for (const lot of orders) for (const h of [lot.dueHours, lot.shippedHours]) {
    for (const offset of [-1e-5, 0, 1e-5]) times.add(dbrScreen(h) + offset);
  }
  for (const t of [...times].filter(t => t >= 0 && t <= 600).sort((a, b) => a - b)) {
    assert.equal(film.seek(t).backlog, 0, `backlog at ${t}s`);
  }
  assert.equal(film.seek(600).shipped, 44825);
  assert.equal(film.seek(600).duration, 600);
});

test('daily collections depart on schedule, with eligible and unique loads', () => {
  const loaded = new Set();
  for (const trip of schedule.trips) {
    assert.equal(trip.departHours, trip.scheduledHours, trip.id);
    assert.ok(trip.pallets > 0 && trip.pallets <= 10, trip.id);
    for (const id of trip.lotIds) {
      assert.ok(!loaded.has(id), `duplicate shipment ${id}`);
      loaded.add(id);
      const lot = orders.find(l => l.id === id);
      assert.ok(lot.inspectionHours <= trip.departHours - 6 + 1e-7, id);
      assert.ok(lot.dispatchArrivalHours <= lot.truckLoadHours + 1e-7, id);
      assert.ok(lot.truckLoadHours <= trip.departHours + 1e-7, id);
    }
  }
  assert.equal(loaded.size, orders.length);
  for (let week = 1; week <= 8; week++) {
    assert.ok(schedule.trips.filter(t => t.week === week).at(-1).departHours <= week * 120);
  }
});

test('processing cannot start before material arrival or exceed Excel capacity', () => {
  for(const e of schedule.timeline.filter(e=>e.kind==='process')) {
    assert.ok(e.endHours-e.startHours>=e.quantity/P.rates[e.station]-1e-7,e.id);
    const inbound=schedule.lots.find(l=>l.id===e.lotId).timeline.find(x=>x.to===e.station);
    assert.ok(e.startHours>=inbound.endHours-1e-7,e.id);
  }
});

test('buffer has real yellow recovery in S5 and never goes red', () => {
  assert.ok(Math.min(...schedule.bufferLedger.map(e => e.units)) >= 1250);
  const yellow = schedule.bufferLedger.filter(e => e.units < P.min);
  assert.ok(yellow.length > 0, 'S5 must actually use buffer protection');
  assert.ok(yellow.some(e => e.hours >= 520 && e.hours < 600));
  for (const e of schedule.bufferLedger.filter(e => e.hours >= 0)) {
    const h = e.hours;
    const physical = sum(schedule.lots.filter(l => (l.initial || l.enteredBufferHours != null && l.enteredBufferHours <= h + 1e-7) && !(l.m1EndHours <= h + 1e-7)).map(l => l.m1StartHours<=h ? l.quantity*(l.m1EndHours-h)/(l.m1EndHours-l.m1StartHours) : l.quantity));
    // Multiple movements may share an industrial timestamp; compare the closing balance.
    if (schedule.bufferLedger.filter(x => Math.abs(x.hours - h) < 1e-7).at(-1) === e) {
      assert.ok(Math.abs(e.units-physical)<1e-6, `physical buffer at ${h}h`);
    }
  }
});

test('buffer debit follows actual drum consumption, not a 500-unit jump', () => {
  const first = schedule.lots.filter(l => l.m1StartHours != null).sort((a,b) => a.m1StartHours-b.m1StartHours)[0];
  const h = first.m1StartHours+1;
  const arrivals = sum(schedule.lots.filter(l=>!l.initial&&l.enteredBufferHours!=null&&l.enteredBufferHours<=h).map(l=>l.quantity));
  assert.ok(Math.abs(film.seek(dbrScreen(h)).buffer.units-(P.initialBufferUnits+arrivals-P.drumProcessingRate))<1e-6);
});

test('the complete operational presentation preserves the industrial baseline by ID', () => {
  // Frozen at 172e403, independently reproduced with both legacy visual durations
  // (1.5 and 2 seconds). R3 now reserves complete cycles; arbitrary replacement
  // durations can be infeasible and must not silently activate a partial plan.
  const byId=rows=>rows.sort((a,b)=>a[0].localeCompare(b[0]));
  const data={
    timeline:byId(schedule.timeline.map(e=>[e.id,e.lotId,e.kind,e.station,e.quantity,e.startHours,e.endHours])),
    lots:byId(schedule.lots.map(l=>[l.id,l.product,l.week,l.quantity,l.dueHours,l.releasedHours,l.inspectionHours,l.shippedHours])),
    buffer:schedule.bufferLedger,
    collections:byId(schedule.trips.map(t=>[t.id,t.week,t.scheduledHours,t.departHours,[...t.lotIds].sort()]))
  };
  const expected={
    timeline:'e7619954fd78eed8d3a9cef3802aa9bae03c34ec2215dd8db2d0a72dfc5ab36a',
    lots:'09b951eb6c518956bfc27db08c9368f1b9dbd4a7a50a5b0b24034fbc28255fe6',
    buffer:'ade774bcf14b3111ae55a58be49691e7e1fdb22da32130fcb588c2c5af4ee20b',
    collections:'cd5d50036c3dc32e59c770a387ecd6dc7579820303095703fed4cb55dfab1fb6'
  };
  assert.equal(schedule.complete,true);
  for(const [key,value]of Object.entries(data))assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'),expected[key],key);
});

test('presentation preserves lot order, buffer inventory and vehicle exclusivity', () => {
  for (const lot of schedule.lots) {
    const events = lot.timeline;
    for (let i = 0; i < events.length; i++) {
      assert.ok(events[i].end > events[i].start, events[i].id);
      if (i) assert.ok(events[i].start >= events[i - 1].end - 1e-7, lot.id);
    }
  }
  assert.ok(schedule.timeline.filter(e=>e.transportMode==='forklift').every(e=>Number.isInteger(e.vehicleIndex)&&e.vehicleIndex>=0&&e.vehicleIndex<5));
  for (let vi = 0; vi < 5; vi++) {
    const events = schedule.timeline.filter(e => e.vehicleIndex === vi).sort((a,b) => a.start-b.start);
    for (let i = 1; i < events.length; i++) assert.ok(events[i].start >= events[i-1].end - 1e-7, `forklift ${vi+1}: ${events[i].id}`);
  }
  for(const station of ['lap','rosq','m1','m2','insp']) {
    const events=schedule.timeline.filter(e=>e.kind==='process'&&e.station===station);
    for(const e of events) assert.ok(!events.some(x=>x!==e&&x.machineIndex===e.machineIndex&&x.start<e.end-1e-7&&e.start<x.end-1e-7), `visual machine collision at ${station}`);
  }
  for (let t = 135; t < 510; t += .5) {
    const s = film.seek(t), visual = sampleDbrHandling(s);
    assert.ok(Math.abs(sum([...visual.bufferPallets.values()].map(p => p.quantity))-s.buffer.units)<1e-6, `buffer at ${t}s`);
    for (const load of visual.loads.values()) assert.ok(load.position.every(Number.isFinite), load.lotId);
  }
});

test('speeches remain unique and event-triggered', () => {
  const speeches = film.plan.story.speeches;
  assert.equal(new Set(speeches.map(f => f.id)).size, 30);
  for (let i = 1; i < speeches.length; i++) assert.ok(speeches[i].start >= speeches[i - 1].end + .39);
  const f14 = speeches.find(f => f.id === 'F14');
  assert.ok(f14.start >= film.plan.clock.inverse(dbrScreen(0)) && f14.end <= film.plan.clock.inverse(dbrScreen(120)), 'tracked pallet ships during S1');
  const tracked=film.schedule.lots.find(l=>l.id===film.plan.trackedLotId);
  assert.ok(Math.abs(film.plan.clock.sample(f14.start).sourceTime-tracked.timeline.find(e=>e.to==='truck').end)<1e-7, 'F14 follows the same pallet entering its truck');
  const f19 = speeches.find(f => f.id === 'F19');
  assert.equal(film.seekPresentation(f19.start).buffer.zone, 'yellow', 'F19 requires a yellow buffer');
});

test('Excel comparison preserves the original hourly yellow recovery', () => {
  assert.equal(R.metricsA.yellowZoneHours, 12);
  assert.equal(R.metricsA.belowDrumRateHours, 0);
  assert.ok(Math.abs(R.metricsA.minimumBufferUnits - 2209.4375) < 1e-7);
  assert.deepEqual(R.hourlyRowsA.filter(r => r.zone === 'amarela').map(r => r.hour), [56,57,58,59,66,67,68,69,70,71,72,77]);
});
