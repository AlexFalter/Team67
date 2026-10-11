import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../packages/shared/src/index.ts';
import {Player, RaceState, Vehicle} from '../apps/server/src/state.ts';
import {withServer, startRound, until, delay, type WireState} from './fixture.ts';

test('tailwhips require the current driver, matching round and a recovered rider; cooldown cannot be reset by spam',()=>{
 const state=new RaceState({startedAt:100});
 const vehicle=new Vehicle({...C.createVehicle(C.LIME_KIND),driver:'driver'});
 state.vehicles.set('lime',vehicle);
 state.players.set('driver',new Player({vehicleId:'lime',vehicleKind:C.LIME_KIND,seat:0}));
 state.players.set('rear',new Player({vehicleId:'lime',vehicleKind:C.LIME_KIND,seat:1}));
 assert.equal(C.startLimeTailwhip(state,'rear',100,1000),false);
 assert.equal(C.startLimeTailwhip(state,'missing',100,1000),false);
 assert.equal(C.startLimeTailwhip(state,'driver',99,1000),false);
 vehicle.kind=2;assert.equal(C.startLimeTailwhip(state,'driver',100,1000),false);vehicle.kind=C.LIME_KIND;
 const driver=state.players.get('driver')!;driver.knockdownUntil=1500;
 assert.equal(C.startLimeTailwhip(state,'driver',100,1000),false);driver.knockdownUntil=0;
 assert.equal(C.startLimeTailwhip(state,'driver',100,1000),true);
 assert.equal(C.startLimeTailwhip(state,'driver',100,1999),false);assert.equal(vehicle.tailwhipStartedAt,1000);
 assert.equal(C.startLimeTailwhip(state,'driver',100,2000),true);
});

test('tailwhip is a complete deck rotation with a smooth hop and resets after landing without altering physics',()=>{
 const vehicle={...C.createVehicle(C.LIME_KIND),tailwhipStartedAt:1000};
 const before={...vehicle};
 assert.deepEqual(C.limeTailwhipPose(vehicle,999),{height:0,rotation:0});
 assert.deepEqual(C.limeTailwhipPose(vehicle,1000),{height:0,rotation:0});
 const peak=C.limeTailwhipPose(vehicle,1375);assert.equal(peak.height,.65);assert.ok(Math.abs(peak.rotation-Math.PI)<1e-9);
 assert.equal(C.limeTailwhipPose(vehicle,1749).rotation,Math.PI*2);
 assert.deepEqual(C.limeTailwhipPose(vehicle,1750),{height:0,rotation:0});
 assert.deepEqual(C.limeTailwhipPose({...vehicle,kind:2},1375),{height:0,rotation:0});
 assert.deepEqual(vehicle,before);
});

test('the three new parked scooters are spread out, grounded and clear',()=>{
 const points=C.NPC_LAYOUT.lime.positions.slice(-3);
 for(const [x,y,z] of points){
  assert.ok(Math.abs(C.zurichWorld.height(x,z)!-y)<.001);
  assert.equal(C.zurichWorld.blocked(x,y,z,C.vehicleRadius({kind:C.LIME_KIND}),C.CAPSULE_HEIGHT),false);
 }
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.ok(Math.hypot(points[i][0]-points[j][0],points[i][2]-points[j][2])>7);
 const [a,b,c]=points;assert.ok(Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))>10);
});

test('two live clients see the same accepted tailwhip and cannot trigger another rider’s scooter',async()=>{
 await withServer(async(client,rooms)=>{
  const a=await client.create<WireState>('race',{name:'Driver',devMode:true,mapTeleport:true,skipIntro:true});rooms.push(a);
  const b=await client.joinById<WireState>(a.roomId,{name:'Viewer'});rooms.push(b);
  a.onMessage('*',()=>{});b.onMessage('*',()=>{});
  await startRound(a,[a,b]);
  const target=a.state.vehicles.get('lime-7')!;
  a.send('debugMapTeleport',{x:target.x,z:target.z,roundStartedAt:a.state.startedAt});
  await until(()=>Math.hypot(a.state.players.get(a.sessionId)!.x-target.x,a.state.players.get(a.sessionId)!.z-target.z)<C.VEHICLE_BOARD_DISTANCE,'teleport to scooter');
  a.send('vehicleEnter','lime-7');await until(()=>a.state.players.get(a.sessionId)!.vehicleId==='lime-7','board scooter');
  b.send('limeTailwhip',b.state.startedAt);await delay(100);assert.equal(a.state.vehicles.get('lime-7')!.tailwhipStartedAt,0);
  a.send('limeTailwhip',a.state.startedAt);
  await until(()=>b.state.vehicles.get('lime-7')!.tailwhipStartedAt>0,'observer receives tailwhip');
  const timestamp=b.state.vehicles.get('lime-7')!.tailwhipStartedAt;
  await until(()=>a.state.vehicles.get('lime-7')!.tailwhipStartedAt===timestamp,'driver sees same timestamp');
  a.send('limeTailwhip',a.state.startedAt);await delay(100);assert.equal(b.state.vehicles.get('lime-7')!.tailwhipStartedAt,timestamp);
 },'zurich');
});
