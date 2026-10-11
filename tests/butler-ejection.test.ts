import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
// @ts-expect-error Shared procedural rigs are JavaScript.
import {createStudent} from '../apps/client/src/npcPrototype/src/player/student-model.js';
// @ts-expect-error Encounter animation is JavaScript.
import {createButlerEjection} from '../apps/client/src/npcPrototype/src/npcs/interview/butler-ejection.js';

test('butler exits, lifts through the door, carries, throws, and returns before departure',()=>{
 const scene=new THREE.Scene(),limo=new THREE.Group(),butler=createStudent(),passenger=createStudent();scene.add(limo,passenger.player);limo.add(butler.player);
 const animation=createButlerEjection(limo,butler,passenger,{ground:()=>9});
 // Start after the car has moved: animation must not retain pickup transforms.
 limo.position.set(30,9,-186);limo.rotation.y=.65;limo.updateMatrixWorld(true);
 const drop=limo.localToWorld(new THREE.Vector3(5,0,.8));animation.start(drop);
 const stages=new Set<string>();let maxHeight=0,previous=passenger.player.position.clone(),carryStart:THREE.Vector3|undefined;
 for(let i=0;i<=408;i++){
  const age=i/60,result=animation.update(age);stages.add(result.stage);
  assert.ok(Number.isFinite(passenger.player.position.length()));
  if(i>0)assert.ok(passenger.player.position.distanceTo(previous)<.35,`passenger jumps at ${age}`);
  previous.copy(passenger.player.position);
  if(result.stage==='carry'){
   carryStart??=passenger.player.position.clone();
   const b=butler.player.getWorldPosition(new THREE.Vector3());
   assert.ok(passenger.player.position.distanceTo(b)<1.7,'passenger stays in the butler arms');
  }
  if(result.stage==='throw')maxHeight=Math.max(maxHeight,passenger.player.position.y);
  if(age<6.8)assert.equal(result.done,false);
 }
 assert.deepEqual([...stages],['exit','lift','carry','throw','land','return']);
 assert.ok(carryStart!.distanceTo(passenger.player.position)>1);
 assert.ok(maxHeight>10.2,'throw follows a visible arc');
 assert.ok(passenger.player.position.distanceTo(drop.clone().add(new THREE.Vector3(0,.28,0)))<.001);
 assert.equal(butler.player.visible,false);
 animation.reset();animation.reset();assert.equal(passenger.player.visible,false);assert.equal(passenger.player.rotation.z,0);
});

test('seated passenger and low doorway lift keep the head under the limousine roof',()=>{
 const scene=new THREE.Scene(),limo=new THREE.Group(),butler=createStudent(),passenger=createStudent();scene.add(limo,passenger.player);limo.add(butler.player);
 limo.position.set(18,27,-201);limo.rotation.set(.05,1.2,0,'YXZ');limo.updateMatrixWorld(true);
 const animation=createButlerEjection(limo,butler,passenger,{ground:()=>27});animation.start(limo.localToWorld(new THREE.Vector3(5,0,.8)));
 const point=new THREE.Vector3();let checked=0;
 for(let i=0;i<=264;i++){
  animation.update(i/120);passenger.player.updateMatrixWorld(true);
  passenger.player.traverse((o:THREE.Object3D)=>{
   if(!(o instanceof THREE.Mesh)||!o.visible)return;
   const vertices=o.geometry.getAttribute('position');
   for(let j=0;j<vertices.count;j++){
    point.fromBufferAttribute(vertices,j).applyMatrix4(o.matrixWorld);limo.worldToLocal(point);
    if(Math.abs(point.x)<1.015&&point.z> -2.1&&point.z<2.4){checked++;assert.ok(point.y<1.885,`passenger breaks roof at ${i/120}s (height ${point.y})`);}
   }
  });
 }
 assert.ok(checked>0);animation.reset();assert.equal(passenger.player.scale.y,1);
});
