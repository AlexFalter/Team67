import * as THREE from 'three';
import assert from 'node:assert/strict';
import {createFirstPersonSlide} from './first-person-slide.js';
import {createPlayerSlide} from './player-slide.js';
const camera=new THREE.PerspectiveCamera();const legs=createFirstPersonSlide(camera);const slide=createPlayerSlide();slide.start(.3,12,true);
for(let i=0;i<60;i++)legs.update(1/60,{visible:true,active:true,heading:slide.state().heading});
camera.updateMatrixWorld(true);const q=legs.root.getWorldQuaternion(new THREE.Quaternion());const p=legs.root.getWorldPosition(new THREE.Vector3());
for(const [yaw,pitch]of [[.8,.4],[-1.2,-.5],[3,.7]]){
 camera.rotation.set(pitch,yaw,0,'YXZ');legs.update(0,{visible:true,active:true,heading:slide.state().heading});camera.updateMatrixWorld(true);
 assert(legs.root.getWorldQuaternion(new THREE.Quaternion()).angleTo(q)<1e-6,'leg orientation stays locked while looking');
 assert(legs.root.getWorldPosition(new THREE.Vector3()).distanceTo(p)<1e-6,'leg anchor stays fixed while looking');
}
const v=slide.update(.1,true);assert(Math.abs(v.x/v.z-Math.tan(.3))<1e-6,'look direction does not steer slide');
legs.update(.5,{visible:false,active:false});assert(!legs.state().visible);legs.reset();assert.equal(legs.state().weight,0);
console.log('PASS: independent slide heading and leg position across yaw/pitch, fixed velocity, visibility and reset');
