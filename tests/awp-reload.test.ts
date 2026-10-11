import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createNerfAwp,disposeAwp} from '../apps/client/src/multiplayer/weapons/awpModel.ts';
import {applyAwpReload} from '../apps/client/src/multiplayer/weapons/awpReload.ts';
test('refill brings ten darts from pocket to carrier, then hides the bundle',()=>{
 const model=createNerfAwp(),bundle=model.getObjectByName('pocket-darts')!,carrier=model.getObjectByName('left-dart-carrier')!;
 applyAwpReload(model,.24,0,10,true);assert(bundle.visible);assert(bundle.position.y<-.6);assert.equal((bundle.children[0] as THREE.InstancedMesh).count,10);assert.equal((carrier.children[0] as THREE.InstancedMesh).count,0);
 applyAwpReload(model,.65,0,10,true);assert(bundle.position.y>-.01);
 applyAwpReload(model,.73,0,10,true);assert(!bundle.visible);assert.equal((carrier.children[0] as THREE.InstancedMesh).count,10);
 applyAwpReload(model,0,10,0,false);assert(!bundle.visible);assert(!model.getObjectByName('reload-hand')!.visible);disposeAwp(model);
});
