import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Euler,InstancedMesh} from 'three';
import {TramExplosions} from '../apps/client/src/multiplayer/tramExplosions.ts';
import * as C from '../packages/shared/src/index.ts';
import {RaceState,Player} from '../apps/server/src/state.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';
import {ContactWorld} from '../apps/server/src/physics.ts';
import type {Client} from 'colyseus';
import {withServer,until,type WireState} from './fixture.ts';

function fixture(protectedRide=false){
 const state=new RaceState({railCrashProtection:protectedRide}),manager=new VehicleManager(state,C.zurichWorld),v=state.vehicles.get('tram-1')!;
 for(let i=0;i<2;i++){const id=String(i);state.players.set(id,new Player(C.railBoardingPoint(v)));manager.enter({sessionId:id,send(){}} as unknown as Client,'tram-1',100000);}
 manager.tick(v.departureAt+1,()=>{});
 return {state,manager,v};
}
test('explosions reconstruct the same shared-time frame, expire, and release instance buffers',()=>{
 const a=new TramExplosions(),b=new TramExplosions();
 const v={...C.createVehicle(C.TRAM_KIND),railDistance:C.tramFirstCorner,derailStartedAt:1000,derailAge:1.8};
 const firstLanding=Math.min(...[0,1,2].map(part=>C.tramDerailFrame(v,part).landedAt));
 a.update({...v,derailAge:firstLanding-.01});assert(!a.visible,'explosions wait until a wagon hits the ground');
 a.update(v);b.update(v);assert(a.visible&&b.visible);
 let disposed=0;
 for(let i=0;i<a.children.length;i++){
  const mesh=a.children[i] as InstancedMesh,other=b.children[i] as InstancedMesh;
  assert.deepEqual(mesh.instanceMatrix.array,other.instanceMatrix.array,'joining at the same crash age reproduces the effect');
  assert(mesh.instanceMatrix.array.some(value=>value!==0));
  mesh.addEventListener('dispose',()=>disposed++);
 }
 a.update({...v,derailAge:8});assert(!a.visible);
 b.update({...v,derailStartedAt:0});assert(!b.visible);
 a.dispose();assert.equal(disposed,3);b.dispose();
 for(const effect of [a,b])for(const mesh of effect.children as InstancedMesh[]){mesh.geometry.dispose();(mesh.material as {dispose():void}).dispose();}
});
test('tram derails at the first route bend, shares wagon poses, safely releases every rider and remains wrecked',()=>{
 const {state,manager,v}=fixture();let now=v.tripStartedAt;
 for(;!v.derailStartedAt&&now<v.arrivalAt;now+=50)manager.tick(now,()=>{});
 assert(v.derailStartedAt>0);assert.equal(v.railDistance,C.tramFirstCorner);assert(v.traveling);
 const start=v.derailStartedAt;manager.tick(start+500,()=>{});
 const wire=C.snapshot(v,C.createVehicle());
 assert.deepEqual(C.tramDerailFrame(v),C.tramDerailFrame(wire),'server schema and client snapshot produce identical crash physics');
 assert.equal(C.tramTurnLoad(v),C.tramTurnLoad(wire));
 assert([...state.players.values()].every(p=>p.vehicleId==='tram-1'));
 for(const p of state.players.values()){
  const seat=C.railSeat(v,p.seat),f=C.tramDerailFrame(v,seat.part),expected=new Vector3(-seat.x,seat.y,-seat.z).applyEuler(new Euler(-f.pitch,f.rotY+Math.PI,f.roll,'YXZ')).add(new Vector3(f.x,f.y,f.z));
  assert(expected.distanceTo(new Vector3(p.x,p.y,p.z))<1e-8,'seats stay inside their tilted wagon');
 }
 const a=C.tramDerailFrame(v,0),b=C.tramDerailFrame(v,1);assert(a.roll*b.roll>0,'wagons tip outwards together');
 manager.tick(start+1200,()=>{});
 assert([...state.players.values()].every(p=>p.vehicleId===''&&p.seat===-1&&Number.isFinite(p.y)));
 const distance=v.railDistance;manager.tick(start+100000,()=>{});assert.equal(v.railDistance,distance);assert.equal(v.derailStartedAt,start);
});
test('dev crash protection preserves a complete tram journey and Polybahn never derails',()=>{
 const {manager,v,state}=fixture(true);manager.tick(v.arrivalAt,()=>{});assert.equal(v.derailStartedAt,0);assert(!v.traveling);assert(v.railReverse);
 for(const id of ['polybahn-1','polybahn-2'])assert.equal(state.vehicles.get(id)!.derailStartedAt,0);
});

test('derailed tram removes its stale track collider and cannot hit or displace pedestrians and bikes',async()=>{
 const {state,manager,v}=fixture();let now=v.tripStartedAt;
 for(;!v.derailStartedAt&&now<v.arrivalAt;now+=50)manager.tick(now,()=>{});
 manager.tick(v.derailStartedAt+8000,()=>{});
 const impactVelocity=[v.vx,v.vz];
 const world=await ContactWorld.create();
 try {
  const players=new Map<string,Player>();
  for(const id of ['walker-a','walker-b']){
   const p=new Player({...C.createBody(),x:v.x,y:v.y,z:v.z});state.players.set(id,p);players.set(id,p);
  }
  const derailStartedAt=v.derailStartedAt;
  v.derailStartedAt=0;world.sync(players,new Map([['tram-1',v]]));
  assert(world.intersects('walker-a','v:tram-1'),'the old rail-root collider overlaps walkers');
  v.derailStartedAt=derailStartedAt;world.sync(players,new Map([['tram-1',v]]));
  for(const id of players.keys())assert(!world.intersects(id,'v:tram-1'),'no invisible collider remains at the bend');
  const before=[...players.values()].map(p=>[p.x,p.y,p.z]);let hits=0;
  manager.contacts(now+9000,()=>{hits++;});
  assert.equal(hits,0);assert.deepEqual([...players.values()].map(p=>[p.x,p.y,p.z]),before,'fallback contacts do not push walkers');
  for(const id of players.keys())state.players.delete(id);
  const bike=state.vehicles.get('bike-1') ?? [...state.vehicles.values()].find(other=>other.kind===2)!;
  bike.x=v.x-.5;bike.y=v.y;bike.z=v.z;bike.vx=v.vx+20;bike.vz=v.vz;
  manager.contacts(now+9000,()=>{hits++;});assert.equal(bike.fallenUntil,0,'the ghost wreck cannot crash a bike');
  assert.deepEqual([v.vx,v.vz],impactVelocity,'shared wreck animation retains its impact velocity');
  state.vehicles.delete([...state.vehicles].find(([,other])=>other===bike)![0]);
  for(const [id,p] of players)state.players.set(id,p);
  v.derailStartedAt=0;v.vx=10;v.vz=0;
  for(const p of players.values()){p.x=v.x+.5;p.y=v.y;p.z=v.z;}
  world.sync(players,new Map([['tram-1',v]]));
  manager.contacts(now+10000,()=>{hits++;},(a,b)=>world.intersects(a,b));
  assert.equal(hits,2,'a normally moving tram still hits both pedestrians');
 }finally{world.dispose();}
});
test('room crash protection is shared and can only be enabled in dev mode', {timeout:20000},async()=>{
 await withServer(async(client,rooms)=>{
  for(const devMode of [false,true]){
   const a=await client.create<WireState>('race',{name:'Host',devMode,railCrashProtection:true});rooms.push(a);
   const b=await client.joinById<WireState>(a.roomId,{name:'Guest'});rooms.push(b);
   await until(()=>a.state?.members.size===2&&b.state?.members.size===2,'room joined');
   assert.equal(a.state.railCrashProtection,devMode);assert.equal(b.state.railCrashProtection,devMode);
  }
 });
});
