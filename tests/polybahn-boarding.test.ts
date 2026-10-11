import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,Vector3,Euler} from 'three';
import * as C from '../packages/shared/src/index.ts';
import {createTramBoardingZone,updateTramBoardingZone} from '../apps/client/src/multiplayer/tramBoardingZone.ts';
import {VehicleManager} from '../apps/server/src/vehicles.ts';
import {RaceState,Player} from '../apps/server/src/state.ts';
import type {Client} from 'colyseus';

test('Polybahn circle is on the interior lobby floor and matches server boarding',()=>{
 const state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld),p=new Player();state.players.set('a',p);
 const client={sessionId:'a',send(){}} as unknown as Client;
 const zone=createTramBoardingZone(C.POLYBAHN_KIND);
 try{
  for(const id of ['polybahn-1','polybahn-2']){
   const v=state.vehicles.get(id)!,point=C.railBoardingPoint(v),frame=C.railFrame(v);
   assert.deepEqual(point,C.polybahnPlatforms[id==='polybahn-1'?0:1]);
   assert.equal(C.zurichWorld.height(point.x,point.z),point.y);
   assert.equal(C.zurichWorld.blocked(point.x,point.y,point.z,C.CAPSULE_RADIUS,C.CAPSULE_HEIGHT),false);
   Object.assign(p,point);p.vehicleId='';
   assert(updateTramBoardingZone(zone,v,v,p,100000,true));assert(zone.visible);
   assert.equal(zone.rotation.x,0);
   assert.equal(zone.position.y+v.y,point.y+.08);assert.equal(zone.rotation.y,frame.rotY);
   assert.equal((zone.children[1] as Mesh<import('three').RingGeometry>).geometry.parameters.outerRadius,1);
   p.x+=1.1;manager.enter(client,id,100000);assert.equal(p.vehicleId,'');
   Object.assign(p,point);manager.enter(client,id,100000);assert.equal(p.vehicleId,id);
   updateTramBoardingZone(zone,v,v,p,100000,true);assert(!zone.visible);
   manager.exit(client);assert.equal(p.vehicleId,'');
  }
 }finally{zone.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();(o.material as MeshBasicMaterial).dispose();}});}
});

test('Polybahn body axis follows the inclined rails on both lanes',()=>{
 for(const lane of [-1.25,1.25]){
  const v=C.createVehicle(C.POLYBAHN_KIND);v.railLane=lane;v.railDistance=60;
  const f=C.railFrame(v);assert(Math.abs(f.pitch)>.1,'cabin must tilt on the uphill track');
  const axleAxis=new Vector3(0,0,-1).applyEuler(new Euler(-f.pitch,f.rotY+Math.PI,0,'YXZ'));
  assert(axleAxis.y>.1,'front axle points uphill instead of staying level');
  assert(Math.abs(Math.atan2(axleAxis.y,Math.hypot(axleAxis.x,axleAxis.z))+f.pitch)<1e-8);
 }
});

 test('Polybahn docks inside both station halls and retains the lower rail incline',()=>{
  const v=C.createVehicle(C.POLYBAHN_KIND);
  v.railDistance=0;
  const lower=C.railFrame(v),lowerDoor=C.railBoardingPoint(v);
  assert(lower.x>=15&&lower.x<=17);
  assert(lowerDoor.x>9.5&&lowerDoor.x<15.5,'lower boarding point must be inside the lobby');
  assert.equal(lowerDoor.y,8.625);
  assert(Math.abs(lower.pitch)>.18,'lower dock follows its inclined track');
  v.railDistance=C.polybahnPath.length;
  const upperDoor=C.railBoardingPoint(v);
  assert(upperDoor.x>175&&upperDoor.x<190,'upper boarding point must be inside the hall');
 });

 test('standing at the old exterior Polybahn approach cannot board',()=>{
  const state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld),p=new Player();state.players.set('a',p);
  const client={sessionId:'a',send(){}} as unknown as Client;
  Object.assign(p,{x:4,y:8.659,z:114});manager.enter(client,'polybahn-1',100000);
  assert.equal(p.vehicleId,'');
 });

 test('boarding points sit on actual interior station floor meshes',async()=>{
  const {readFileSync}=await import('node:fs');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
  const {Raycaster}=await import('three');
  const {disposeMap}=await import('../apps/client/src/maps/zurich/loadZurichMap.ts');
  const bytes=readFileSync('apps/client/public/maps/zurich/zurich.glb');
  const {scene}=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  try{
   scene.updateMatrixWorld(true);
   for(const point of C.polybahnPlatforms){
    const ray=new Raycaster(new Vector3(point.x,60,point.z),new Vector3(0,-1,0));
    const floors=ray.intersectObject(scene,true).filter(hit=>{
     const mesh=hit.object as Mesh,material=Array.isArray(mesh.material)?mesh.material[hit.face!.materialIndex]:mesh.material;
     return material.name==='G_StationFloor';
    });
    assert(floors.some(hit=>Math.abs(hit.point.y-point.y)<.01),'boarding point must be on an authored interior slab');
    const start=point.x<20?new Vector3(4,point.y+1,114):new Vector3(193.127,point.y+1,71.13);
    const end=new Vector3(point.x,point.y+1,point.z),direction=end.clone().sub(start);
    const doorwayRay=new Raycaster(start,direction.clone().normalize(),0,direction.length());
    assert.equal(doorwayRay.intersectObject(scene,true).length,0,'walking route must pass through the actual open doorway');
   }
  }finally{disposeMap(scene);}
 });

 test('walk from the street through both station doors, board, and walk back out',()=>{
  for(const [id,start] of [
   ['polybahn-1',{x:4,y:8.64,z:114}],
   ['polybahn-2',{x:192.654,y:48.813,z:70.137}],
  ] as const){
   const state=new RaceState(),manager=new VehicleManager(state,C.zurichWorld),p=new Player();state.players.set('walker',p);
   const client={sessionId:'walker',send(){}} as unknown as Client,v=state.vehicles.get(id)!,target=C.railBoardingPoint(v);
   Object.assign(p,start);p.y=C.zurichWorld.height(p.x,p.z)!;
   const walk=(point:C.GroundPoint)=>{
    for(let tick=0;tick<600&&Math.hypot(p.x-point.x,p.z-point.z)>.15;tick++){
     const dx=point.x-p.x,dz=point.z-p.z,length=Math.hypot(dx,dz);
     C.stepMovement(p,{x:dx/length,z:dz/length,sprint:false,jump:false},1/60,tick*1000/60,C.zurichWorld);
    }
    assert(Math.hypot(p.x-point.x,p.z-point.z)<.2,`${id}: doorway blocked at ${p.x},${p.z}`);
    assert(p.grounded,'station access must not require jumping');
   };
   walk(target);manager.enter(client,id,100000);assert.equal(p.vehicleId,id);
   manager.exit(client);assert.equal(p.vehicleId,'');walk(start);
  }
 });

 test('station approaches pass either side of the centered ticket machine without invisible choke points',()=>{
  const approaches=[
   ...[108,110,114,117].map(z=>({start:{x:3,y:8.625,z},target:C.polybahnPlatforms[0]})),
   ...[-3,-1,1,3].map(offset=>{const across=offset-1.1;return {start:{x:185+.903*10+.430*across,y:48.875,z:75-.430*10+.903*across},target:C.polybahnPlatforms[1]};}),
  ];
  for(const {start,target} of approaches){
   const p=C.createBody();Object.assign(p,start);p.y=C.zurichWorld.height(p.x,p.z)!;
   let stopped=0;
   // Cross the visible doorway, then turn towards the lobby marker.
   const doorway=target.x<20?{x:8,y:8.625,z:112.5}:{x:185+.903*7-.430*1.1,y:48.875,z:75-.430*7-.903*1.1};
   const aroundMachine=target.x<20?[{x:3,y:8.625,z:start.z<=C.TICKET_POSITION.z?110.5:114.5},{x:8,y:8.625,z:start.z<=C.TICKET_POSITION.z?110.5:114.5}]:[];
   for(const waypoint of [...aroundMachine,doorway,target]){
    for(let tick=0;tick<600&&Math.hypot(p.x-waypoint.x,p.z-waypoint.z)>.15;tick++){
     const dx=waypoint.x-p.x,dz=waypoint.z-p.z,length=Math.hypot(dx,dz),before={x:p.x,z:p.z};
     C.stepMovement(p,{x:dx/length,z:dz/length,sprint:false,jump:false},1/60,tick*1000/60,C.zurichWorld);
     if(Math.hypot(p.x-before.x,p.z-before.z)<.001)stopped++;
    }
    assert(Math.hypot(p.x-waypoint.x,p.z-waypoint.z)<.2,`approach from ${JSON.stringify(start)} stopped at ${p.x},${p.z}`);
   }
   assert(stopped<3,'normal approach should not stall against an invisible wall');
  }
 });
