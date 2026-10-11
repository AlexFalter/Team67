import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {withServer,until,startRound,delay} from './fixture.ts';

test('cow hit detection reaches the body ends and rejects misses, walls and other maps',()=>{
 const time=1000,cow=C.bridgeCowPose(0,time,C.zurichWorld);
 const p={x:cow.x+Math.sin(cow.rotY)*(C.COW_HALF_LENGTH+1),y:cow.y,z:cow.z+Math.cos(cow.rotY)*(C.COW_HALF_LENGTH+1),rotY:cow.rotY+Math.PI};
 assert.equal(C.hitBridgeCow(p,time,C.zurichWorld),0);
 assert.equal(C.hitBridgeCow({...p,rotY:cow.rotY},time,C.zurichWorld),undefined);
 assert.equal(C.hitBridgeCow({...p,y:p.y+5},time,C.zurichWorld),undefined);
 assert.equal(C.hitBridgeCow(p,time,{...C.zurichWorld,blocked:()=>true}),undefined);
 assert.equal(C.hitBridgeCow(p,time,C.flatWorld),undefined);
});
test('a validated cow strike broadcasts one reaction to both multiplayer clients',async()=>{
 await withServer(async(client,rooms)=>{
  const host=await client.create('race',{name:'Cow hitter',devMode:true,skipIntro:true,mapTeleport:true,disableMoodle:true});rooms.push(host);
  const guest=await client.joinById(host.roomId,{name:'Listener'});rooms.push(guest);
  const hits:C.CowHitEvent[]=[],heard:C.CowHitEvent[]=[];
  host.onMessage('cowHit',(event:C.CowHitEvent)=>hits.push(event));guest.onMessage('cowHit',(event:C.CowHitEvent)=>heard.push(event));
  host.onMessage('mapTeleportResult',()=>{});host.onMessage('playerCorrection',()=>{});
  await startRound(host,[host,guest]);const now=Date.now(),cow=C.bridgeCowPose(0,now,C.zurichWorld),distance=C.COW_HALF_LENGTH+1;
  host.send('debugMapTeleport',{x:cow.x+Math.sin(cow.rotY)*distance,z:cow.z+Math.cos(cow.rotY)*distance,roundStartedAt:host.state.startedAt});
  await until(()=>Math.hypot(host.state.players.get(host.sessionId)!.x-cow.x,host.state.players.get(host.sessionId)!.z-cow.z)<3,'beside cow');
  const p=host.state.players.get(host.sessionId)!;host.send('move',C.packMove({...p,rotY:cow.rotY+Math.PI}));await delay(100);
  host.send('hit',{});host.send('hit',{});
  await until(()=>hits.length===1&&heard.length===1,'both hear hit moo');
  assert.equal(hits[0].id,0);assert.deepEqual(hits,heard);assert.equal(hits[0].roundStartedAt,host.state.startedAt);
  await delay(150);assert.equal(hits.length,1,'cooldown rejects duplicate strikes');
 },'zurich');
});
