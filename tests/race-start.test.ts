import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {raceMapRoute} from '../apps/client/src/multiplayer/raceHudModel.ts';
import {withServer,startRound,until,delay,type WireState} from './fixture.ts';
import {RaceState,Player} from '../apps/server/src/state.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';
import type {Client} from 'colyseus';

test('all Zurich respawns use the safe bus drop-off, with deterministic movement replay',()=>{
 const spawn=C.battleBusDropoffs(C.zurichWorld,1)[0];
 assert.deepEqual(C.raceSpawnPoint(C.zurichWorld),spawn);
 assert(!C.zurichWorld.blocked(spawn.x,spawn.y,spawn.z,C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT));
 for(const position of [C.zurichWorld.spawn,C.examPortalPosition]){
  const a={...C.createBody(),...position,y:position.y-40,vx:10,vy:-30,vz:8,grounded:false};const b={...a};
  C.stepPlayer(a,C.IDLE_INPUT,1/60,C.zurichWorld);C.stepPlayer(b,C.IDLE_INPUT,1/60,C.zurichWorld);
  assert.deepEqual(a,b);assert.deepEqual({x:a.x,y:a.y,z:a.z},spawn);assert.equal(a.vx,0);assert.equal(a.vy,0);assert.equal(a.vz,0);
 }
 const flat=C.createBody();C.respawn(flat);assert.deepEqual({x:flat.x,y:flat.y,z:flat.z},C.flatWorld.spawn);
});

test('race map route starts at the bus drop-off and ends at ETH without changing transit routes',()=>{
 const transit=[...C.zurichWorld.route],route=raceMapRoute(C.zurichWorld);
 assert.deepEqual(route[0],C.raceSpawnPoint(C.zurichWorld));assert.deepEqual(route.at(-1),C.examPortalPosition);
 assert.deepEqual(C.zurichWorld.route,transit);assert(!route.some(p=>p.x===transit[0].x&&p.z===transit[0].z),'old shuttle start is trimmed');
});

test('manual respawn releases a moving tram seat and leaves the other passenger aboard',()=>{
 const state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld),tram=state.vehicles.get('tram-1')!;
 for(const id of ['a','b']){
  state.players.set(id,new Player(C.railBoardingPoint(tram)));
  manager.enter({sessionId:id,send(){}} as unknown as Client,'tram-1',100000);
 }
 manager.tick(tram.departureAt+1,()=>{});assert(tram.traveling);
 const player=state.players.get('a')!;manager.releaseForRespawn('a');C.respawn(player,C.zurichWorld);
 assert.equal(player.vehicleId,'');assert.equal(player.seat,-1);assert.equal(player.vehicleKind,-1);
 assert.deepEqual({x:player.x,y:player.y,z:player.z},C.raceSpawnPoint(C.zurichWorld));
 assert.equal(state.players.get('b')!.vehicleId,'tram-1');assert(tram.traveling);
});

test('server accepts bus drop-off respawns for both players and rejects the old spawn', {timeout:30000},async()=>{
 await withServer(async(client,rooms)=>{
  const a=await client.create<WireState>('race',{name:'Alice'});rooms.push(a);
  const b=await client.joinById<WireState>(a.roomId,{name:'Bob'});rooms.push(b);
  let manualRespawns=0;
  for(const room of rooms){room.onMessage('playerCorrection',()=>{});room.onMessage('respawned',()=>{manualRespawns++;});}
  a.send('respawn');await delay(100);assert.equal(manualRespawns,0,'lobby respawns are rejected');
  await startRound(a,[a,b]);const spawn=C.raceSpawnPoint(C.zurichWorld);
  for(const room of [a,b]){
   const p=()=>room.state.players.get(room.sessionId)!;
   const below=C.zurichWorld.height(p().x,p().z)!-20;
   room.send('move',[p().x,below,p().z,0,0,-20,0,2]);await until(()=>Math.abs(p().y-below)<.01,`fall recorded (${below})`);
   const old=C.zurichWorld.spawn;room.send('move',[old.x,old.y,old.z,0,0,0,0,0]);await delay(100);
   assert(Math.abs(p().y-below)<.01,'old spawn teleport rejected');
   if(room===a)room.send('move',[spawn.x,spawn.y,spawn.z,0,0,0,0,0]);else room.send('respawn');
   await until(()=>Math.abs(p().y-spawn.y)<.1,'bus respawn accepted');
   assert(Math.hypot(p().x-spawn.x,p().z-spawn.z)<=C.CAPSULE_RADIUS*2,'respawn is at the drop-off, allowing player contact separation');
  }
  assert.equal(manualRespawns,1);
 },'zurich');
});
