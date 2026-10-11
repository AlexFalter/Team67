import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'colyseus';
import * as C from '../packages/shared/src/index.ts';
import { Player, RaceState } from '../apps/server/src/state.ts';
import { VehicleManager } from '../apps/server/src/vehicles.ts';
import { RemotePlayers } from '../apps/client/src/multiplayer/remotePlayers.ts';
import { Scene } from 'three';

test('walking stands up, follows the inclined cabin, and stays inside the aisle', () => {
 const v=C.createVehicle(C.POLYBAHN_KIND); Object.assign(v,C.railFrame(v));
 const p=C.createBody(); p.vehicleId='polybahn-1';p.vehicleKind=v.kind;p.seat=0;
 C.stepCabin(p,{x:Math.sin(v.rotY),z:Math.cos(v.rotY),sprint:false,jump:false},.1,v);
 assert.equal(p.cabinStanding,true); assert.equal(p.anim,1);
 assert.ok(Math.abs(p.cabinZ!-1.81)<1e-6);
 for(let i=0;i<500;i++) C.stepCabin(p,{x:1,z:1,sprint:true,jump:true},.1,v);
 assert.ok(Math.abs(p.cabinX!)<=.22 && Math.abs(p.cabinZ!)<=2);
 C.cabinPosition(v,p); const before={x:p.x,y:p.y,z:p.z};
 v.railDistance=50;Object.assign(v,C.railFrame(v));C.cabinPosition(v,p);
 assert.ok(Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z)>40);
 assert.equal(p.grounded,true);
 C.stepCabin(p,C.IDLE_INPUT,.1,v);assert.equal(p.anim,0);assert.equal(p.cabinStanding,true);
});

test('server retains distinct seats, rejects forged cabin reports, and replicates walking to another player', () => {
 const state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld),v=state.vehicles.get('polybahn-1')!;
 const clients=['a','b'].map(sessionId=>({sessionId,send:()=>{}} as unknown as Client));
 for(const client of clients){state.players.set(client.sessionId,new Player(C.railBoardingPoint(v)));manager.enter(client,'polybahn-1',Date.now());}
 const p=state.players.get('a')!,b=state.players.get('b')!;
 assert.notEqual(p.seat,b.seat);
 const seat=p.seat,z=C.railSeat(v,seat).z;
 manager.walkCabin('a',['polybahn-1',0,z-.1,0,1]);
 assert.equal(p.cabinStanding,true);assert.equal(p.seat,seat);assert.equal(b.cabinStanding,false);
 const actual=p.cabinZ;
 manager.walkCabin('a',['polybahn-1',10,10,0,1]);assert.equal(p.cabinZ,actual);
 manager.walkCabin('b',['polybahn-2',0,0,0,1]);assert.equal(b.cabinStanding,false);
 manager.walkCabin('a',['polybahn-1',0,-1.9,0,1]);assert.equal(p.cabinZ,actual);
 const remotes=new RemotePlayers(new Scene());
 remotes.patch(state,'b');remotes.render(state.serverTime,new Map([['polybahn-1',{rendered:v}]]));
 const shown=remotes.players.get('a')!.rendered;
 assert.equal(shown.cabinStanding,true);assert.equal(shown.anim,1);
 assert.ok(Math.hypot(shown.x-p.x,shown.y-p.y,shown.z-p.z)<1e-8);
 remotes.dispose();
 manager.exit(clients[0]);assert.equal(p.cabinStanding,false);assert.equal(p.vehicleId,'');
 manager.enter(clients[0],'polybahn-1',Date.now());assert.equal(p.cabinStanding,false);
});
