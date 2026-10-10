import assert from 'node:assert/strict';
import {createVehiclePassengers,VEHICLE_CAPACITIES} from './vehicle-passengers.js';
for(const [type,capacity] of Object.entries(VEHICLE_CAPACITIES)){
 const v=createVehiclePassengers(type);
 for(let i=0;i<capacity;i++)assert.equal(v.board(`p${i}`).slot,i);
 assert.equal(v.board('overflow'),null);assert.equal(v.board('p0'),null);
 assert(v.leave('p0'));assert.equal(v.board('new').slot,0);
 v.beginBoarding();v.tick(3);v.beginBoarding();assert.equal(v.state().departureIn,5);
 v.tick(NaN);v.tick(-10);assert.equal(v.state().departureIn,5);
 assert(v.tick(5));v.closeBoarding();assert.equal(v.state().boarding,false);
 const snapshot=v.state();snapshot.passengers[0].slot=999;assert.notEqual(v.state().passengers[0].slot,999);
 v.clear();assert.equal(v.state().occupancy,0);
}
console.log('PASS: all vehicle capacities, unique slots, duplicate/full rejection, slot reuse, shared countdown and reset.');
