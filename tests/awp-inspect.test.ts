import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNerfAwp,disposeAwp} from '../apps/client/src/multiplayer/weapons/awpModel.ts';
import {applyAwpInspect} from '../apps/client/src/multiplayer/weapons/awpInspect.ts';
test('inspection starts on wall, turns blaster with support hand, and smoothly settles into ready pose',()=>{
 const model=createNerfAwp(),start=new THREE.Vector3(1,.2,-2),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2,0));
 assert(applyAwpInspect(model,0,start,rotation));assert(model.position.distanceTo(start)<1e-6);assert(model.quaternion.angleTo(rotation)<1e-6);
 applyAwpInspect(model,1.1,start,rotation);assert(model.getObjectByName('reload-hand')!.visible);assert(model.position.z>-.7);assert(Math.abs(model.rotation.y)>.1);
 applyAwpInspect(model,2.599,start,rotation);assert(model.position.distanceTo(new THREE.Vector3(.26,-.3,-.55))<.001);assert(model.quaternion.angleTo(new THREE.Quaternion())<.001);
 assert.equal(applyAwpInspect(model,2.6,start,rotation),false);disposeAwp(model);
});
