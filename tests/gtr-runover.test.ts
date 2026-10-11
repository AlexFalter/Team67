import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '@race/shared';
import {Player,Vehicle,RaceState} from '../apps/server/src/state.ts';
import {TrafficManager} from '../apps/server/src/traffic.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';
import {withServer,until,startRound,type WireState} from './fixture.ts';

test('donut car hitbox knocks pedestrians along the drift velocity and respects height, eligibility, cooldown and recovery',()=>{
 const state=new RaceState({serverTime:1000}),traffic=new TrafficManager(state);
 const car=C.gtrDonutCar(1000,C.zurichWorld);
 const foot=new Player({x:car.x,y:car.y,z:car.z});state.players.set('foot',foot);
 state.players.set('above',new Player({x:car.x,y:car.y+3,z:car.z}));
 state.players.set('outside',new Player({x:car.x+10,y:car.y,z:car.z}));
 state.players.set('busy',new Player({x:car.x,y:car.y,z:car.z}));
 const hits:Parameters<Parameters<VehicleManager['tick']>[1]>[]=[];
 const impact=(...args:Parameters<Parameters<VehicleManager['tick']>[1]>)=>hits.push(args);
 const check=()=>traffic.collideCar(C.GTR_DONUTS_ID,car,impact,id=>id!=='busy',undefined,car.velocityHeading);
 check();assert.equal(hits.length,1);assert.equal(hits[0][1],'foot');assert(hits[0][8]);
 assert(Math.abs(Math.atan2(hits[0][5],hits[0][7])-car.velocityHeading)<1e-8);
 check();assert.equal(hits.length,1);
 state.serverTime+=500;foot.invincibleUntil=state.serverTime+1000;check();assert.equal(hits.length,1);
 foot.invincibleUntil=0;foot.knockdownUntil=state.serverTime+1000;check();assert.equal(hits.length,1);
 foot.knockdownUntil=0;state.noCarCollisions=true;check();assert.equal(hits.length,1);
 state.noCarCollisions=false;check();assert.equal(hits.length,2);
});

test('donut car ejects bicycle and both Lime riders, protects rail passengers and does not stop its loop',()=>{
 for(const kind of [2,C.LIME_KIND]){
  const state=new RaceState({serverTime:1000}),vehicles=new VehicleManager(state),traffic=new TrafficManager(state);
  const car=C.gtrDonutCar(1000,C.zurichWorld);
  const ride=new Vehicle({kind,x:car.x,y:car.y,z:car.z,driver:'front',capacity:kind===C.LIME_KIND?2:1});state.vehicles.set('ride',ride);
  state.players.set('front',new Player({x:car.x,y:car.y,z:car.z,vehicleId:'ride',vehicleKind:kind,seat:0}));
  if(kind===C.LIME_KIND)state.players.set('rear',new Player({x:car.x,y:car.y,z:car.z,vehicleId:'ride',vehicleKind:kind,seat:1}));
  const protectedRide=new Vehicle({kind:1,x:car.x,y:car.y,z:car.z});state.vehicles.set('rail',protectedRide);
  state.players.set('passenger',new Player({x:car.x,y:car.y,z:car.z,vehicleId:'rail'}));
  const hit:Parameters<VehicleManager['tick']>[1]=(from,target,_x,_y,_z,ix,iy,iz,down)=>{
   assert.equal(from,C.GTR_DONUTS_ID);assert.equal(state.players.get(target)!.vehicleId,'');
   C.applyImpulse(state.players.get(target)!,C.collisionImpact(from,ix,iy,iz,'vehicle',down),state.serverTime);
  };
  traffic.collideCar(C.GTR_DONUTS_ID,car,undefined,()=>true,
   id=>vehicles.runOver(id,state.serverTime,hit,car.speed,{from:C.GTR_DONUTS_ID,rotY:car.velocityHeading,kind:3}),car.velocityHeading);
  assert.equal(ride.driver,'');assert(ride.fallenUntil>state.serverTime);
  assert(state.players.get('front')!.knockdownUntil>state.serverTime);
  if(kind===C.LIME_KIND)assert(state.players.get('rear')!.knockdownUntil>state.serverTime);
  assert.equal(state.players.get('passenger')!.vehicleId,'rail');
  const next=C.gtrDonutPose(1100);assert(Math.hypot(next.x-car.x,next.z-car.z)>0);
 }
});

test('Colyseus donut impacts replicate knockdown and bump effects to both clients',{timeout:30000},async()=>{
 await withServer(async(client,rooms)=>{
  const host=await client.create<WireState>('race',{name:'Donut pedestrian',devMode:true,adminMode:true,skipIntro:true,mapTeleport:true,moodleEnabled:false});rooms.push(host);
  const guest=await client.joinById<WireState>(host.roomId,{name:'Observer'});rooms.push(guest);
  const impulses:C.Impulse[]=[],hostBumps:C.Bump[]=[],guestBumps:C.Bump[]=[];
  host.onMessage('impulse',hit=>impulses.push(hit));host.onMessage('bump',b=>hostBumps.push(b));guest.onMessage('bump',b=>guestBumps.push(b));
  host.onMessage('playerCorrection',()=>{});host.onMessage('mapTeleportResult',()=>{});host.onMessage('trafficResult',()=>{});
  await startRound(host,[host,guest]);
  host.send('trafficEdit',{network:{version:1,laneWidth:3.2,nodes:[],roads:[]}});
  await until(()=>host.state.trafficCars!.size===0,'normal traffic removed for isolated donut test');
  host.send('debugMapTeleport',{x:C.GTR_DONUTS.center[0]+C.GTR_DONUTS.radius,z:C.GTR_DONUTS.center[2],roundStartedAt:host.state.startedAt});
  await until(()=>impulses.some(hit=>hit.from===C.GTR_DONUTS_ID),'GT-R runs pedestrian over',10000);
  await until(()=>hostBumps.some(b=>b.a===C.GTR_DONUTS_ID)&&guestBumps.some(b=>b.a===C.GTR_DONUTS_ID),'impact broadcast');
  await until(()=>guest.state.players.get(host.sessionId)!.knockdownUntil>Date.now(),'observer sees knockdown');
  assert(impulses.some(hit=>hit.from===C.GTR_DONUTS_ID&&hit.knockdown));
 },'zurich');
});
