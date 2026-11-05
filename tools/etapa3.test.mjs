import test from 'node:test';
import assert from 'node:assert/strict';
import {FactoryFilm} from './prepared-test-helpers.mjs';
import {sampleDbrHandling} from '../dbr-handling.js';
import {INTERNAL_LINKS, INTERNAL_LAYOUT} from '../internal-layout.js';
import {sampleFilmActors} from '../film-actors.js';
import {createInternalCart} from '../internal-cart.js';
import {Box3} from '../vendor/three.module.js';

const film=new FactoryFilm(), EPS=1e-7;
const schedule=film.schedule, plan=schedule.internalTransportPlan;
const transfers=schedule.timeline.filter(e=>e.kind==='transfer'&&INTERNAL_LINKS.includes(`${e.from}>${e.to}`));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

test('all 535 internal transfers use the five pallet-jack links without a forklift',()=>{
  assert.equal(transfers.length,535);
  assert.equal(new Set(transfers.map(e=>e.id)).size,535);
  for(const link of INTERNAL_LINKS)assert.equal(transfers.filter(e=>`${e.from}>${e.to}`===link).length,107,link);
  for(const e of transfers){assert.equal(e.transportMode,'trolley',e.id);assert.equal(e.vehicleIndex,null,e.id);assert.equal(e.vehicleId,null,e.id);}
  assert.equal(plan.missions.length,535);
  assert.deepEqual(plan.missions.map(m=>m.transfer.id).sort(),transfers.map(e=>e.id).sort());
});

test('each original pallet moves between its actual bays on the assigned jack, with its operator',()=>{
  for(const m of plan.missions){
    const e=transfers.find(e=>e.id===m.transfer.id),positions=[];
    assert.ok(m.transfer.end-m.pickupStart>=.1-EPS,e.id);
    assert.equal(e.startHours,m.transfer.startHours,e.id);assert.equal(e.endHours,m.transfer.endHours,e.id);
    for(let i=0;i<=12;i++){
      const t=m.pickupStart+(m.transfer.end-m.pickupStart)*i/12;
      const handling=sampleDbrHandling(film.seek(t),t),load=handling.loads.get(e.lotId);
      const carrier=handling.carriers.find(c=>c.id===m.carrier.id),operator=handling.operators.get(m.operator.id);
      assert.ok(load,e.id);assert.ok(carrier,e.id);assert.ok(operator,e.id);
      assert.equal(load.lotId,e.lotId,e.id);assert.equal(load.partLocation,'trolley',e.id);
      assert.equal(load.carrierId,m.carrier.id,e.id);assert.equal(load.operatorId,m.operator.id,e.id);
      assert.equal(load.onCart,false,e.id);assert.equal(load.vehicleId,null,e.id);
      assert.ok(load.position.every(Number.isFinite),e.id);
      assert.ok(distance(load.position,carrier.position)<EPS,e.id);
      assert.ok(Math.abs(load.palletY-carrier.deckHeight)<EPS,e.id);
      assert.ok(load.quantity>0&&load.quantity<=e.quantity+EPS,e.id);
      positions.push(load.position);
    }
    assert.ok(distance(positions[0],e.fromPosition)<EPS,`${e.id} source`);
    assert.ok(distance(positions.at(-1),e.toPosition)<EPS,`${e.id} destination`);
    assert.ok(positions.some(p=>distance(p,positions[0])>.1),`${e.id} movement`);
  }
});

test('independent pallet-jack cycles can overlap without duplicating resources',()=>{
  assert.ok(plan.missions.some(a=>plan.missions.some(b=>a!==b&&a.carrier.id!==b.carrier.id&&a.operator.id!==b.operator.id&&a.start<b.end&&b.start<a.end)));
  for(const [i,a]of plan.missions.entries()){
    assert.ok(a.start<a.pickupStart&&a.transfer.end<a.end,a.transfer.id);
    for(const b of plan.missions.slice(i+1))if(a.carrier.id===b.carrier.id||a.operator.id===b.operator.id||a.transfer.lotId===b.transfer.lotId){
      assert.ok(a.end<=b.start+EPS||b.end<=a.start+EPS,`${a.transfer.id}/${b.transfer.id}`);
    }
    for(const p of schedule.timeline.filter(p=>p.kind==='process'&&`${p.station}:${p.machineIndex??0}`===a.operator.id)){
      assert.ok(a.end<=p.start+EPS||p.end<=a.start+EPS,`${a.transfer.id}/${p.id}`);
    }
  }
});

test('five visible jacks have permanent parking and no load retains a roller pose',()=>{
  for(let tick=0;tick<=1200;tick++){
    const t=tick/2,handling=sampleDbrHandling(film.seek(t));
    assert.equal(handling.carriers.length,5,`${t}s`);
    assert.equal(new Set(handling.carriers.map(c=>c.id)).size,5,`${t}s`);
    for(const c of handling.carriers){
      const park=INTERNAL_LAYOUT.parking.find(p=>p.id===c.id);assert.ok(park,c.id);assert.equal(c.visible,true,c.id);
      if(t===0||t===600){assert.deepEqual(c.position,park.position);assert.deepEqual(c.direction,park.direction);}
    }
    for(const load of handling.loads.values())assert.notEqual(load.partLocation,'conveyor',`${t}: ${load.lotId}`);
  }
});

test('joint swept-volume audit covers all cycles, parked carts, occupied bays and working operators',()=>{
  const a=schedule.internalAllocation,audit=a.audit;
  assert.equal(a.complete,true);assert.equal(a.assignments.length,535);assert.equal(audit.complete,true);
  assert.deepEqual(audit.interval,[0,600]);assert.equal(audit.parkedCarriers,5);
  assert.ok(audit.externalSweeps>0);assert.ok(audit.internalEnvelopes>0);assert.ok(audit.upstreamOperatorEnvelopes>0);
  for(const key of ['missing','duplicates','unexpected','conflicts','bayConflicts','staticConflicts','palletConflicts'])assert.deepEqual(audit[key],[],key);
});

test('the guided tour clears the actual parked pallet-jack geometry',()=>{
  const cart=createInternalCart();
  try{
    const parks=INTERNAL_LAYOUT.parking.map(p=>{cart.update({...p,deckHeight:.05});cart.group.updateMatrixWorld(true);return {id:p.id,box:new Box3().setFromObject(cart.group)};});
    for(let tick=1500;tick<2700;tick++)for(const name of ['Ricardo','Rafael']){
      const t=tick/20,p=sampleFilmActors(t)[name].position;
      for(const {id,box}of parks){
        // During the educational cycle jack-lap leaves its parking spot.
        if(id==='jack-lap'&&t>=79&&t<94.6)continue;
        const dx=Math.max(box.min.x-p[0],0,p[0]-box.max.x),dz=Math.max(box.min.z-p[1],0,p[1]-box.max.z);
        assert.ok(Math.hypot(dx,dz)>=.3,`${name}/${id} at ${t}`);
      }
    }
  }finally{cart.destroy();}
});
