import assert from 'node:assert/strict';
import {physicsHarness} from './physics-harness.mjs';
import {createWorldAccess} from './world-access.js';
const {world,solver,THREE}=await physicsHarness(),access=createWorldAccess(world,solver);
const route=world.data.route,a=new THREE.Vector3(route[6][0],world.height(...route[6]),route[6][1]),b=a.clone();
assert(access.canInteract(a,b,2.8),'normal interaction on the street');
assert(!access.canInteract(a.clone().add(new THREE.Vector3(0,5,0)),b,2.8),'different floors cannot interact');
const p=world.buildings[0].geometry.attributes.position,triangle=new THREE.Triangle(),normal=new THREE.Vector3();let wall=null;
for(let i=0;i<p.count&&!wall;i+=3){
 triangle.set(new THREE.Vector3().fromBufferAttribute(p,i),new THREE.Vector3().fromBufferAttribute(p,i+1),new THREE.Vector3().fromBufferAttribute(p,i+2));triangle.getNormal(normal);if(Math.abs(normal.y)>.1)continue;
 const center=triangle.getMidpoint(new THREE.Vector3());normal.y=0;normal.normalize();
 const from=center.clone().addScaledVector(normal,.95),to=center.clone().addScaledVector(normal,-.95);from.y=world.height(from.x,from.z);to.y=world.height(to.x,to.z);
 if(from.distanceTo(to)>=2.8||!access.clearFloor(from.x,from.z)||!access.clearFloor(to.x,to.z))continue;
 if(!access.walkablePath(from,to)){wall={from:from.toArray(),to:to.toArray()};assert(!access.canInteract(from,to,2.8),'nearby endpoints separated by a real map wall');}
}
assert(wall,'must exercise a real surveyed wall, with clear space on both sides');
const start=world.data.playableBounds;assert(!access.clearFloor(start.maxX+1,0),'outside world stays inaccessible');
console.log('PASS: normal street interaction, different floor rejection, actual wall blocks interaction and map boundaries.',JSON.stringify(wall));
