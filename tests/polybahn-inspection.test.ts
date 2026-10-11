import {test} from 'node:test';
import assert from 'node:assert/strict';
import placements from '../apps/client/src/npcPrototype/placements.json' with {type:'json'};
// @ts-expect-error The client encounter helper is JavaScript.
import {crossesStationDoorway,completedUnticketedPolybahnRide} from '../apps/client/src/npcPrototype/src/npcs/polybahn/station-doorway.js';

test('the whole Polybahn exit catches left, right, center, and fast crossings',()=>{
 const door=placements.polybahnInspector.doorway;
 const point=(u:number,v:number)=>({x:door.position[0]+u*door.normal[0]-v*door.normal[1],y:door.height,z:door.position[1]+u*door.normal[1]+v*door.normal[0]});
 for(const side of [-5.6,-3,0,3,5.6])assert.equal(crossesStationDoorway(point(-4,side),point(4,side),door),true);
 assert.equal(crossesStationDoorway(point(-4,8),point(4,8),door),false);
 assert.equal(crossesStationDoorway(null,{...point(0,0),y:8},door),false);
});

test('inspection requires a completed ride without a ticket; passing or boarding alone is insufficient',()=>{
 assert.equal(completedUnticketedPolybahnRide(null,10000),false);
 assert.equal(completedUnticketedPolybahnRide({arrival:20000,ticketed:false},10000),false);
 assert.equal(completedUnticketedPolybahnRide({arrival:9000,ticketed:true},10000),false);
 assert.equal(completedUnticketedPolybahnRide({arrival:9000,ticketed:false},10000),true);
});
