import {LOGISTICS_LAYOUT} from './logistics-layout.js';
export function logisticsMetrics(timeline,periodEndHours,periodStartHours=0){
 const missions=timeline.filter(e=>['transfer','component-transfer'].includes(e.kind)&&e.transportMode==='forklift'&&e.startHours>=periodStartHours&&e.startHours<periodEndHours);
 const availablePerVehicle=(periodEndHours-periodStartHours)/120*80*.8;
 const perVehicle=LOGISTICS_LAYOUT.fleet.map(v=>{const count=missions.filter(e=>e.vehicleId===v.id).length;return {id:v.id,missions:count,busyHours:count*.2,availableHours:availablePerVehicle};});
 const availableHours=availablePerVehicle*perVehicle.length,busyHours=missions.length*.2;
 return {complete:false,pendingMissions:[],validationPending:['spatial-conflicts','readability'],fleetSize:perVehicle.length,missions:missions.length,busyHours,availableHours,utilization:availableHours?busyHours/availableHours:0,perVehicle,periodStartHours,periodEndHours};
}
