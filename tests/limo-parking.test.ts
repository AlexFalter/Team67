import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {OrientedBox} from 'three-mesh-bvh';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {computeBoundsTree} from 'three-mesh-bvh';
import * as C from '../packages/shared/src/index.ts';
// @ts-expect-error Prototype feature uses the native multiplayer world through a JS adapter.
import {mainNpcWorld} from '../apps/client/src/npcPrototype/src/world/core/main-world.js';
// @ts-expect-error Prototype path is a JS module shared with the encounter.
import {createGroundVehiclePath} from '../apps/client/src/npcPrototype/src/world/core/vehicle-path.js';
import placements from '../apps/client/src/npcPrototype/placements.json';

test('limousine pickup and departure clear native Central walls and the tram boarding corridor',async()=>{
 const bytes=await fs.readFile('apps/client/public/maps/zurich/zurich.glb');
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 const map=(await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'')).scene;
 map.traverse(o=>{if(o instanceof THREE.Mesh)computeBoundsTree.call(o.geometry);});
 const {world}=mainNpcWorld(map,placements),path=createGroundVehiclePath(world,C.NPC_LAYOUT.interview.points,{radius:4.5,height:2.2});
 const approach=createGroundVehiclePath(world,C.NPC_LAYOUT.interview.approachPoints,{radius:1.25,halfWidth:1.25,halfLength:3.95,height:2.2});
 assert.equal(approach.smooth,true,'arrival follows a curved side-road approach');
 assert.ok(approach.length>20,'drive in from a visible distance');
 assert.ok(approach.sample(approach.length).distanceTo(path.sample(0))<.001,'arrival meets departure without a position jump');
 assert.ok(approach.tangent(approach.length).dot(path.tangent(0))>.99,'arrival faces the departure direction');
 for(let d=0;d<=approach.length;d+=.25){
  const f=approach.frame(d);
  assert.equal(world.vehicleWallBlocked(f.position,f.quaternion,1.25,3.95,2.2),false,`arrival clips wall at ${d}`);
  if(Number.isInteger(d*2))assert.ok(f.position.distanceTo(new THREE.Vector3(...C.NPC_LAYOUT.interview.approachSamples[d*2]))<.01,'server agrees on arrival route');
 }
 const tableCenter=new THREE.Vector3(...C.NPC_LAYOUT.interview.laptop),tableBox=new THREE.Box3(tableCenter.clone().add(new THREE.Vector3(-.85,0,-.5)),tableCenter.clone().add(new THREE.Vector3(.85,1.6,.5))).expandByScalar(.35);
 const carBox=new OrientedBox(new THREE.Vector3(-1.25,.3,-3.95),new THREE.Vector3(1.25,2.2,3.95));
 for(const route of [approach,path])for(let d=0;d<=Math.min(route.length,route===approach?Infinity:18);d+=.1){
  const frame=route.frame(d);carBox.matrix.compose(frame.position,frame.quaternion,new THREE.Vector3(1,1,1));carBox.needsUpdate=true;
  assert.equal(carBox.intersectsBox(tableBox),false,`limo intersects laptop table at ${d} m`);
 }
 const pickup=path.sample(0),expected=C.NPC_LAYOUT.interview.pickup;
 assert.ok(pickup.distanceTo(new THREE.Vector3(...expected))<.001);
 assert.ok(Math.hypot(pickup.x-C.NPC_LAYOUT.interview.laptop[0],pickup.z-C.NPC_LAYOUT.interview.laptop[2])<9,'park beside the laptop building');
 for(let d=0;d<=18;d+=.25){
  const frame=path.frame(d);
  assert.equal(world.vehicleWallBlocked(frame.position,frame.quaternion,1.25,3.95,2.2),false,`limousine clips native wall at ${d} m`);
  if(Number.isInteger(d*2))assert.ok(frame.position.distanceTo(new THREE.Vector3(...C.NPC_LAYOUT.interview.samples[d*2]))<.01,'server and client agree on the route');
 }
 // Test all carriage centres during boarding, not just the first tram car.
 for(let d=0;d<=C.TRAM_START_DISTANCE;d+=.25){
  const tram=C.railFrame({kind:C.TRAM_KIND,railDistance:d,railLane:0});
  assert.ok(Math.hypot(tram.x-pickup.x,tram.z-pickup.z)>6,'park outside the complete tram boarding footprint');
 }
});
