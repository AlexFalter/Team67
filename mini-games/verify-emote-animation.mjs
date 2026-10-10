import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStudent} from './src/player/student-model.js';
import {createRiderAnimation} from './src/player/rider-animation.js';
import {createEmoteAnimator,emoteDefinitions} from './src/player/emotes/emotes.js';
import {sampleDance,choreography} from './src/player/emotes/choreography.js';
const student=createStudent(),rider=createRiderAnimation(student),emotes=createEmoteAnimator(student),position=new THREE.Vector3(0,0,0);
const host=()=>rider.update(1/60,{position,heading:0,mode:'walk',speed:0});
for(const {id} of emoteDefinitions){
 host();emotes.start(id);let previous=null,maxJump=0,minSole=Infinity,minContact=Infinity,chestMoves=false;
 for(let i=0;i<600;i++){
  host();emotes.update(1/60);student.player.updateMatrixWorld(true);
  const feet=student.feet.map(f=>f.getWorldPosition(new THREE.Vector3()));
  assert(feet.every(v=>v.toArray().every(Number.isFinite)),`${id}: finite foot targets`);
  if(i>20){const soles=feet.map(v=>v.y-.0925);minSole=Math.min(minSole,...soles);minContact=Math.min(minContact,Math.min(...soles));assert(Math.min(...soles)<.045,`${id}: a supporting foot remains grounded`);}
  const joints=[...student.limbs,...student.elbows,...student.knees,student.torso,student.head];
  if(previous)maxJump=Math.max(maxJump,...joints.map((j,n)=>j.quaternion.angleTo(previous[n])));
  previous=joints.map(j=>j.quaternion.clone());chestMoves||=Math.abs(student.torso.rotation.y)+Math.abs(student.torso.rotation.z)>.025;
 }
 assert(minSole>-.002,`${id}: shoes stay above the floor`);assert(minContact<.01,`${id}: planted feet actually touch the floor`);assert(maxJump<.5,`${id}: no instantaneous pose snapping (${maxJump})`);assert(chestMoves||id==='dab');
 assert.deepEqual(sampleDance(id,0),sampleDance(id,choreography[id].duration),`${id}: seamless loop`);
 emotes.stop();host();assert.equal(student.torso.rotation.x,0);assert(student.feet.every(f=>f.quaternion.angleTo(new THREE.Quaternion())<.001));
}
console.log('PASS: six full dance phrases, loop continuity, finite IK, grounded shoes, supporting feet, bounded pose changes and walking rig restoration.');
