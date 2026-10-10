import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import * as C from '../packages/shared/src/index.ts';
import {TransitScenery} from '../apps/client/src/multiplayer/transitScenery.ts';

test('boarding signs follow vehicle presence, departure, return and derailment', () => {
 const scenery = Object.create(TransitScenery.prototype) as TransitScenery;
 const lower = new Group(), upper = new Group(), poly = new Group();
 Object.assign(scenery, {boardingSigns:[
  {kind:C.TRAM_KIND,distance:C.TRAM_START_DISTANCE,objects:[lower]},
  {kind:C.TRAM_KIND,distance:C.tramPath.length,objects:[upper]},
  {kind:C.POLYBAHN_KIND,distance:0,objects:[poly]},
 ]});
 const tram=C.createVehicle(C.TRAM_KIND), cabin=C.createVehicle(C.POLYBAHN_KIND);
 tram.railDistance=C.TRAM_START_DISTANCE;
 scenery.update([tram,cabin],1000,true);
 assert(lower.visible);assert(!upper.visible);assert(poly.visible);
 tram.departureAt=1000;scenery.update([tram,cabin],1000,true);assert(!lower.visible);
 tram.traveling=true;tram.railDistance=C.tramPath.length;
 scenery.update([tram],2000,true);assert(!upper.visible);assert(!poly.visible);
 tram.traveling=false;tram.departureAt=0;
 scenery.update([tram],3000,true);assert(upper.visible);assert(!lower.visible);
 tram.derailStartedAt=3000;scenery.update([tram],4000,true);assert(!upper.visible);
 tram.derailStartedAt=0;scenery.update([tram],4000,false);assert(!upper.visible);
});
