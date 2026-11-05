import {
  STAGING_BAYS, STATION_HANDLING, TRANSPORT_LANES,
  bayApproach, bayWorkerStand, operatorRoute, routeFor, FORKLIFT_GEOMETRY
} from './transport-routes.js';

// Absolute presentation time. Sampling never advances a queue or changes the
// production plan, so pause, seek and a dropped frame produce the same poses.
const EPS = 1e-7;
const clamp = t => Math.max(0, Math.min(1, t));
const copy = value => structuredClone(value);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp(t));
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const direction = (a, b) => {
  const d = distance(a, b);
  return d > EPS ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [0, -1];
};
const angle = (a, b) => {
  const delta = Math.atan2(b[0], b[1]) - Math.atan2(a[0], a[1]);
  return Math.atan2(Math.sin(delta), Math.cos(delta));
};
const rotate = (a, b, t) => {
  const yaw = Math.atan2(a[0], a[1]) + angle(a, b) * clamp(t);
  return [Math.sin(yaw), Math.cos(yaw)];
};
const floorPart = (p, y = .3) => [p[0], y, p[1]];
const handPart = op => [op.position[0] + op.direction[0] * .35, 1.1, op.position[1] + op.direction[1] * .35];
const vehicleIndex = id => typeof id === 'number' ? id : Math.max(0, Math.min(2, (Number(String(id).match(/(\d+)$/)?.[1]) || 1) - 1));
const stageNames = { lap: 'Lapidação', rosq: 'Rosqueamento', m1: 'Montagem 1', m2: 'Montagem 2', insp: 'Inspeção' };
const labels = {
  source_approach: 'Acessando a máquina', source_pick: 'Retirando a peça pronta',
  source_carry_out: 'Levando a peça ao pallet', source_place: 'Apoiando a peça no pallet', source_return: 'Liberando a área de coleta',
  pickup: 'Buscando o lote', fork_align: 'Alinhando os garfos', fork_approach: 'Aproximando os garfos', loading: 'Elevando o pallet',
  pickup_clear: 'Recuando com o pallet', carrying: 'Transportando o lote', deposit_align: 'Alinhando a entrega',
  deposit_approach: 'Posicionando o pallet', unloading: 'Abaixando o pallet', clearance: 'Liberando a estação',
  station_approach: 'Buscando a peça', station_pick: 'Retirando a peça do pallet', station_carry_in: 'Levando a peça à máquina',
  station_place: 'Posicionando a peça na máquina', station_retreat: 'Preparando a operação', parking: 'Estacionando fora do corredor'
};

// Five columns on the existing 5.7 m bed, filled front to rear. Each row has
// its own straight approach so previously loaded pallets are never crossed.
export const MPS_TRUCK_BAYS = Object.freeze([18.6, 19.8].flatMap(z => [11.05, 12.2, 13.35, 14.5, 15.65].map(x => [x, z])));
export const MPS_FORKLIFT_PARKS = Object.freeze([[21.5, -12.5], [21.5, .1], [21.5, 6.5]]);
export const MPS_TRUCK_EXIT_SECONDS = 3;
export const MPS_BUFFER_PASSAGE = Object.freeze({ x: -8.9, lowerZ: 11.8 });
const allBays = { ...STAGING_BAYS, truck: MPS_TRUCK_BAYS };
const platformAt = p => Math.abs(p[1] - 19.2) <= 1.21 && p[0] >= 10.5 ? .84 * clamp((17.8 - p[0]) / 1.6) : 0;
const approach = (stage, point) => stage === 'truck' ? [TRANSPORT_LANES.east, point[1]] : bayApproach(stage, point);
const route = (from, to, start, end) => {
  if (from === 'buffer' && to === 'm1' && approach(from, start)[1] > 0) {
    // The front buffer row has a direct passage beside the office. Keep the
    // lower turn beyond its front edge; rear-row pallets still use the east
    // aisle because the component rack obstructs their western approach.
    const a = approach(from, start), b = approach(to, end), { x, lowerZ } = MPS_BUFFER_PASSAGE;
    return [start, a, [x, a[1]], [x, lowerZ], [b[0], lowerZ], b, end]
      .filter((p, i, points) => !i || distance(p, points[i - 1]) > EPS);
  }
  if (from !== 'truck' && to !== 'truck') return routeFor(from, to, { start, end });
  const a = approach(from, start), b = approach(to, end), points = [start, a];
  if (Math.abs(a[1] - b[1]) > EPS) points.push([TRANSPORT_LANES.east, a[1]], [TRANSPORT_LANES.east, b[1]]);
  points.push(b, end);
  return points.filter((p, i) => !i || distance(p, points[i - 1]) > EPS);
};

function syncVehicle(state) {
  const v = state.vehicle;
  if (!v) return;
  const behind = v.position.map((p, i) => p - v.direction[i] * FORKLIFT_GEOMETRY.bodyOffset);
  v.groundHeight = platformAt(behind);
  v.forkLift = Math.max(0, platformAt(v.position) + v.travelLift - v.groundHeight);
  v.vehicleDirection = [...v.direction];
  if (state.load.onCart) {
    const l = state.load;
    l.position = [...v.position];
    l.palletY = .05 + platformAt(v.position) + v.travelLift;
    l.partPosition = floorPart(v.position, .3 + platformAt(v.position) + v.travelLift);
    l.palletDirection = [...v.direction];
  }
}

function builder(initial) {
  let state = copy(initial);
  const phases = [];
  const add = (key, weight, update) => {
    const start = copy(state);
    const sample = t => { const s = copy(start); update(s, clamp(t), start); return s; };
    state = sample(1);
    phases.push({ key, weight: Math.max(.01, weight), sample });
  };
  const faceOperator = (key, target, carrying = false) => {
    const goal = direction(state.operator.position, target), turn = Math.abs(angle(state.operator.direction, goal));
    if (turn < EPS) return;
    add(key, turn / 3.2, (s, t, a) => {
      s.operator.direction = rotate(a.operator.direction, goal, t);
      if (carrying) s.load.partPosition = handPart(s.operator);
    });
  };
  const walk = (key, station, end, carrying = false) => {
    const points = operatorRoute(station, state.operator.position, end);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (distance(state.operator.position, p) < EPS) continue;
      faceOperator(key, p, carrying);
      const len = distance(state.operator.position, p);
      add(key, len / 2.1, (s, t, a) => {
        s.operator.position = mix(a.operator.position, p, t);
        s.operator.distance = a.operator.distance + len * t;
        if (carrying) s.load.partPosition = handPart(s.operator);
      });
    }
  };
  const faceVehicle = (key, goal) => {
    const turn = Math.abs(angle(state.vehicle.direction, goal));
    if (turn < EPS) return;
    add(key, turn / 3.2, (s, t, a) => {
      s.vehicle.direction = rotate(a.vehicle.direction, goal, t);
      syncVehicle(s);
    });
  };
  const drive = (key, points, reverse = false) => {
    for (let i = 1; i < points.length; i++) {
      const p = points[i], len = distance(state.vehicle.position, p);
      if (len < EPS) continue;
      if (!reverse) faceVehicle(key, direction(state.vehicle.position, p));
      add(key, len / (reverse ? 2 : 3.2), (s, t, a) => {
        s.vehicle.position = mix(a.vehicle.position, p, t);
        s.vehicle.distance = a.vehicle.distance + len * t;
        s.vehicle.wheelDistance = a.vehicle.wheelDistance + (reverse ? -len : len) * t;
        syncVehicle(s);
      });
    }
  };
  const pick = (key, station, from) => {
    faceOperator(key, [from[0], from[2]]);
    add(key, .8, (s, t, a) => {
      s.load.partLocation = 'hands';
      s.load.stationId = station;
      s.load.machineIndex = STATION_HANDLING[station].machineIndex;
      s.load.partPosition = mix(a.load.partPosition, handPart(s.operator), t);
    });
  };
  const place = (key, target, location, station = null) => {
    faceOperator(key, [target[0], target[2]], true);
    add(key, .8, (s, t, a) => {
      s.load.partPosition = mix(a.load.partPosition, target, t);
      if (t >= 1) {
        s.load.partLocation = location;
        s.load.stationId = station;
        s.load.machineIndex = station ? STATION_HANDLING[station].machineIndex : null;
      }
    });
  };
  return { phases, add, walk, drive, pick, place, faceOperator, faceVehicle, get state() { return state; } };
}

function timePhases(phases, start, end) {
  const sum = phases.reduce((n, p) => n + p.weight, 0) || 1;
  let cursor = start;
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    p.start = cursor;
    p.end = i === phases.length - 1 ? end : cursor + (end - start) * p.weight / sum;
    cursor = p.end;
  }
}

function initialFleet() {
  return ['stock', 'buffer', 'insp'].map((stage, id) => ({
    id, key: `forklift-${id + 1}`, stage,
    position: [...MPS_FORKLIFT_PARKS[id]], direction: [0, -1], vehicleDirection: [0, -1],
    distance: 0, wheelDistance: 0, forkLift: 0, travelLift: 0, groundHeight: 0,
    active: false, parked: true, lotId: null, phaseKey: null
  }));
}
function initialOperators() {
  return new Map(Object.entries(STATION_HANDLING).map(([station, cfg]) => [station, {
    stationId: station, position: [...cfg.stand], direction: [0, -1], distance: 0
  }]));
}

function reserveBays(lots, events, stagingBays = allBays) {
  const reservations = new Map(), visits = [];
  for (const lot of lots) {
    const transfers = events.filter(e => e.kind === 'transfer' && String(e.lotId) === String(lot.id));
    if (!transfers.length) continue;
    const first = transfers[0];
    visits.push({ key: `${lot.id}:stock`, stage: first.from, start: first.start, end: first.end });
    for (let i = 0; i < transfers.length; i++) {
      const e = transfers[i], next = transfers[i + 1];
      visits.push({ key: `${lot.id}:${e.to}`, stage: e.to, start: e.start, end: next?.end ?? Number(lot.shippedAt ?? Infinity) + MPS_TRUCK_EXIT_SECONDS });
    }
  }
  visits.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
  const occupied = new Map(Object.keys(stagingBays).map(stage => [stage, []]));
  for (const visit of visits) {
    const bays = stagingBays[visit.stage];
    if (!bays) continue;
    const stage = occupied.get(visit.stage);
    const slot = bays.findIndex((_, i) => (stage[i] ?? -Infinity) <= visit.start + EPS);
    if (slot < 0) throw new Error(`MPS: capacidade visual de ${visit.stage} excedida em ${visit.start.toFixed(2)} s.`);
    stage[slot] = visit.end;
    reservations.set(visit.key, [...bays[slot]]);
  }
  return reservations;
}

function compileTransfer(event, initial, destination, parkAfter) {
  const b = builder(initial), cfg = STATION_HANDLING[event.from], bay = [...initial.load.position];
  const source = cfg && initial.load.partLocation === 'machine';
  if (source) {
    const stand = bayWorkerStand(bay);
    b.walk('source_approach', event.from, cfg.workStand);
    b.pick('source_pick', event.from, cfg.fixture);
    b.walk('source_carry_out', event.from, stand, true);
    b.place('source_place', floorPart(bay), 'bay');
    b.walk('source_return', event.from, cfg.stand);
    b.faceOperator('source_return', [cfg.fixture[0], cfg.fixture[2]]);
  }
  const sourceCount = b.phases.length;
  const fromApproach = approach(event.from, bay), toApproach = approach(event.to, destination);
  if (initial.vehicle.parked) {
    // Leave the pocket in reverse so the rear stays inside the factory floor.
    const parkExit = [TRANSPORT_LANES.east, b.state.vehicle.position[1]];
    b.faceVehicle('pickup', [1, 0]);
    b.drive('pickup', [b.state.vehicle.position, parkExit], true);
    b.drive('pickup', [parkExit, [TRANSPORT_LANES.east, fromApproach[1]], fromApproach]);
  } else {
    // The previous mission already left the forks clear of its pallet. When
    // this vehicle keeps the corridor, proceed directly to its next pickup.
    b.drive('pickup', route(initial.vehicle.stage, event.from, b.state.vehicle.position, fromApproach));
  }
  b.faceVehicle('fork_align', direction(fromApproach, bay));
  b.drive('fork_approach', [fromApproach, bay]);
  b.add('loading', .7, (s, t) => {
    s.load.onCart = true; s.load.vehicleId = s.vehicle.id; s.load.partLocation = 'cart';
    s.load.stationId = null; s.load.machineIndex = null;
    s.vehicle.travelLift = .3 * t; syncVehicle(s);
  });
  b.drive('pickup_clear', [bay, fromApproach], true);
  b.drive('carrying', route(event.from, event.to, fromApproach, toApproach));
  b.faceVehicle('deposit_align', direction(toApproach, destination));
  b.drive('deposit_approach', [toApproach, destination]);
  b.add('unloading', .7, (s, t, a) => {
    s.vehicle.travelLift = .3 * (1 - t); syncVehicle(s);
    if (event.to === 'truck') {
      s.load.palletY = a.load.palletY + (.89 - a.load.palletY) * t;
      s.load.partPosition = mix(a.load.partPosition, floorPart(destination, 1.13), t);
    }
    if (t >= 1) {
      s.load.onCart = false; s.load.vehicleId = null; s.load.stage = event.to;
      s.load.partLocation = event.to === 'truck' ? 'truck' : 'bay';
      s.load.position = [...destination];
      s.load.stationId = null; s.load.machineIndex = null;
    }
  });
  b.drive('clearance', [destination, toApproach], true);
  if (parkAfter) {
    const park = MPS_FORKLIFT_PARKS[initial.vehicle.id];
    b.drive('parking', [toApproach, [TRANSPORT_LANES.east, toApproach[1]], [TRANSPORT_LANES.east, park[1]], park]);
    b.faceVehicle('parking', [0, -1]);
  }
  const extractionEnd = source ? event.start + (event.end - event.start) * .35 : event.start;
  if (sourceCount) timePhases(b.phases.slice(0, sourceCount), event.start, extractionEnd);
  timePhases(b.phases.slice(sourceCount), extractionEnd, event.end);
  b.state.vehicle.stage = event.to;
  b.state.vehicle.parked = parkAfter;
  return { phases: b.phases, final: copy(b.state), station: source ? event.from : null, vehicleStart: extractionEnd, parkAfter };
}

function compileStation(event, initial) {
  const station = event.station || event.to, cfg = STATION_HANDLING[station];
  const b = builder(initial), bay = initial.load.position;
  b.walk('station_approach', station, bayWorkerStand(bay));
  b.pick('station_pick', station, floorPart(bay));
  b.walk('station_carry_in', station, cfg.workStand, true);
  b.place('station_place', cfg.fixture, 'machine', station);
  b.add('station_retreat', .45, () => {});
  timePhases(b.phases, event.start, event.end);
  return { phases: b.phases, final: copy(b.state), station };
}

/** Compile once; the returned sample(seconds) is independent of call history. */
export function compileMpsHandling(snapshot, { stagingBays = allBays } = {}) {
  const lots = snapshot.lots || [];
  const events = (snapshot.timeline || lots.flatMap(l => l.timeline || [])).map(e => ({ ...e, kind: e.kind || e.type }))
    .filter(e => e.kind === 'transfer' || e.kind === 'station-load').sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));
  const lotById = new Map(lots.map(l => [String(l.id), l]));
  // Source handling may overlap a previous drive. Only the logistics portion
  // owns the corridor; compare missions in that order, not event-start order.
  const logisticsStart = e => e.start + (STATION_HANDLING[e.from] ? .35 : 0) * (e.end - e.start);
  const missions = events.filter(e => e.kind === 'transfer').sort((a, b) => logisticsStart(a) - logisticsStart(b));
  const parkAfter = new Map(missions.map((e, i) => [e.id,
    !missions[i + 1] || vehicleIndex(missions[i + 1].vehicleId) !== vehicleIndex(e.vehicleId)]));
  const bays = reserveBays(lots, events, stagingBays), fleet = initialFleet(), operators = initialOperators(), loads = new Map(), compiled = [];
  for (const event of events) {
    const id = String(event.lotId), lot = lotById.get(id);
    if (!lot) continue;
    if (!loads.has(id)) {
      const position = bays.get(`${lot.id}:stock`) || [...stagingBays[event.from][0]];
      loads.set(id, { batchId: lot.id, lotId: lot.id, orderId: lot.orderId || lot.product, product: lot.product, quantity: lot.quantity,
        week: lot.week, stage: event.from, partStage: event.from, position, palletY: .05, onCart: false,
        partLocation: 'bay', partPosition: floorPart(position), stationId: null, machineIndex: null, vehicleId: null });
    }
    const station = event.kind === 'station-load' ? event.station || event.to : event.from;
    const vehicleId = vehicleIndex(event.vehicleId);
    const initial = { load: copy(loads.get(id)), operator: operators.has(station) ? copy(operators.get(station)) : null,
      vehicle: event.kind === 'transfer' ? copy(fleet[vehicleId]) : null };
    if (event.kind === 'transfer' && STATION_HANDLING[event.from]) initial.load.partStage = event.from;
    const data = event.kind === 'transfer' ? compileTransfer(event, initial, bays.get(`${lot.id}:${event.to}`), parkAfter.get(event.id)) : compileStation(event, initial);
    compiled.push({ ...event, ...data, initial, vehicleId });
    loads.set(id, copy(data.final.load));
    if (data.station) operators.set(data.station, copy(data.final.operator));
    if (event.kind === 'transfer') fleet[vehicleId] = copy(data.final.vehicle);
  }
  const byLot = new Map(), byVehicle = [[], [], []], byStation = new Map();
  for (const e of compiled) {
    const id = String(e.lotId);
    if (!byLot.has(id)) byLot.set(id, []);
    byLot.get(id).push(e);
    if (e.kind === 'transfer') byVehicle[e.vehicleId].push(e);
    if (e.station) {
      if (!byStation.has(e.station)) byStation.set(e.station, []);
      byStation.get(e.station).push(e);
    }
  }
  for (const track of byVehicle) track.sort((a, b) => a.vehicleStart - b.vehicleStart);
  const latest = (track, t, field = 'start') => {
    let lo = 0, hi = track.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (track[mid][field] <= t) lo = mid + 1; else hi = mid; }
    return lo ? track[lo - 1] : null;
  };
  return {
    events: compiled,
    sample(seconds = 0) {
      const elapsed = Math.max(0, Number(seconds) || 0), result = {
        elapsed, loads: new Map(), operators: initialOperators(), machineOccupants: new Map(),
        fleet: initialFleet(), stationActions: new Map(), activeTransfers: []
      };
      const sampled = new Map();
      const at = e => {
        if (sampled.has(e)) return sampled.get(e);
        const finished = elapsed >= e.end;
        let state = e.final, phase = null, progress = 1;
        if (!finished) {
          phase = e.phases.find(p => elapsed < p.end) || e.phases.at(-1);
          progress = clamp((elapsed - phase.start) / Math.max(EPS, phase.end - phase.start));
          state = phase.sample(progress);
        }
        const value = { state, phase, progress, finished };
        sampled.set(e, value);
        return value;
      };
      for (const [id, track] of byLot) {
        const lot = lotById.get(id);
        if (elapsed >= Number(lot.shippedAt ?? Infinity) + MPS_TRUCK_EXIT_SECONDS) continue;
        const e = latest(track, elapsed);
        if (e) result.loads.set(id, copy(at(e).state.load));
      }
      for (let id = 0; id < byVehicle.length; id++) {
        const e = latest(byVehicle[id], elapsed, 'vehicleStart');
        if (!e) continue;
        const { state, phase, finished } = at(e), v = copy(state.vehicle);
        v.active = !finished; v.lotId = finished ? null : e.lotId; v.phaseKey = phase?.key || null;
        result.fleet[id] = v;
        if (!finished) result.activeTransfers.push({ id: e.id, lotId: e.lotId, from: e.from, to: e.to,
          vehicleId: id, phaseKey: phase.key, progress: clamp((elapsed - e.start) / (e.end - e.start)) });
      }
      for (const [station, track] of byStation) {
        const e = latest(track, elapsed);
        if (!e) continue;
        const { state, phase, progress, finished } = at(e);
        result.operators.set(station, copy(state.operator));
        if (!finished && /^(station|source)_/.test(phase.key)) {
          result.stationActions.set(station, {
            id: e.id, kind: 'station', stationId: station, batchId: e.lotId, lotId: e.lotId,
            phase: labels[phase.key], phaseKey: phase.key, phaseProgress: progress,
            progress: clamp((elapsed - e.start) / (e.end - e.start)),
            operatorPosition: [...state.operator.position], operatorDirection: [...state.operator.direction],
            operatorDistance: state.operator.distance, partPosition: [...state.load.partPosition], partLocation: state.load.partLocation,
            machineIndex: STATION_HANDLING[station].machineIndex, stationName: stageNames[station]
          });
        }
      }
      for (const [id, load] of result.loads) if (load.partLocation === 'machine') result.machineOccupants.set(load.stationId, id);
      return result;
    }
  };
}

const cachedPlans = new WeakMap();
/** Scene entry point. Pass a stable snapshot.timeline array to reuse its plan. */
export function sampleMpsHandling(snapshot, elapsed = snapshot.elapsed ?? snapshot.time ?? 0) {
  const key = snapshot.timeline || snapshot.lots;
  if (!key) return compileMpsHandling(snapshot).sample(elapsed);
  let plan = cachedPlans.get(key);
  if (!plan) { plan = compileMpsHandling(snapshot); cachedPlans.set(key, plan); }
  return plan.sample(elapsed);
}
