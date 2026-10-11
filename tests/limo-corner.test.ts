import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {computeBoundsTree} from 'three-mesh-bvh';
import * as C from '../packages/shared/src/index.ts';
// @ts-expect-error Existing JavaScript world adapter.
import {mainNpcWorld} from '../apps/client/src/npcPrototype/src/world/core/main-world.js';
// @ts-expect-error Existing JavaScript vehicle path.
import {createGroundVehiclePath} from '../apps/client/src/npcPrototype/src/world/core/vehicle-path.js';

test('limousine reaches the tram crash corner on a grounded route clear of native walls',async()=>{
 const bytes=await fs.readFile('apps/client/public/maps/zurich/zurich.glb');
 const map=(await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'')).scene;
 map.traverse(o=>{if(o instanceof THREE.Mesh)computeBoundsTree.call(o.geometry);});
 const {world}=mainNpcWorld(map,{}),route=C.NPC_LAYOUT.interview;
 const path=createGroundVehiclePath(world,route.points,{radius:4.5,height:2.2});
 const stop=path.sample(path.length),corner=C.railFrame({kind:C.TRAM_KIND,railDistance:C.tramFirstCorner,railLane:0});
 assert.ok(Math.hypot(stop.x-corner.x,stop.z-corner.z)<6,'stop beside the tram crash corner');
 assert.ok(stop.distanceTo(new THREE.Vector3(...route.landing))<.001,'client/server agree on the stop');
 const parked=path.frame(path.length);
 for(const x of [-1.1,1.1])for(const z of [-3.7,0,3.7]){
  const bottom=new THREE.Vector3(x,.48,z).applyQuaternion(parked.quaternion).add(parked.position);
  assert.ok(bottom.y-world.height(bottom.x,bottom.z)>.25,'parked body stays above the sloping terrain');
 }
 let previous=path.sample(0);
 for(let d=0;d<=path.length;d+=.25){
  const frame=path.frame(d);
  assert.equal(world.vehicleWallBlocked(frame.position,frame.quaternion,1.25,3.95,2.2),false,`wall collision at ${d} m`);
  assert.ok(Math.abs(frame.position.y-previous.y)<.55,`terrain jump at ${d} m`);
  if(Number.isInteger(d*2))assert.ok(frame.position.distanceTo(new THREE.Vector3(...route.samples[d*2]))<.01,'server validates the rendered route');
  previous=frame.position;
 }
 const drop=C.findGround(C.zurichWorld,stop.x+4,stop.z);assert.ok(drop,'safe server rejection/ejection location');
 assert.ok(Math.hypot(drop.x-corner.x,drop.z-corner.z)<8,'ejection remains at the corner');
});
