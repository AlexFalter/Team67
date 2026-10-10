import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import fs from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
// @ts-expect-error The copied prototype rig is JavaScript.
import { createStudent } from "../apps/client/src/npcPrototype/src/player/student-model.js";
// @ts-expect-error The adapter operates on the prototype's JavaScript rigs.
import { batchNpc, batchStaticNpc, skinNpcRigs } from "../apps/client/src/npcPrototype/batch.js";

test("NPC skin batching preserves original joint transforms while drawing one character mesh",()=>{
  const scene=new THREE.Scene(),rig=createStudent(),actor:THREE.Group=rig.player;
  actor.position.set(14,9,-40);actor.rotation.y=.8;scene.add(actor);
  const controllers=new Map<THREE.Object3D,()=>void>();batchNpc(actor);
  const sourceMeshes:THREE.Mesh[]=[];actor.traverse(o=>{if(o instanceof THREE.Mesh&&o.visible)sourceMeshes.push(o);});
  skinNpcRigs(actor,controllers);
  const skin=actor.children.find(o=>o instanceof THREE.SkinnedMesh) as THREE.SkinnedMesh;
  assert.ok(skin);assert.equal(controllers.size,1);
  actor.position.add(new THREE.Vector3(11,2,15));actor.rotation.y=-.5;
  rig.limbs[0].rotation.x=-1;rig.elbows[0].rotation.x=.7;rig.knees[1].rotation.x=.4;
  controllers.get(actor)!();scene.updateMatrixWorld(true);skin.skeleton.update();
  const indices=skin.geometry.getAttribute("skinIndex"),positions=skin.geometry.getAttribute("position");
  for(let bone=0;bone<sourceMeshes.length;bone++){
    let index=0;while(indices.getX(index)!==bone&&index<positions.count)index++;
    assert.ok(index<positions.count);
    const source=sourceMeshes[bone],vertex=source.geometry.index?.getX(0)??0;
    const expected=source.localToWorld(new THREE.Vector3().fromBufferAttribute(source.geometry.getAttribute("position"),vertex));
    const actual=skin.localToWorld(skin.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)));
    assert.ok(actual.distanceTo(expected)<1e-4,`bone ${bone} changed the prototype pose`);
  }
  assert.ok(sourceMeshes.every(source=>!source.layers.test(new THREE.Layers())));
  skin.geometry.dispose();skin.material instanceof THREE.Material&&skin.material.dispose();
});

test("Einstein and his portal retain native bounds and emissive materials with at most nine mesh draws",async()=>{
  for(const file of ["einstein","einstein-teleporter"]){
    const bytes=await fs.readFile(`apps/client/public/models/npcs/${file}.glb`);
    const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,"")).scene;
    model.position.set(31,8,72);model.rotation.y=.7;model.updateMatrixWorld(true);
    const before=new THREE.Box3().setFromObject(model,true);batchStaticNpc(model);model.updateMatrixWorld(true);
    const visible:THREE.Mesh[]=[];model.traverse(o=>{if(o instanceof THREE.Mesh&&o.visible)visible.push(o);});
    assert.ok(visible.length<=5,`${file} still renders its individual Blender nodes`);
    const after=new THREE.Box3();for(const mesh of visible)after.union(new THREE.Box3().setFromObject(mesh,true));
    assert.ok(before.min.distanceTo(after.min)<1e-4&&before.max.distanceTo(after.max)<1e-4,`${file}: ${before.min.distanceTo(after.min)}, ${before.max.distanceTo(after.max)}`);
    if(file.endsWith("teleporter"))assert.ok(visible.some(mesh=>(mesh.material as THREE.MeshStandardMaterial).emissive.getHex()>0));
  }
});
