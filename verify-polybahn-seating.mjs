import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStudent} from './student-model.js';
import {seatPassenger,BENCH_TOP,AISLE_LIMIT,CABIN_FLOOR} from './polybahn-seated.js';
for(const [scale,x,z] of [[.8,-.88,1.2],[.74,.88,-1.35]]){
 const rig=createStudent();rig.player.scale.setScalar(scale);rig.player.rotation.y=x<0?-Math.PI/2:Math.PI/2;
 seatPassenger(rig,x,z);rig.player.updateMatrixWorld(true);
 for(const i of [1,3]){
  const thigh=new THREE.Box3().setFromObject(rig.limbs[i].children[0]);
  assert(Math.abs(thigh.min.y-BENCH_TOP)<1e-5,'thigh rests on seat surface');
  const knee=new THREE.Vector3();rig.knees[(i-1)/2].getWorldPosition(knee);
  assert(Math.abs(knee.x)>.3 && Math.abs(knee.x)<.4 && Math.abs(knee.x)<Math.abs(x)-.2,'knees face into cabin and clear the aisle');
  const calf=new THREE.Box3().setFromObject(rig.knees[(i-1)/2].children[0]);
  assert(x<0?calf.min.x>-.44:calf.max.x<.44,'lower legs hang beyond bench front');
  assert(calf.max.y<=knee.y+1e-6 && calf.min.y<calf.max.y,'calves hang down from knees');
  const sole=new THREE.Box3().setFromObject(rig.knees[(i-1)/2].children[2]);
  assert(Math.abs(sole.min.y-CABIN_FLOOR)<1e-5,'soles rest on cabin floor');
  const shoe=new THREE.Box3().setFromObject(rig.knees[(i-1)/2].children[2]);
  assert(x<0?shoe.max.x<-.15:shoe.min.x>.15,'shoes clear walking body');
 }
}
console.log('PASS: both seated rigs rest on the benches and leave body clearance through the aisle.');
