import assert from 'node:assert/strict';
import {VEHICLE_SEATS,VEHICLE_CAPACITIES} from './vehicle-seats.js';
import {createVehiclePassengers} from './vehicle-passengers.js';
for(const [type,seats] of Object.entries(VEHICLE_SEATS)){
 assert.equal(seats.length,VEHICLE_CAPACITIES[type]);assert.equal(new Set(seats.map(s=>s.id)).size,seats.length);
 assert.equal(new Set(seats.map(s=>[s.part,...s.position].join(','))).size,seats.length);
 const v=createVehiclePassengers(type);
 seats.forEach((seat,i)=>{assert(seat.position.every(Number.isFinite));assert(seat.eye[1]>seat.surface[1]);assert(Number.isFinite(seat.yaw));const p=v.board(`player-${i}`,i);assert.equal(p.seat.id,seat.id);assert.equal(v.seat(p.playerId),seat);});
 assert.equal(v.board('overflow'),null);assert.equal(v.board('duplicate-slot',0),null);
 v.clear();assert.equal(v.board('bad-slot',-1),null);assert.equal(v.board('bad-slot',seats.length),null);
}
for(const s of VEHICLE_SEATS.tram){assert.equal(Math.abs(s.surface[0]),.76);assert([-2.5,-1.3,2.5].includes(s.surface[2]));assert.equal(s.surface[1],1.065);}
for(const s of VEHICLE_SEATS.bus){assert.equal(Math.abs(s.surface[0]),.82);assert.equal(s.surface[1],1.205);assert(s.surface[2]!==-7.75);}
assert.equal(VEHICLE_SEATS.polybahn.filter(s=>s.reservedFor).length,2);
console.log('PASS: every capacity has unique named anchors, seat surfaces, camera positions and facing; assignments match furniture and reserve NPC seats.');
