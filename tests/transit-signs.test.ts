import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import * as C from '../packages/shared/src/index.ts';
import {TransitScenery} from '../apps/client/src/multiplayer/transitScenery.ts';

test('boarding signs follow vehicle presence, departure, return and derailment', () => {
 const scenery = Object.create(TransitScenery.prototype) as TransitScenery;
 const lower = new Group(), upper = new Group(), poly = new Group();
 Object.assign(scenery, {boardingSigns:[
  {kind:C.TRAM_KIND,distance:C.TRAM_START_DISTANCE,objects:[lower],instruction:'E TO BOARD · SHARED DEPARTURE'},
  {kind:C.TRAM_KIND,distance:C.tramPath.length,objects:[upper],instruction:'E TO BOARD · SHARED DEPARTURE'},
  {kind:C.POLYBAHN_KIND,distance:0,objects:[poly],instruction:'E TO BOARD · SHARED DEPARTURE'},
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

test('Polybahn station signs switch to leaving instructions for the arriving passenger', () => {
 const scenery = Object.create(TransitScenery.prototype) as TransitScenery;
 const text:string[]=[];
 const ctx={clearRect(){},fillRect(){},strokeRect(){},fillText(value:string){text.push(value);}};
 const sign={kind:C.POLYBAHN_KIND,distance:C.POLYBAHN_START_DISTANCE,objects:[new Group()],
  instruction:'E TO BOARD · SHARED DEPARTURE',title:'POLYBAHN · CENTRAL',texture:{needsUpdate:false},
  canvas:{width:768,height:192,getContext:()=>ctx}};
 Object.assign(scenery,{boardingSigns:[sign]});
 const cabin=C.createVehicle(C.POLYBAHN_KIND);cabin.railDistance=C.POLYBAHN_START_DISTANCE;
 scenery.update([cabin],1000,true,cabin);
 assert.equal(sign.instruction,'BACKSPACE TO LEAVE');assert(text.includes('BACKSPACE TO LEAVE'));
 assert.equal(sign.texture.needsUpdate,true);
 scenery.update([cabin],1000,true);
 assert.equal(sign.instruction,'E TO BOARD · SHARED DEPARTURE');
});
