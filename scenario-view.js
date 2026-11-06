import { DBR_LAYOUT, DBR_BAYS } from './dbr-layout.js';

// Stationary inventory representation. No prepared transport mission is sampled.
export function scenarioPresentation(snapshot) {
  const loads = new Map(), machineOccupants = new Map();
  const byId = new Map(snapshot.lots.map(lot => [lot.id, lot]));
  function add(lot, stage, position, extra = {}) {
    loads.set(lot.id, { id: lot.id, batchId: lot.id, orderId: lot.orderId, product: lot.product, quantity: lot.quantity,
      stage, partStage: stage, position: [...position], palletY: .05, partPosition: [position[0], .3, position[1]],
      partLocation: 'bay', onCart: false, stationId: null, machineIndex: null, ...extra });
  }
  for (const pallet of snapshot.buffer.pallets) {
    const fixture = DBR_LAYOUT.m1[byId.get(pallet.id)?.machineSlots?.m1 ?? 0];
    const position = pallet.feeding ? [fixture[0], fixture[2]] : DBR_BAYS.buffer[pallet.slot];
    add(pallet, pallet.feeding ? 'm1' : 'buffer', position, { inventoryLabel: true, partStage: 'rosq', ...(pallet.feeding ? {
      partLocation: 'machine', stationId: 'm1', machineIndex: byId.get(pallet.id)?.machineSlots?.m1 ?? 0, partPosition: [...fixture]
    } : {}) });
  }
  for (const station of snapshot.stations) for (const active of station.activeLots ?? []) {
    const lot = byId.get(active.id);
    if (!lot) continue;
    const fixture = DBR_LAYOUT[station.id]?.[active.machineIndex];
    if (!fixture) continue;
    if (!loads.has(lot.id)) add(lot, station.id, [fixture[0], fixture[2]], { partLocation: 'machine', partPosition: [...fixture], stationId: station.id, machineIndex: active.machineIndex });
    machineOccupants.set(`${station.id}:${active.machineIndex}`, lot.id);
  }
  for (const lot of snapshot.dispatch.pallets) add(lot, 'dispatch', DBR_BAYS.dispatch[lot.dispatchSlot], { partStage: 'dispatch' });
  return { loads, machineOccupants, operators: new Map(), stationActions: new Map(), fleet: [], carriers: [], visualTrips: [] };
}
