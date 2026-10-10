import * as THREE from 'three';
import assert from 'node:assert/strict';
import {createPassengerLook} from './passenger-look.js';
const look=createPassengerLook(),camera=new THREE.PerspectiveCamera();const view={eye:new THREE.Vector3(3,4,5),target:new THREE.Vector3(3,4,-1),up:new THREE.Vector3(0,1,0)};
look.sync('bus');look.apply(view,camera);let direction=camera.getWorldDirection(new THREE.Vector3());assert(direction.distanceTo(new THREE.Vector3(0,0,-1))<1e-8);
look.adjust(Math.PI/2,.3);look.apply(view,camera);direction=camera.getWorldDirection(new THREE.Vector3());assert(direction.x<-.9&&direction.y>.2);assert(camera.position.equals(view.eye));look.adjust(Math.PI*4,50);assert.equal(look.state().pitch,1.25);assert(look.state().yaw>Math.PI*4,'full horizontal look is possible');look.sync('polybahn');assert.equal(look.state().yaw,0);
const incline=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.2);const rail={eye:view.eye,target:view.eye.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(incline)),up:view.up.clone().applyQuaternion(incline)};look.apply(rail,camera);assert(camera.getWorldDirection(new THREE.Vector3()).distanceTo(rail.target.clone().sub(rail.eye))<1e-8);assert(camera.up.distanceTo(rail.up)<1e-8);
look.update(.5,new Set(['ArrowLeft','ArrowUp']));assert(look.state().yaw>.8&&look.state().pitch>.6);look.sync(null);assert(!look.active());assert.equal(look.state().pitch,0);console.log('PASS: cabin-relative free look, fixed eye position, full yaw, pitch limits, arrow controls, incline alignment and clean transition reset.');
