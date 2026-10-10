import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial} from 'three';
import * as C from '../packages/shared/src/index.ts';
import {createTramBoardingZone,updateTramBoardingZone} from '../apps/client/src/multiplayer/tramBoardingZone.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';
import {RaceState,Player} from '../apps/server/src/state.ts';
import type {Client} from 'colyseus';

test('boarding circle matches server eligibility at both stops and hides during trips',()=>{
 const zone=createTramBoardingZone(),state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld),v=state.vehicles.get('tram-1')!,now=100000;
 const messages:{ok:boolean}[]=[],client={sessionId:'a',send:(_type:string,result:{ok:boolean})=>messages.push(result)} as unknown as Client;
 const p=new Player();state.players.set('a',p);
 try{
  for(const distance of [C.TRAM_START_DISTANCE,C.tramPath.length]){
   v.railDistance=distance;Object.assign(v,C.railFrame(v));v.departureAt=0;
   const point=C.railBoardingPoint(v);Object.assign(p,point);p.vehicleId='';
   assert.equal(updateTramBoardingZone(zone,v,v,p,now,true),true);assert.equal(zone.visible,true);
   const ring=zone.children[1] as Mesh<import('three').RingGeometry,MeshBasicMaterial>;
   assert.equal(ring.geometry.parameters.outerRadius,C.VEHICLE_BOARD_DISTANCE);assert.equal(ring.material.color.getHexString(),'83f3a6');
   p.x=point.x+C.VEHICLE_BOARD_DISTANCE+.1;
   assert.equal(updateTramBoardingZone(zone,v,v,p,now,true),false);
   manager.enter(client,'tram-1',now);assert.equal(messages.at(-1)?.ok,false);
   p.x=point.x+C.VEHICLE_BOARD_DISTANCE-.1;
   manager.enter(client,'tram-1',now);assert.equal(messages.at(-1)?.ok,true);assert.equal(p.vehicleId,'tram-1');
   updateTramBoardingZone(zone,v,v,p,now,true);assert.equal(zone.visible,false);
   manager.exit(client);assert.equal(p.vehicleId,'');
   v.traveling=true;updateTramBoardingZone(zone,v,v,p,now,true);assert.equal(zone.visible,false);v.traveling=false;
   v.departureAt=now;updateTramBoardingZone(zone,v,v,p,now,true);assert.equal(zone.visible,false);v.departureAt=0;
   updateTramBoardingZone(zone,v,v,p,now,false);assert.equal(zone.visible,false);
  }
 }finally{zone.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();(o.material as MeshBasicMaterial).dispose();}});}
});
