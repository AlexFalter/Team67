import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {NerfDarts,createFoamDart} from '../apps/client/src/multiplayer/weapons/nerfDarts.ts';
import {createNerfAwp,disposeAwp} from '../apps/client/src/multiplayer/weapons/awpModel.ts';
import type {AwpShot} from '../packages/shared/src/awp.ts';
test('foam dart flies then sticks to animated head and clears when target leaves',()=>{
 const scene=new THREE.Scene(),avatar=new THREE.Group(),head=new THREE.Group();head.name='head';head.position.y=1.57;avatar.add(head);scene.add(avatar);let present=true;
 const darts=new NerfDarts(scene,id=>id==='dummy'&&present?avatar:undefined),shot:AwpShot={roundStartedAt:1,from:'a',start:[0,1.6,-3],end:[0,1.6,-.2],target:'dummy',hit:true,attachment:{part:'head',offset:[0,.03,-.2],direction:[0,0,1]}};
 darts.launch(shot);darts.update(.04);const flying=scene.children.find(o=>o.name.includes('foam dart'))!;assert(flying);assert(flying.position.z>-3&&flying.position.z<-.2);darts.update(.2);assert.equal(head.children.length,1);const model=head.children[0];assert(model.name.includes('suction'));
 const before=model.getWorldPosition(new THREE.Vector3());avatar.position.x=5;head.rotation.y=.5;const after=model.getWorldPosition(new THREE.Vector3());assert(after.distanceTo(before)>4);present=false;darts.update(.01);assert.equal(head.children.length,0);darts.dispose();
});
test('Nerf model has removable dart magazine, priming bolt and foam colors; dart effects are bounded',()=>{
 const model=createNerfAwp();assert(model.getObjectByName('dart-magazine'));assert(model.getObjectByName('priming-bolt'));assert(model.getObjectByName('reload-hand'));disposeAwp(model);
 const dart=createFoamDart();assert.equal(dart.children.length,2);disposeAwp(dart);
 const scene=new THREE.Scene(),effects=new NerfDarts(scene,()=>undefined),shot:AwpShot={roundStartedAt:1,from:'a',start:[0,1,0],end:[1,1,0],target:'',hit:false};for(let i=0;i<60;i++)effects.launch(shot);assert.equal(scene.children.length,48);effects.update(2);assert.equal(scene.children.length,0);effects.dispose();
});
test('bolt cycle lifts, pulls back, pushes forward and locks; the hand follows the lever',async()=>{
 const {awpBoltFrame,applyAwpBoltCycle}=await import('../apps/client/src/multiplayer/weapons/awpBolt.ts');
 const model=createNerfAwp(),bolt=model.getObjectByName('priming-bolt')!,hand=model.getObjectByName('bolt-hand')!,trigger=model.getObjectByName('trigger-hand')!;
 assert(awpBoltFrame(.35).lift>.9);assert(awpBoltFrame(.67).pull>.99);assert(awpBoltFrame(1.25).pull<.01);
 applyAwpBoltCycle(model,.67);assert(bolt.position.z>.27);assert(bolt.rotation.z>.9);assert(hand.visible);assert(!trigger.visible);assert.equal(hand.position.z,bolt.position.z);
 applyAwpBoltCycle(model,1.4);assert.equal(bolt.position.z,.09);assert.equal(bolt.rotation.z,0);assert(!hand.visible);assert(trigger.visible);assert.equal(awpBoltFrame(-1).active,false);disposeAwp(model);
});
test('chamber loading takes a visible left-side dart, inserts it while bolt is open, and skips empty ammunition',async()=>{
 const {applyAwpBoltCycle}=await import('../apps/client/src/multiplayer/weapons/awpBolt.ts');const model=createNerfAwp(),dart=model.getObjectByName('chamber-dart')!,hand=model.getObjectByName('loading-hand')!,carrier=model.getObjectByName('left-dart-carrier')!;
 applyAwpBoltCycle(model,.5,9);assert.equal((carrier.children[0] as THREE.InstancedMesh).count,9);
 applyAwpBoltCycle(model,.64,9);assert(dart.visible);assert(hand.visible);assert(dart.position.x<0);assert.equal((carrier.children[0] as THREE.InstancedMesh).count,8);
 applyAwpBoltCycle(model,.96,9);assert(dart.visible);assert(Math.abs(dart.position.x-.07)<.01);assert(model.getObjectByName('open-chamber')!.visible);
 applyAwpBoltCycle(model,1.4,9);assert(!dart.visible);assert(!hand.visible);assert.equal((carrier.children[0] as THREE.InstancedMesh).count,8);
 applyAwpBoltCycle(model,.96,0);assert(!dart.visible);assert(!hand.visible);assert.equal((carrier.children[0] as THREE.InstancedMesh).count,0);disposeAwp(model);
});
